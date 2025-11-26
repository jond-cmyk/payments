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
  { value: 'all', label: 'All Countries' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  // Add more countries as needed
].sort((a, b) => {
  if (a.value === 'all') return -1;
  if (b.value === 'all') return 1;
  return a.label.localeCompare(b.label);
});

export const CountryProvider = ({ children }: { children: React.ReactNode }) => {
  const { userProfile, isLoading: isSessionLoading } = useSession();
  // Initialize currentCountry to an empty string, let useEffect set the actual value
  const [currentCountry, setCurrentCountryState] = useState<string>('');
  const [isCountryLocked, setIsCountryLocked] = useState(false);

  // Effect to set initial country based on user role and profile
  useEffect(() => {
    if (!isSessionLoading) {
      if (userProfile) {
        // Requester AND Sales roles are locked to their assigned country
        if ((userProfile.role === 'requester' || userProfile.role === 'sales') && userProfile.country) {
          setCurrentCountryState(userProfile.country);
          localStorage.setItem('currentCountry', userProfile.country);
          setIsCountryLocked(true);
        } else if (userProfile.role === 'admin') {
          // Admin logic: Default to 'all' on login
          const storedCountry = localStorage.getItem('currentCountry');
          if (storedCountry === 'all') {
            setCurrentCountryState('all');
          } else {
            setCurrentCountryState('all');
            localStorage.setItem('currentCountry', 'all');
          }
          setIsCountryLocked(false);
        }
      } else {
        // If no user profile, default to Switzerland
        setCurrentCountryState('Switzerland');
        localStorage.setItem('currentCountry', 'Switzerland');
        setIsCountryLocked(false);
      }
    }
  }, [isSessionLoading, userProfile]);

  // This effect ensures that any *subsequent* changes to currentCountry
  // are persisted to localStorage.
  useEffect(() => {
    if (currentCountry) {
      localStorage.setItem('currentCountry', currentCountry);
    }
  }, [currentCountry]);

  // Wrapper for setCurrentCountryState to respect isCountryLocked
  const handleSetCurrentCountry = useCallback((country: string) => {
    // Only allow change if not locked OR if the user is an admin
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