"use client";

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const PendingApproval = () => {
  const { session, isLoading, isApproved } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        // If no session, redirect to login
        navigate('/login');
      } else if (isApproved) {
        // If session exists and user is approved, redirect to dashboard
        navigate('/dashboard');
      }
      // If session exists but not approved, stay on this page
    }
  }, [session, isLoading, isApproved, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading || !session || isApproved) {
    // Show loading or redirect if conditions change
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Checking approval status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md text-center">
        <h2 className="text-3xl font-bold mb-4 text-dyad-blue">Account Awaiting Approval</h2>
        <p className="text-gray-700 mb-6">
          Thank you for registering! Your account is currently under review by an administrator.
          You will receive an email notification once your account has been approved.
        </p>
        <p className="text-gray-600 mb-8">
          Please check back later or contact support if you have any questions.
        </p>
        <Button onClick={handleLogout} variant="outline" className="w-full">
          Log Out
        </Button>
      </div>
    </div>
  );
};

export default PendingApproval;