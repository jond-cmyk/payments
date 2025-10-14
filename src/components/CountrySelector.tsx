"use client";

import React from 'react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CountryFlag from './CountryFlag';
import { cn } from '@/lib/utils';
import { useSession } from '@/integrations/supabase/SessionContext';

interface CountrySelectorProps {
  className?: string;
  triggerClassName?: string; // New prop for SelectTrigger styling
  value?: string; // Added value prop
  onValueChange?: (value: string) => void; // Added onValueChange prop
  availableCountries?: { value: string; label: string }[]; // Added availableCountries prop
  disabled?: boolean; // ADDED: disabled prop
}

const CountrySelector: React.FC<CountrySelectorProps> = ({ className, triggerClassName, value, onValueChange, availableCountries, disabled }) => {
  const { currentCountry, setCurrentCountry, availableCountries: contextAvailableCountries, isCountryLocked } = useCountry();
  const { userProfile } = useSession();

  // Use props.value and props.onValueChange if provided, otherwise use context
  const selectedCountry = value !== undefined ? value : currentCountry;
  const handleCountryChange = onValueChange !== undefined ? onValueChange : setCurrentCountry;
  const countriesToDisplay = availableCountries !== undefined ? availableCountries : contextAvailableCountries;

  // Combine internal disabled state with external disabled prop
  const isDisabled = disabled || (isCountryLocked && userProfile?.role !== 'admin');

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-2">
            <Select
              value={selectedCountry}
              onValueChange={handleCountryChange}
              disabled={isDisabled}
            >
              <SelectTrigger className={cn(
                "w-max bg-dyad-blue text-dyad-blue-foreground hover:bg-dyad-blue-light transition-colors flex items-center gap-2 px-3 py-2 rounded-md shadow-md border-none",
                triggerClassName // Apply the new triggerClassName here
              )}>
                <SelectValue> {/* SelectValue is now always the direct child */}
                  {selectedCountry !== 'all' ? (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <CountryFlag countryName={selectedCountry} className="flex-shrink-0" />
                      <span className="font-semibold text-base">{selectedCountry}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-base flex items-center gap-2 whitespace-nowrap">🌐 All Countries</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent 
                className="bg-popover text-popover-foreground w-auto min-w-[300px] max-w-none overflow-visible"
              >
                {countriesToDisplay.map((country) => (
                  <SelectItem 
                    key={country.value} 
                    value={country.value} 
                    className="w-full min-w-max"
                  >
                    <div className="flex items-center gap-2 flex-nowrap w-full justify-center"> {/* Added justify-center */}
                      {country.value !== 'all' ? (
                        <CountryFlag countryName={country.value} className="flex-shrink-0" />
                      ) : (
                        <span className="text-lg flex-shrink-0">🌐</span>
                      )}
                      <span className="whitespace-nowrap flex-shrink-0">{country.label}</span>
                    </div>
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