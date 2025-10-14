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

// Create the context
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

  // Helper to determine combined approval status
  const getCombinedApprovalStatus = (authUser: User | null, profile: Profile | null): boolean => {
    const isEmailConfirmed = !!authUser?.email_confirmed_at;
    const isProfileApproved = profile?.is_approved ?? false;
    return isEmailConfirmed && isProfileApproved;
  };

  useEffect(() => {
    const loadSessionAndProfile = async () => {
      console.log("SessionContext: Starting initial session and profile load.");
      setIsLoading(true);

      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("SessionContext: Error getting initial session:", sessionError);
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setIsApproved(false);
      } else {
        setSession(initialSession);
        const authUser = initialSession?.user || null;
        setUser(authUser);

        if (authUser) {
          const profile = await fetchUserProfile(authUser.id);
          setUserProfile(profile);
          setIsApproved(getCombinedApprovalStatus(authUser, profile));
          console.log("SessionContext: Initial profile loaded - Role:", profile?.role, "Country:", profile?.country, "Email Confirmed:", !!authUser.email_confirmed_at, "Profile Approved:", profile?.is_approved);
        } else {
          setUserProfile(null);
          setIsApproved(false);
        }
      }
      setIsLoading(false);
      console.log("SessionContext: Initial session and profile load complete. isLoading set to false.");
    };

    loadSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log("SessionContext: Auth state changed (listener). Event:", _event, "Session:", currentSession);
      setSession(currentSession);
      const authUser = currentSession?.user || null;
      setUser(authUser); // This will trigger the next useEffect
      if (!authUser) {
        setUserProfile(null);
        setIsApproved(false);
      }
    });

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener.");
      subscription.unsubscribe();
    };
  }, []);

  // Separate useEffect to update profile and approval status when user changes
  useEffect(() => {
    const updateProfileAndApproval = async () => {
      if (user) {
        const profile = await fetchUserProfile(user.id);
        setUserProfile(profile);
        setIsApproved(getCombinedApprovalStatus(user, profile)); // Use combined status
        console.log("SessionContext: User changed, profile updated - Role:", profile?.role, "Country:", profile?.country, "Email Confirmed:", !!user.email_confirmed_at, "Profile Approved:", profile?.is_approved);
      } else {
        setUserProfile(null);
        setIsApproved(false);
      }
    };
    if (!isLoading) {
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