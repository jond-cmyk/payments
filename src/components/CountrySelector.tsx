"use client";

import React from 'react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CountryFlag from './CountryFlag'; // Import the new CountryFlag component
import { cn } from '@/lib/utils'; // Import cn for conditional class names

interface CountrySelectorProps {
  className?: string;
}

const CountrySelector: React.FC<CountrySelectorProps> = ({ className }) => {
  const { currentCountry, setCurrentCountry, availableCountries, isCountryLocked } = useCountry();

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-2">
            <Select
              value={currentCountry}
              onValueChange={setCurrentCountry}
              disabled={isCountryLocked}
            >
              <SelectTrigger className="w-[180px] bg-background text-foreground border-border hover:bg-muted/50 transition-colors flex items-center gap-2">
                <CountryFlag countryName={currentCountry} className="text-lg" />
                <SelectValue placeholder="Select Country" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                {availableCountries.map((country) => (
                  <SelectItem key={country.value} value={country.value} className="flex items-center gap-2">
                    <CountryFlag countryName={country.value} className="text-lg" />
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isCountryLocked ? (
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