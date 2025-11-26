"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { BookOpen, Home, PlusCircle, List, FileX, Repeat, Banknote, Users, Settings, DollarSign, MessageSquareText, BarChart, Home as HomeIcon, Check, Lightbulb, Palette, Search, Filter, Clock, CheckCircle, AlertTriangle, FileText, Bell } from 'lucide-react';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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
            <p className="mt-2">For Requesters, you can toggle between "My Requests" and "All Requests" in your country to change your view.</p>
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
          <p className="mt-4">**Pro Tip:** When you enter a supplier or payee name, the system will search for existing payees to help you auto-fill bank details, saving you time!</p>
          <p className="mt-2">**Remember:** Always verify bank details and attach the necessary documents (like invoices) before submitting!</p>
        </>
      ),
    },
    {
      title: "3. Managing Transactions & Receipts",
      icon: <FileText className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>This section is for reconciling expenses, typically from company card payments.</p>
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold text-lg text-gray-800">Missing Receipts:</h4>
            <p>This page lists all transactions that are in a 'Pending Input' state. To complete them, you must click "View/Add Receipt" and provide the required information: a receipt, a category, a merchant name, and an SKU (unless marked as not SKU-related). Once all fields are filled, the transaction will automatically move to 'Completed'.</p>
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
            <li>**Awaiting Info:** If a Direct Debit or Standing Order is uploaded via CSV and is missing critical information, it will be marked as 'Awaiting Info' until an admin or requester edits the details.</li>
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
          <p>These sections help manage deposits related to properties using data from e-conomic:</p>
          <ul className="list-disc list-inside space-y-2 mt-4 pl-4">
            <li><strong>Landlord Deposits:</strong> Search by property SKU to see the current deposit balance held by a landlord (Account 5201). If a refund is due, you can click **Advise of Deposit Return** to create a task for an admin.</li>
            <li><strong>Customer Deposits:</strong> Search by property SKU to see the current deposit balance held *from* a customer (Account 8201). This helps track what a customer has paid.</li>
            <li><strong>Customer Deposit Returns:</strong> Search for 'Final Statement' entries in e-conomic to initiate a deposit return request *to* a customer if they have a credit balance.</li>
            <li><strong>Deposit Return Advisements:</strong> A queue for reviewing and processing deposit return requests initiated from the Landlord Deposits page.</li>
          </ul>
        </>
      ),
    },
    {
      title: "6. Customers & Financial Reports",
      icon: <BarChart className="h-6 w-6 text-dyad-blue" />,
      content: (
        <>
          <p>Access real-time financial data directly from e-conomic:</p>
          <ul className="list-disc list-inside space-y-2 mt-4 pl-4">
            <li><strong>Customers:</strong> View customer details, current balances, and overdue amounts. You can drill down to see specific invoices, ledger cards, and outstanding transactions.</li>
            <li><strong>Property P&L:</strong> Generate Profit & Loss reports for specific properties (SKUs). Select a property, year, month, and duration to see revenue, costs, and profit trends over time. You can also export these reports to Excel.</li>
          </ul>
        </>
      ),
    },
    {
      title: "7. Notifications & Profile",
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
      title: "8. Admin Panel & Tools",
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

  const statusGlossary = [
    { status: 'Pending', color: 'bg-yellow-500', description: 'Awaiting initial review by an administrator.' },
    { status: 'Payment Setup', color: 'bg-blue-500', description: 'The payment has been set up in the bank and is awaiting final approval.' },
    { status: 'Queried', color: 'bg-gray-500', description: 'An admin has a question. Check the comments for details.' },
    { status: 'Paused', color: 'bg-gray-500', description: 'The request is on hold. No action will be taken until it is unpaused.' },
    { status: 'Payment Complete / Approved', color: 'bg-green-500', description: 'The payment has been fully approved and processed.' },
    { status: 'Declined / Cancelled', color: 'bg-red-500', description: 'The request has been rejected or cancelled.' },
    { status: 'Awaiting Info', color: 'bg-orange-500', description: 'A recurring payment is missing key details and needs to be edited.' },
  ];

  const tips = [
    { icon: <Lightbulb className="h-5 w-5 text-yellow-500" />, text: "Use the 'Payee Suggestion' feature when creating new requests to auto-fill bank details from past payments." },
    { icon: <Search className="h-5 w-5 text-blue-500" />, text: "The global search bar in the header searches across all payment types, including requests, transactions, and recurring payments." },
    { icon: <Filter className="h-5 w-5 text-green-500" />, text: "Use the filter options on the 'All Requests', 'Standing Orders', and 'Direct Debits' pages to quickly find what you're looking for." },
  ];

  const permissionsMatrix = [
    { feature: "View Dashboard", requester: true, sales: false, admin: true },
    { feature: "Create New Payment Request", requester: true, sales: false, admin: true },
    { feature: "Create New Standing Order", requester: true, sales: false, admin: true },
    { feature: "Create New Direct Debit", requester: true, sales: false, admin: true },
    { feature: "View All Requests (Table)", requester: true, sales: false, admin: true },
    { feature: "View/Add Missing Receipts", requester: true, sales: false, admin: true },
    { feature: "View Completed Receipts", requester: true, sales: false, admin: true },
    { feature: "Edit own Pending/Queried Requests", requester: true, sales: false, admin: true },
    { feature: "Edit any Direct Debit", requester: true, sales: false, admin: true },
    { feature: "Edit any Standing Order", requester: false, sales: false, admin: true },
    { feature: "View Customers", requester: true, sales: true, admin: true },
    { feature: "View Customer Deposits", requester: true, sales: true, admin: true },
    { feature: "View Customer Deposit Returns", requester: true, sales: true, admin: true },
    { feature: "View Landlord Deposits", requester: true, sales: true, admin: true },
    { feature: "Advise Deposit Return (Landlord)", requester: true, sales: true, admin: true },
    { feature: "View Deposit Return Advisements", requester: true, sales: true, admin: true },
    { feature: "View Property P&L", requester: true, sales: true, admin: true },
    { feature: "Submit Feedback", requester: true, sales: true, admin: true },
    { feature: "View Statistics", requester: true, sales: false, admin: true },
    { feature: "---", requester: false, sales: false, admin: false },
    { feature: "Approve/Decline/Query/Pause/Cancel Requests", requester: false, sales: false, admin: true },
    { feature: "Mark Deposit Advisement as Processed", requester: false, sales: false, admin: true },
    { feature: "Upload Spreadsheets (Transactions/SO/DD)", requester: false, sales: false, admin: true },
    { feature: "User Management (Approve/Edit Roles)", requester: false, sales: false, admin: true },
    { feature: "Access Admin Panel & E-conomic Tools", requester: false, sales: false, admin: true },
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

          <div className="space-y-4">
            <h3 className="flex items-center text-2xl font-bold text-gray-800">
              <Palette className="h-6 w-6 mr-3" /> Status Glossary
            </h3>
            <p className="text-gray-700">Understand what each status means at a glance.</p>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-1/4 font-bold text-gray-900">Status</TableHead>
                    <TableHead className="w-3/4 font-bold text-gray-900">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusGlossary.map((item) => (
                    <TableRow key={item.status}>
                      <TableCell>
                        <Badge className={item.color}>{item.status}</Badge>
                      </TableCell>
                      <TableCell>{item.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="flex items-center text-2xl font-bold text-gray-800">
              <Lightbulb className="h-6 w-6 mr-3" /> Tips & Best Practices
            </h3>
            <ul className="space-y-3">
              {tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-md">
                  <div className="flex-shrink-0 mt-1">{tip.icon}</div>
                  <p className="text-gray-700">{tip.text}</p>
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="flex items-center text-2xl font-bold text-gray-800">
              <Users className="h-6 w-6 mr-3" /> Feature Access Matrix
            </h3>
            <p className="text-gray-700">
              This table outlines which features are available to users based on their role (Requester, Sales, or Admin).
            </p>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-1/2 font-bold text-gray-900">Feature / Action</TableHead>
                    <TableHead className="text-center font-bold text-gray-900">Requester</TableHead>
                    <TableHead className="text-center font-bold text-gray-900">Sales</TableHead>
                    <TableHead className="text-center font-bold text-gray-900">Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionsMatrix.map((item, index) => (
                    item.feature === '---' ? (
                      <TableRow key={index} className="h-2 bg-gray-100/50"><TableCell colSpan={4} className="p-0"></TableCell></TableRow>
                    ) : (
                      <TableRow key={item.feature} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{item.feature}</TableCell>
                        <TableCell className="text-center">
                          {item.requester ? <Checkmark /> : <Cross />}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.sales ? <Checkmark /> : <Cross />}
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