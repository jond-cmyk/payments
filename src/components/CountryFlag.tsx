"use client";

import React from 'react';
import { cn } from '@/lib/utils'; // Import cn for utility classes

interface CountryFlagProps {
  countryName: string;
  className?: string;
}

// Map country names to their ISO 2-letter codes for the flag CDN
const countryCodeMap: Record<string, string> = {
  'Switzerland': 'ch',
  'United Kingdom': 'gb',
  // Add more country-to-code mappings as needed
};

const CountryFlag: React.FC<CountryFlagProps> = ({ countryName, className }) => {
  const countryCode = countryCodeMap[countryName]?.toLowerCase();
  const flagUrl = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null; // Changed to w40 for higher resolution

  if (!flagUrl) {
    return <span className={cn(className)} role="img" aria-label={countryName}>🌐</span>; // Fallback to globe emoji
  }

  return (
    <img
      src={flagUrl}
      alt={`${countryName} flag`}
      className={cn(
        `w-6 h-6 rounded-full object-cover border border-white`, // Added white border
        className
      )}
    />
  );
};

export default CountryFlag;