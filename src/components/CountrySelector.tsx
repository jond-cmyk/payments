"use client";

import React from 'react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CountryFlag from './CountryFlag'; // Import the new CountryFlag component
import { cn } from '@/lib/utils'; // Import cn for conditional class names
import { useSession } from '@/integrations/supabase/SessionContext'; // Import useSession

interface CountrySelectorProps {
  className?: string;
}

const CountrySelector: React.FC<CountrySelectorProps> = ({ className }) => {
  const { currentCountry, setCurrentCountry, availableCountries, isCountryLocked } = useCountry();
  const { userProfile } = useSession(); // Get userProfile to check role

  // Determine if the selector should be disabled.
  // It's disabled if isCountryLocked (for requesters) OR if the user is not an admin.
  // Admins should always be able to change the country in the selector.
  const isDisabled = isCountryLocked && userProfile?.role !== 'admin';

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-2">
            <Select
              value={currentCountry}
              onValueChange={setCurrentCountry}
              disabled={isDisabled} // Use the new isDisabled logic
            >
              <SelectTrigger className="w-[240px] bg-dyad-blue text-dyad-blue-foreground border-dyad-blue-foreground hover:bg-dyad-blue-light transition-colors flex items-center gap-2 px-3 py-2 rounded-md shadow-md">
                {currentCountry !== 'all' ? (
                  <>
                    <CountryFlag countryName={currentCountry} className="text-xl" />
                    <span className="font-semibold text-base">{currentCountry}</span>
                  </>
                ) : (
                  <span className="font-semibold text-base flex items-center gap-2">🌐 All Countries</span>
                )}
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                {availableCountries.map((country) => (
                  <SelectItem key={country.value} value={country.value} className="flex items-center gap-2">
                    {country.value !== 'all' ? (
                      <CountryFlag countryName={country.value} className="text-lg" />
                    ) : (
                      <span className="text-lg">🌐</span>
                    )}
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isDisabled ? (
            <span>Your country is set by your profile and cannot be changed.</span>
          ) : (
            <span>Select the active country for the application.</span>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default CountrySelector;