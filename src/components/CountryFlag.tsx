"use client";

import React from 'react';

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
  const flagUrl = countryCode ? `https://flagcdn.com/w20/${countryCode}.png` : null; // Using w20 for 20px width

  if (!flagUrl) {
    return <span className={className} role="img" aria-label={countryName}>🌐</span>; // Fallback to globe emoji
  }

  return (
    <img
      src={flagUrl}
      alt={`${countryName} flag`}
      className={`w-6 h-6 rounded-full object-cover ${className || ''}`} // Fixed size and rounded for favicon style
      style={{ border: '1px solid #e5e7eb' }} // Subtle border for better visibility
    />
  );
};

export default CountryFlag;