"use client";

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';

const PaymentRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
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
      <h1 className="text-3xl font-bold mb-6">Payment Request Details</h1>
      <p className="text-lg text-gray-700">Details for request ID: {id}</p>
      <p className="text-md text-gray-500 mt-2">This page will show the request details, allow requesters to edit pending requests, and admins to approve/decline/setup payment.</p>
    </div>
  );
};

export default PaymentRequestDetail;