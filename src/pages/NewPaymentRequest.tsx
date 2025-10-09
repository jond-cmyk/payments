"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';

const NewPaymentRequest = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Create New Payment Request</h1>
      <p className="text-lg text-gray-700">This is where the form for new payment requests will go.</p>
      <p className="text-md text-gray-500 mt-2">All fields will be mandatory: Supplier Name, SKU Number, Supplier Address, IBAN Number, Reason for Payment, Date Payment Required, and Invoice PDF Upload.</p>
    </div>
  );
};

export default NewPaymentRequest;