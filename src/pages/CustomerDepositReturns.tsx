"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

const CustomerDepositReturns = () => {
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
      <PageTitle title="Customer Deposit Returns - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <DollarSign className="mr-2 h-6 w-6" /> Customer Deposit Returns
          </CardTitle>
          <CardDescription>
            This page will manage customer deposit returns. Feature coming soon!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground mt-8">
            Content for managing customer deposit returns will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerDepositReturns;