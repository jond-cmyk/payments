"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { Profile } from '@/types/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const queryClient = useQueryClient();

  // Fetch user profile using useQuery
  const { data: userProfileData, isLoading: isLoadingProfile } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
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
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const userProfile: Profile | null = userProfileData;

  // Determine combined approval status
  const isApproved = useMemo(() => {
    if (!user || !userProfile) {
      return false;
    }
    return userProfile.is_approved ?? false;
  }, [user, userProfile]);

  // Effect for initial session load and auth state changes
  useEffect(() => {
    const loadInitialSession = async () => {
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
    };

    loadInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user || null);
      if (currentSession?.user) {
        queryClient.invalidateQueries({ queryKey: ['userProfile', currentSession.user.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      }
    });

    const refreshSession = async () => {
      await supabase.auth.refreshSession();
    };

    const intervalId = setInterval(refreshSession, SESSION_REFRESH_INTERVAL);

    return () => {
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [queryClient]);

  const isLoading = isLoadingSession || isLoadingProfile;

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