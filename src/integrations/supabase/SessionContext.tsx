"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { Profile, UserPermissions, defaultPermissions } from '@/types/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isApproved: boolean | null;
  userProfile: Profile | null;
  hasPermission: (category: keyof UserPermissions, permission: string) => boolean;
}

// Create the context
const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Interval for manual session refresh (5 minutes)
const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000; 

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const queryClient = useQueryClient();

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
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const userProfile: Profile | null = userProfileData;

  // Determine combined approval status
  const isApproved = useMemo(() => {
    if (!user || !userProfile) {
      return false;
    }
    return userProfile.is_approved ?? false;
  }, [user, userProfile]);

  // Helper to check permissions
  const hasPermission = (category: keyof UserPermissions, permission: string): boolean => {
    if (!userProfile) return false;
    
    // Fallback for Admins if permissions are not yet migrated/set: Give full access
    if (userProfile.role === 'admin' && !userProfile.permissions) {
      return true;
    }

    // Fallback for Requesters if permissions are not yet migrated/set: Give basic support access
    if (userProfile.role === 'requester' && !userProfile.permissions) {
      // Grant basic support permissions by default for backward compatibility
      if (category === 'support') return true;
      return false;
    }

    const perms = userProfile.permissions || defaultPermissions;
    // @ts-ignore - we know the category exists from the keyof type, but TS might complain about the specific string key
    return !!perms[category]?.[permission];
  };

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
      if (currentSession?.user) {
        queryClient.invalidateQueries({ queryKey: ['userProfile', currentSession.user.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      }
    });

    const refreshSession = async () => {
      console.log("[SessionContext] Attempting periodic session refresh...");
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn("[SessionContext] Periodic refresh failed (might be expired or network issue):", error.message);
      } else {
        console.log("[SessionContext] Periodic refresh successful.");
      }
    };

    const intervalId = setInterval(refreshSession, SESSION_REFRESH_INTERVAL);

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener and clearing refresh interval.");
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [queryClient]);

  const isLoading = isLoadingSession || isLoadingProfile;

  return (
    <SessionContext.Provider value={{ session, user, isLoading, isApproved, userProfile, hasPermission }}>
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