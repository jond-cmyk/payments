"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from './SessionContext'; // Import useSession

interface CountryContextType {
  currentCountry: string;
  setCurrentCountry: (country: string) => void;
  availableCountries: { value: string; label: string }[];
  isCountryLocked: boolean; // To indicate if the country selector should be disabled
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

// Define available countries
const defaultAvailableCountries = [
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
        // Admin can select, but default to localStorage or 'Switzerland'
        // If localStorage is empty, it will already be 'Switzerland' by initial state
        setIsCountryLocked(false);
      }
    } else if (!isSessionLoading && !userProfile) {
      // If no user profile (e.g., not logged in or profile error), default to Switzerland
      setCurrentCountryState('Switzerland');
      setIsCountryLocked(false); // Allow selection if no user is logged in (e.g., for testing)
    }
  }, [isSessionLoading, userProfile]);

  // Wrapper for setCurrentCountryState to respect isCountryLocked
  const handleSetCurrentCountry = useCallback((country: string) => {
    if (!isCountryLocked) {
      setCurrentCountryState(country);
    }
  }, [isCountryLocked]);

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