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
      if (country === 'all') {
        console.warn("useDepartments hook called with 'all' country. Returning empty array as departments are country-specific.");
        return [];
      }

      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/departments?pagesize=1000", method: "GET", country },
      });

      if (error) throw new Error(error.message);
      
      const resp = data as { ok?: boolean; status?: number; data?: any; error?: string };
      if (resp.error || !resp.ok) {
        // Don't throw an error for 403, just return empty array and log a warning.
        if (resp.status === 403) {
          console.warn(`Permission denied for fetching departments for ${country}. Cannot show property address.`);
          return [];
        }
        throw new Error(resp.error || `Failed to fetch departments: Status ${resp.status}`);
      }

      return extractList(resp?.data) as EconomicDepartment[];
    },
    enabled: !!country, // Only run if country is provided
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });
};