"use client";

import React from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <p className="text-lg text-gray-700">Welcome, {user?.email}! This is your dashboard.</p>
      <p className="text-md text-gray-500 mt-2">Your role: {user?.user_metadata?.role || 'requester'}</p>
      <div className="mt-8">
        <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
          Create New Payment Request
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;