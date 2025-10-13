"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from './SessionContext'; // Import useSession

interface CountryContextType {
  currentCountry: string;
  setCurrentCountry: (country: string) => void;
  availableCountries: { value: string; label: string }[];
  isCountryLocked: boolean; // To indicate if the country selector should be disabled for requesters
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

// Define available countries, including 'All Countries'
const defaultAvailableCountries = [
  { value: 'all', label: 'All Countries' }, // New 'All Countries' option
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  // Add more countries as needed
];

export const CountryProvider = ({ children }: { children: React.ReactNode }) => {
  const { userProfile, isLoading: isSessionLoading } = useSession();
  const [currentCountry, setCurrentCountryState] = useState<string>(() => {
    // Initialize from localStorage or default to 'Switzerland'
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentCountry') || 'Switzerland';
    }
    return 'Switzerland';
  });
  const [isCountryLocked, setIsCountryLocked] = useState(false);

  // Update currentCountry in localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentCountry', currentCountry);
    }
  }, [currentCountry]);

  // Logic to set initial country based on user role and profile
  useEffect(() => {
    if (!isSessionLoading && userProfile) {
      if (userProfile.role === 'requester' && userProfile.country) {
        // Requester is locked to their assigned country
        setCurrentCountryState(userProfile.country);
        setIsCountryLocked(true);
      } else if (userProfile.role === 'admin') {
        // Admin can select, default to localStorage or 'all' if not set
        const storedCountry = localStorage.getItem('currentCountry');
        setCurrentCountryState(storedCountry || 'all'); // Admins default to 'all' if no country is stored
        setIsCountryLocked(false); // Admins are NOT locked to a country
      }
    } else if (!isSessionLoading && !userProfile) {
      // If no user profile (e.g., not logged in or profile error), default to Switzerland
      setCurrentCountryState('Switzerland');
      setIsCountryLocked(false); // Allow selection if no user is logged in (e.g., for testing)
    }
  }, [isSessionLoading, userProfile]);

  // Wrapper for setCurrentCountryState to respect isCountryLocked for requesters
  const handleSetCurrentCountry = useCallback((country: string) => {
    // Only allow change if not locked OR if the user is an admin (admins are never locked by this context)
    if (!isCountryLocked || userProfile?.role === 'admin') {
      setCurrentCountryState(country);
    }
  }, [isCountryLocked, userProfile?.role]);

  return (
    <CountryContext.Provider
      value={{
        currentCountry,
        setCurrentCountry: handleSetCurrentCountry,
        availableCountries: defaultAvailableCountries,
        isCountryLocked,
      }}
    >
      {children}
    </CountryContext.Provider>
  );
};

export const useCountry = () => {
  const context = useContext(CountryContext);
  if (context === undefined) {
    throw new Error('useCountry must be used within a CountryProvider');
  }
  return context;
};