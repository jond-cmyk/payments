"use client";

import React from 'react';

interface CountryFlagProps {
  countryName: string;
  className?: string;
}

const countryToEmojiMap: Record<string, string> = {
  'Switzerland': '🇨🇭',
  'United Kingdom': '🇬🇧',
  // Add more country-to-emoji mappings as needed
};

const CountryFlag: React.FC<CountryFlagProps> = ({ countryName, className }) => {
  const emoji = countryToEmojiMap[countryName] || '🌐'; // Default to globe if no flag found

  return (
    <span className={className} role="img" aria-label={countryName}>
      {emoji}
    </span>
  );
};

export default CountryFlag;