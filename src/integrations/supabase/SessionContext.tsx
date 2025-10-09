"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("SessionContext: Initializing auth state listener.");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("SessionContext: Auth state changed. Event:", _event, "Session:", session);
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("SessionContext: Initial getSession result:", session);
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
    });

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener.");
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, user, isLoading }}>
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