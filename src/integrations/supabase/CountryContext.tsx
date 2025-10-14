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
  // Initialize currentCountry to an empty string, let useEffect set the actual value
  const [currentCountry, setCurrentCountryState] = useState<string>('');
  const [isCountryLocked, setIsCountryLocked] = useState(false);

  // Effect to set initial country based on user role and profile
  useEffect(() => {
    if (!isSessionLoading) {
      if (userProfile) {
        if (userProfile.role === 'requester' && userProfile.country) {
          // Requester is locked to their assigned country
          setCurrentCountryState(userProfile.country);
          localStorage.setItem('currentCountry', userProfile.country); // Ensure requester's country is always in local storage
          setIsCountryLocked(true);
        } else if (userProfile.role === 'admin') {
          // Admin logic: Default to 'all' on login, overriding any specific country left by a requester.
          // If 'all' was explicitly stored by an admin, respect that.
          const storedCountry = localStorage.getItem('currentCountry');
          if (storedCountry === 'all') {
            setCurrentCountryState('all');
          } else {
            // This covers cases where storedCountry is null/undefined or a specific country (e.g., 'Switzerland')
            // For admins, we always default to 'all' on login if not already 'all'.
            setCurrentCountryState('all');
            localStorage.setItem('currentCountry', 'all'); // Persist this 'all' default
          }
          setIsCountryLocked(false); // Admins are NOT locked to a country
        }
      } else {
        // If no user profile (e.g., not logged in or profile error), default to Switzerland
        setCurrentCountryState('Switzerland');
        localStorage.setItem('currentCountry', 'Switzerland'); // Persist this default
        setIsCountryLocked(false); // Allow selection if no user is logged in (e.g., for testing)
      }
    }
  }, [isSessionLoading, userProfile]);

  // This effect ensures that any *subsequent* changes to currentCountry (via handleSetCurrentCountry)
  // are persisted to localStorage.
  useEffect(() => {
    if (currentCountry) { // Only save if currentCountry is not empty
      localStorage.setItem('currentCountry', currentCountry);
    }
  }, [currentCountry]);

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