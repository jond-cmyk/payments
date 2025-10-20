"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { Profile } from '@/types/supabase'; // Import Profile type
import { useQuery, useQueryClient } from '@tanstack/react-query'; // NEW IMPORT

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isApproved: boolean | null;
  userProfile: Profile | null;
}

// Create the context
const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Interval for manual session refresh (5 minutes)
const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000; 

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true); // Renamed to avoid conflict with useQuery's isLoading
  const queryClient = useQueryClient(); // NEW: Initialize queryClient

  // Fetch user profile using useQuery
  const { data: userProfileData, isLoading: isLoadingProfile, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id], // Query key depends on user ID
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error("SessionContext: Error fetching user profile:", error);
        return null;
      }
      console.log(`[SessionContext] Fetched profile for user ${user.id}:`, data);
      return data;
    },
    enabled: !!user?.id, // Only run query if user ID is available
    staleTime: 5 * 60 * 1000, // Profile data can be considered fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (renamed from cacheTime)
  });

  // Explicitly type userProfile from the query data
  const userProfile: Profile | null = userProfileData;

  // Determine combined approval status
  const isApproved = useMemo(() => {
    if (!user || !userProfile) {
      console.log(`[SessionContext] isApproved: No user or profile. Result: false`);
      return false;
    }
    const isProfileApproved = userProfile.is_approved ?? false; // Use userProfile directly
    console.log(`[SessionContext] isApproved: User ${user.id}. Profile approved: ${isProfileApproved}. Result: ${isProfileApproved}`);
    return isProfileApproved;
  }, [user, userProfile]);

  // Effect for initial session load and auth state changes
  useEffect(() => {
    const loadInitialSession = async () => {
      console.log("SessionContext: Starting initial session load.");
      setIsLoadingSession(true);

      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("SessionContext: Error getting initial session:", sessionError);
        setSession(null);
        setUser(null);
      } else {
        setSession(initialSession);
        setUser(initialSession?.user || null);
      }
      setIsLoadingSession(false);
      console.log("SessionContext: Initial session load complete. isLoadingSession set to false.");
    };

    loadInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log("SessionContext: Auth state changed (listener). Event:", _event, "Session:", currentSession);
      setSession(currentSession);
      setUser(currentSession?.user || null);
      // When auth state changes, invalidate the userProfile query to ensure it refetches
      if (currentSession?.user) {
        queryClient.invalidateQueries({ queryKey: ['userProfile', currentSession.user.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['userProfile'] }); // Invalidate all profiles if user logs out
      }
    });

    // --- Periodic Session Refresh ---
    // NOTE: Removed 'session' from dependency array to prevent infinite loop.
    // We rely on supabase.auth.refreshSession() to handle the token logic internally.
    const refreshSession = async () => {
      // We don't need to check if (session) here, as supabase.auth.refreshSession() handles the token logic.
      console.log("[SessionContext] Attempting periodic session refresh...");
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn("[SessionContext] Periodic refresh failed (might be expired or network issue):", error.message);
      } else {
        console.log("[SessionContext] Periodic refresh successful.");
      }
    };

    const intervalId = setInterval(refreshSession, SESSION_REFRESH_INTERVAL);
    // --------------------------------

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener and clearing refresh interval.");
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [queryClient]); // Dependency array now only contains stable values

  const isLoading = isLoadingSession || isLoadingProfile; // Combined loading state

  return (
    <SessionContext.Provider value={{ session, user, isLoading, isApproved, userProfile }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};