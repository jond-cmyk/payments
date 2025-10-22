"use client";

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import PageTitle from '@/components/PageTitle';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Upload, Banknote, Repeat, MessageSquareText, Globe, Settings } from 'lucide-react';
import { showError } from '@/utils/toast';

const adminLinks = [
  {
    to: '/admin/users',
    icon: <Users className="h-8 w-8 text-dyad-blue" />,
    title: 'User Management',
    description: 'Add, edit, and manage user accounts and permissions.',
  },
  {
    to: '/admin/upload-transactions',
    icon: <Upload className="h-8 w-8 text-dyad-blue" />,
    title: 'Upload Transactions',
    description: 'Bulk upload transaction spreadsheets for processing.',
  },
  {
    to: '/admin/upload-direct-debits',
    icon: <Banknote className="h-8 w-8 text-dyad-blue" />,
    title: 'Upload Direct Debits',
    description: 'Bulk upload direct debit spreadsheets.',
  },
  {
    to: '/admin/upload-standing-orders',
    icon: <Repeat className="h-8 w-8 text-dyad-blue" />,
    title: 'Upload Standing Orders',
    description: 'Bulk upload standing order spreadsheets.',
  },
  {
    to: '/admin/feedback',
    icon: <MessageSquareText className="h-8 w-8 text-dyad-blue" />,
    title: 'User Feedback',
    description: 'Review and manage feedback submitted by users.',
  },
  {
    to: '/admin/economic-integration',
    icon: <Globe className="h-8 w-8 text-dyad-blue" />,
    title: 'E-conomic Integration',
    description: 'Test and manage the integration with e-conomic.',
  },
];

const AdminPanel = () => {
  const { session, isLoading, userProfile } = useSession();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  if (isLoading) {
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

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Admin Panel - KH Payments" />
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center">
          <Settings className="mr-3 h-8 w-8" />
          Admin Panel
        </h1>
        <p className="text-muted-foreground mt-2">
          Access administrative tools and settings for the application.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminLinks.map((link) => (
          <Link to={link.to} key={link.to} className="block">
            <Card className="h-full hover:shadow-lg hover:border-dyad-blue transition-all duration-200">
              <CardHeader className="flex flex-row items-center gap-4">
                {link.icon}
                <div>
                  <CardTitle>{link.title}</CardTitle>
                  <CardDescription className="mt-1">{link.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminPanel;