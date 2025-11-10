"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { BookOpen, Home, PlusCircle, List, FileX, Repeat, Banknote, Users, Settings, DollarSign, MessageSquareText, BarChart, FileText, CheckCircle, Clock, AlertTriangle, Bell } from 'lucide-react';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const UserGuide = () => {
  const { session, isLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const isAdmin = userProfile?.role === 'admin';

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading guide...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  const sections = [
    {
      title: "1. Getting Started: Your Dashboard",
      icon: <Home className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>The Dashboard is your mission control! It provides a quick overview of all critical and active payment requests, missing receipts, and pending recurring payments.</p>
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold text-lg text-gray-800">Key Dashboard Cards:</h4>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li className="flex items-center"><Clock className="h-4 w-4 mr-2 text-yellow-600" /> <strong>Pending Requests:</strong> Requests awaiting initial review.</li>
              <li className="flex items-center"><DollarSign className="h-4 w-4 mr-2 text-blue-600" /> <strong>Payment Setup:</strong> Requests that have been set up and are awaiting final approval.</li>
              <li className="flex items-center"><AlertTriangle className="h-4 w-4 mr-2 text-red-600" /> <strong>Urgent Requests:</strong> Requests marked for immediate attention.</li>
              <li className="flex items-center"><FileX className="h-4 w-4 mr-2 text-orange-600" /> <strong>Missing Receipts:</strong> Transactions requiring receipt uploads.</li>
            </ul>
          </div>
        </>
      ),
    },
    {
      title: "2. Creating New Requests",
      icon: <PlusCircle className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>You can initiate three types of payments directly from the Dashboard header:</p>
          <ul className="list-disc list-inside space-y-2 mt-4 pl-4">
            <li><strong>New Payment Request:</strong> For one-off payments (e.g., invoices, refunds).</li>
            <li><strong>New Standing Order:</strong> For fixed, recurring payments (e.g., rent, subscriptions).</li>
            <li><strong>New Direct Debit:</strong> For recurring payments where the payee pulls the funds (e.g., utilities).</li>
          </ul>
          <p className="mt-4">**Remember:** Always verify bank details and attach the necessary documents (like invoices) before submitting!</p>
        </>
      ),
    },
    {
      title: "3. Managing Transactions & Receipts",
      icon: <FileText className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>The app helps you track two main types of transactions:</p>
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold text-lg text-gray-800">Missing Receipts:</h4>
            <p>This section lists transactions (usually card payments) that require you to upload a receipt and categorize the expense. Click "View/Add Receipt" to complete the details and mark the transaction as <CheckCircle className="h-4 w-4 inline text-green-600" /> **Completed**.</p>
            <h4 className="font-semibold text-lg text-gray-800">Completed Receipts:</h4>
            <p>A historical archive of all transactions that have been fully processed and have receipts attached, organized by month.</p>
          </div>
        </>
      ),
    },
    {
      title: "4. Recurring Payments (SO & DD)",
      icon: <Repeat className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>Standing Orders and Direct Debits are managed in their respective sections. These are typically set up once and then monitored.</p>
          <ul className="list-disc list-inside space-y-1 mt-4 pl-4">
            <li>**Status:** Payments move from **Pending** (awaiting admin review) to **Active**, **Paused**, or **Cancelled**.</li>
            <li>**Awaiting Info:** If a Direct Debit or Standing Order is uploaded via CSV and is missing critical information, it will be marked as 'Awaiting Info' until an admin edits the details.</li>
            <li>**Audit Trail:** Every change, including comments, is logged in the Audit Trail for full transparency.</li>
          </ul>
        </>
      ),
    },
    {
      title: "5. Deposit Management (Admin/Requester)",
      icon: <DollarSign className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>These sections help manage deposits related to properties:</p>
          <ul className="list-disc list-inside space-y-1 mt-4 pl-4">
            <li>**Landlord Deposits:** Allows you to search e-conomic entries by SKU to view the current deposit balance held for a property. If a refund is due, you can **Advise of Deposit Return**.</li>
            <li>**Deposit Return Advisements:** (Admin/Requester) Lists all advised deposit returns, allowing admins to review and mark them as processed.</li>
            <li>**Customer Deposit Returns:** (Admin only) Allows searching for 'Final Statement' entries in e-conomic to initiate a deposit return request for a customer if no outstanding balance exists.</li>
          </ul>
        </>
      ),
    },
    {
      title: "6. Notifications & Profile",
      icon: <Bell className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>Stay informed and manage your account settings:</p>
          <ul className="list-disc list-inside space-y-1 mt-4 pl-4">
            <li>**Notifications:** Receive real-time alerts for status changes on your requests. You can enable desktop notifications in your Profile settings.</li>
            <li>**My Profile:** Update your name, change your password, and manage your desktop notification preferences.</li>
            <li>**Feedback:** Use the Feedback button in the header to anonymously submit suggestions or report bugs!</li>
          </ul>
        </>
      ),
    },
  ];

  const adminSections = [
    {
      title: "7. Admin Panel & Tools",
      icon: <Settings className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>The Admin Panel provides access to powerful management tools:</p>
          <ul className="list-disc list-inside space-y-1 mt-4 pl-4">
            <li>**User Management:** Approve new users, change roles, and manage user accounts.</li>
            <li>**Upload Spreadsheets:** Bulk upload transactions, standing orders, and direct debits via CSV.</li>
            <li>**E-conomic Integration:** Test API connectivity and diagnose issues.</li>
            <li>**Departments:** View the list of property SKUs/Departments synced from e-conomic.</li>
            <li>**User Feedback:** Review anonymous feedback submissions.</li>
          </ul>
        </>
      ),
    },
  ];

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="User Guide - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-3xl font-bold">
            <BookOpen className="mr-3 h-8 w-8" /> KH Payments User Guide
          </CardTitle>
          <CardDescription className="mt-2 text-lg">
            Welcome! This guide will help you navigate the application and manage your payment requests, transactions, and recurring payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {sections.map((section, index) => (
            <React.Fragment key={index}>
              <div className="space-y-4">
                <h3 className="flex items-center text-2xl font-bold text-gray-800">
                  {section.icon}
                  <span className="ml-3">{section.title}</span>
                </h3>
                <div className="text-gray-700 pl-9">
                  {section.content}
                </div>
              </div>
              {index < sections.length - 1 && <Separator />}
            </React.Fragment>
          ))}

          {isAdmin && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="flex items-center text-2xl font-bold text-gray-800">
                  {adminSections[0].icon}
                  <span className="ml-3">{adminSections[0].title}</span>
                </h3>
                <div className="text-gray-700 pl-9">
                  {adminSections[0].content}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserGuide;