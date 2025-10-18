"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Home } from 'lucide-react'; // Using Home icon as a placeholder for property

const PropertyReports = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Property Reports - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Property Reports
          </CardTitle>
          <CardDescription>
            This page will provide various reports related to properties. Feature coming soon!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground mt-8">
            Content for property reports will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PropertyReports;