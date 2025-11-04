"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { showError } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { extractList } from '@/components/economic/EconomicDetailDialog';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import CountrySelector from '@/components/CountrySelector';
import { Building2, RotateCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type EconomicDepartment = {
  departmentNumber: number;
  name: string;
  self: string;
};

const AdminDepartments = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  const { data: departments, isLoading: isDepartmentsLoading, error: departmentsError, refetch } = useQuery<EconomicDepartment[]>({
    queryKey: ['economicDepartments', currentCountry],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/departments?pagesize=1000", method: "GET", country: currentCountry },
      });

      if (error) throw new Error(error.message);
      
      const resp = data as { ok?: boolean; status?: number; data?: any; error?: string };
      if (resp.error || !resp.ok) {
        throw new Error(resp.error || `Failed to fetch departments: Status ${resp.status}`);
      }

      return extractList(resp?.data) as EconomicDepartment[];
    },
    enabled: !!session && isAdmin,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  if (departmentsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading departments: {departmentsError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Departments - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="flex items-center text-2xl font-bold">
              <Building2 className="mr-2 h-6 w-6" /> E-conomic Departments
            </CardTitle>
            <div className="flex items-center gap-4">
              <CountrySelector />
              <Button variant="outline" onClick={() => refetch()} disabled={isDepartmentsLoading}>
                <RotateCw className={`mr-2 h-4 w-4 ${isDepartmentsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          <CardDescription>
            List of all departments from the e-conomic integration for the selected country. Data is refreshed daily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Department Number</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isDepartmentsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : departments && departments.length > 0 ? (
                  departments.map((dept) => (
                    <TableRow key={dept.departmentNumber}>
                      <TableCell className="font-medium">{dept.departmentNumber}</TableCell>
                      <TableCell>{dept.name}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No departments found for the selected country.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDepartments;