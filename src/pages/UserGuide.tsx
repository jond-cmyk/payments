"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { BookOpen, Home, PlusCircle, List, FileX, Repeat, Banknote, Users, Settings, DollarSign, MessageSquareText, BarChart, FileText, CheckCircle, Clock, AlertTriangle, Bell, Check } from 'lucide-react'; // Added Check icon

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Added Table components

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
      title: "5. Deposit Management",
      icon: <DollarSign className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>These sections help manage deposits related to properties:</p>
          <ul className="list-disc list-inside space-y-1 mt-4 pl-4">
            <li>**Landlord Deposits:** Allows you to search e-conomic entries by SKU to view the current deposit balance held for a property. If a refund is due, you can **Advise of Deposit Return**.</li>
            <li>**Deposit Return Advisements:** (Admin/Requester) Lists all advised deposit returns, allowing admins to review and mark them as processed.</li>
            <li>**Customer Deposit Returns:** (All Users) Allows searching for 'Final Statement' entries in e-conomic to initiate a deposit return request for a customer if no outstanding balance exists.</li>
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

  const permissionsMatrix = [
    { feature: "View Dashboard", requester: true, admin: true },
    { feature: "Create New Payment Request", requester: true, admin: true },
    { feature: "Create New Standing Order", requester: true, admin: true },
    { feature: "Create New Direct Debit", requester: true, admin: true },
    { feature: "View All Requests (Table)", requester: true, admin: true },
    { feature: "View/Add Missing Receipts", requester: true, admin: true },
    { feature: "View Completed Receipts", requester: true, admin: true },
    { feature: "View/Edit Own Pending/Queried Requests", requester: true, admin: true },
    { feature: "View/Edit Standing Orders/Direct Debits", requester: false, admin: true },
    { feature: "View Customer Deposit Returns", requester: true, admin: true },
    { feature: "View Landlord Deposits", requester: true, admin: true },
    { feature: "Advise Deposit Return (Landlord)", requester: true, admin: true },
    { feature: "View Deposit Return Advisements", requester: true, admin: true },
    { feature: "Submit Feedback", requester: true, admin: true },
    { feature: "View Statistics", requester: true, admin: true },
    { feature: "---", requester: false, admin: false },
    { feature: "Approve/Decline/Query Requests", requester: false, admin: true },
    { feature: "Mark Deposit Advisement as Processed", requester: false, admin: true },
    { feature: "Upload Spreadsheets (Transactions/SO/DD)", requester: false, admin: true },
    { feature: "User Management (Approve/Edit Roles)", requester: false, admin: true },
    { feature: "Access Admin Panel", requester: false, admin: true },
    { feature: "Access E-conomic Integration Tools", requester: false, admin: true },
  ];

  const Checkmark = () => <Check className="h-5 w-5 text-green-600 mx-auto" />;
  const Cross = () => <span className="text-red-500 mx-auto">-</span>;

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

          <Separator />

          {/* Permissions Matrix Table */}
          <div className="space-y-4">
            <h3 className="flex items-center text-2xl font-bold text-gray-800">
              <Users className="h-6 w-6 mr-3" /> Feature Access Matrix
            </h3>
            <p className="text-gray-700">
              This table outlines which features are available to users based on their role (Requester or Admin).
            </p>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-1/2 font-bold text-gray-900">Feature / Action</TableHead>
                    <TableHead className="text-center font-bold text-gray-900">Requester</TableHead>
                    <TableHead className="text-center font-bold text-gray-900">Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionsMatrix.map((item, index) => (
                    item.feature === '---' ? (
                      <TableRow key={index} className="h-2 bg-gray-100/50"><TableCell colSpan={3} className="p-0"></TableCell></TableRow>
                    ) : (
                      <TableRow key={item.feature} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{item.feature}</TableCell>
                        <TableCell className="text-center">
                          {item.requester ? <Checkmark /> : <Cross />}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.admin ? <Checkmark /> : <Cross />}
                        </TableCell>
                      </TableRow>
                    )
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserGuide;