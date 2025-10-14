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

// Function to fetch user profile
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

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true
  const [isApproved, setIsApproved] = useState<boolean | null>(null); // State for approval status
  const [userProfile, setUserProfile] = useState<Profile | null>(null); // State for full profile

  useEffect(() => {
    const loadSessionAndProfile = async () => {
      console.log("SessionContext: Starting initial session and profile load.");
      setIsLoading(true); // Ensure loading is true at the start of this process

      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("SessionContext: Error getting initial session:", sessionError);
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setIsApproved(false);
      } else {
        setSession(initialSession);
        setUser(initialSession?.user || null);

        if (initialSession?.user) {
          const profile = await fetchUserProfile(initialSession.user.id);
          setUserProfile(profile);
          setIsApproved(profile?.is_approved ?? false);
          console.log("SessionContext: Initial profile loaded - Role:", profile?.role, "Country:", profile?.country); // NEW LOG
        } else {
          setUserProfile(null);
          setIsApproved(false);
        }
      }
      setIsLoading(false); // Set loading to false only after all initial data is processed
      console.log("SessionContext: Initial session and profile load complete. isLoading set to false.");
    };

    loadSessionAndProfile();

    // Set up real-time auth state listener for subsequent changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log("SessionContext: Auth state changed (listener). Event:", _event, "Session:", currentSession);
      // For subsequent changes, we'll just update session/user here.
      // The separate useEffect below will handle profile and approval status updates.
      setSession(currentSession);
      setUser(currentSession?.user || null);
      if (!currentSession?.user) {
        setUserProfile(null);
        setIsApproved(false);
      }
    });

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener.");
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array for this useEffect

  // Separate useEffect to update profile and approval status when user changes
  useEffect(() => {
    const updateProfileAndApproval = async () => {
      if (user) {
        const profile = await fetchUserProfile(user.id);
        setUserProfile(profile);
        setIsApproved(profile?.is_approved ?? false);
        console.log("SessionContext: User changed, profile updated - Role:", profile?.role, "Country:", profile?.country); // NEW LOG
      } else {
        setUserProfile(null);
        setIsApproved(false);
      }
    };
    // Only run this if not during the initial loading phase
    if (!isLoading) { // Ensure initial load is complete before reacting to user changes
      updateProfileAndApproval();
    }
  }, [user, isLoading]); // Depend on user and isLoading

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