"use client";

import React from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Banknote } from 'lucide-react';
import PageTitle from '@/components/PageTitle';

const DirectDebits = () => {
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
      <PageTitle title="Direct Debits - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Banknote className="mr-2 h-6 w-6" /> Direct Debits
          </CardTitle>
          <CardDescription>
            Manage your direct debits here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This page is under construction. Check back soon for direct debit management features!
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DirectDebits;