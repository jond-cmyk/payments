"use client";

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractList } from '@/components/economic/EconomicDetailDialog';

type EconomicDepartment = {
  departmentNumber: number;
  name: string;
  self: string;
};

export const useDepartments = (country: string) => {
  return useQuery<EconomicDepartment[]>({
    queryKey: ['economicDepartments', country],
    queryFn: async () => {
      // Define the list of countries to fetch departments for.
      const countriesToFetch = country === 'all' 
        ? ['Switzerland', 'United Kingdom'] // Fetch all supported countries
        : [country]; // Fetch only the specified country

      // Create an array of promises to fetch departments for each country in parallel.
      const fetchPromises = countriesToFetch.map(async (c) => {
        if (c === 'all') return []; // Should not happen with this logic, but as a safeguard.

        const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: "/departments?pagesize=1000", method: "GET", country: c },
        });

        if (error) {
          console.error(`Failed to fetch departments for ${c}:`, error.message);
          return []; // Return empty array on error to not fail the whole process
        }
        
        const resp = data as { ok?: boolean; status?: number; data?: any; error?: string };
        if (resp.error || !resp.ok) {
          if (resp.status === 403) {
            console.warn(`Permission denied for fetching departments for ${c}. Cannot show property address.`);
          } else {
            console.error(`Failed to fetch departments for ${c}:`, resp.error || `Status ${resp.status}`);
          }
          return []; // Return empty array on non-OK response
        }

        return extractList(resp?.data) as EconomicDepartment[];
      });

      // Wait for all fetches to complete.
      const results = await Promise.all(fetchPromises);
      
      // Flatten the array of arrays into a single array of departments.
      return results.flat();
    },
    enabled: !!country, // Only run if country is provided
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });
};