"use client";

import React, { useEffect, useState } from 'react';
import { useDepartments } from '@/hooks/useDepartments';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface PropertyAddressFieldProps {
  skuValue: string | undefined | null;
  country: string;
}

const PropertyAddressField: React.FC<PropertyAddressFieldProps> = ({ skuValue, country }) => {
  const [address, setAddress] = useState<string>('Enter a valid SKU to see the address.');
  const { data: departments, isLoading, error } = useDepartments(country);

  useEffect(() => {
    if (country !== 'Switzerland') {
      return; // Don't do anything if not in Switzerland
    }

    if (!skuValue) {
      setAddress('Enter a valid SKU to see the address.');
      return;
    }

    if (isLoading) {
      setAddress('Loading property addresses...');
      return;
    }

    if (error) {
      setAddress('Error loading property addresses.');
      console.error("Error fetching departments for address lookup:", error);
      return;
    }

    const numericSku = parseInt(skuValue.replace(/\D/g, ''), 10);
    if (isNaN(numericSku)) {
      setAddress('Invalid SKU format.');
      return;
    }

    const department = departments?.find(d => d.departmentNumber === numericSku);
    setAddress(department ? department.name : 'No Address Found');

  }, [skuValue, country, departments, isLoading, error]);

  // Only render the component if the country is Switzerland
  if (country !== 'Switzerland') {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label>Property Address</Label>
      {isLoading && (!Array.isArray(departments) || departments.length === 0) ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <Input value={address} readOnly disabled className="bg-muted/50 cursor-default" />
      )}
    </div>
  );
};

export default PropertyAddressField;