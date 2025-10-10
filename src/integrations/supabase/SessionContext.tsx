"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { Profile } from '@/types/supabase'; // Import Profile type

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isApproved: boolean | null; // Add isApproved to context
  userProfile: Profile | null; // Add userProfile to context
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproved, setIsApproved] = useState<boolean | null>(null); // State for approval status
  const [userProfile, setUserProfile] = useState<Profile | null>(null); // State for full profile

  useEffect(() => {
    const fetchUserProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error("SessionContext: Error fetching user profile:", error);
        return null;
      }
      return data;
    };

    const handleAuthStateChange = async (_event: string, currentSession: Session | null) => {
      console.log("SessionContext: Auth state changed. Event:", _event, "Session:", currentSession);
      setSession(currentSession);
      setUser(currentSession?.user || null);

      if (currentSession?.user) {
        const profile = await fetchUserProfile(currentSession.user.id);
        setUserProfile(profile);
        setIsApproved(profile?.is_approved ?? false); // Set isApproved based on profile
      } else {
        setUserProfile(null);
        setIsApproved(false);
      }
      setIsLoading(false);
    };

    console.log("SessionContext: Initializing auth state listener.");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      console.log("SessionContext: Initial getSession result:", initialSession);
      await handleAuthStateChange('INITIAL_SESSION', initialSession); // Process initial session
    });

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener.");
      subscription.unsubscribe();
    };
  }, []);

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