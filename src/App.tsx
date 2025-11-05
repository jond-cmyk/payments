import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SessionContextProvider, useSession } from "./integrations/supabase/SessionContext";
import { NotificationProvider } from "./integrations/supabase/NotificationContext";
import { CountryProvider } from "./integrations/supabase/CountryContext";
import Layout from "./components/Layout";
import React, { Suspense, lazy } from 'react';
import VersionChecker from "./components/VersionChecker"; // Import the new component

// Lazy load all page components
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewPaymentRequest = lazy(() => import("./pages/NewPaymentRequest"));
const PaymentRequestDetail = lazy(() => import("./pages/PaymentRequestDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AdminUploadTransactions = lazy(() => import("./pages/AdminUploadTransactions"));
const MissingReceipts = lazy(() => import("./pages/MissingReceipts"));
const TransactionDetail = lazy(() => import("./pages/TransactionDetail"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const CompletedReceipts = lazy(() => import("./pages/CompletedReceipts"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const DirectDebits = lazy(() => import("./pages/DirectDebits"));
const DirectDebitDetail = lazy(() => import("./pages/DirectDebitDetail"));
const StandingOrders = lazy(() => import("./pages/StandingOrders"));
const StandingOrderDetail = lazy(() => import("./pages/StandingOrderDetail"));
const AdminUploadDirectDebits = lazy(() => import("./pages/AdminUploadDirectDebits"));
const AdminUploadStandingOrders = lazy(() => import("./pages/AdminUploadStandingOrders"));
const CustomerDepositReturns = lazy(() => import("./pages/CustomerDepositReturns"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const Statistics = lazy(() => import("./pages/Statistics"));
const EconomicIntegration = lazy(() => import("./pages/EconomicIntegration"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AdminDepartments = lazy(() => import("./pages/AdminDepartments"));
const Customers = lazy(() => import("./pages/Customers"));

const queryClient = new QueryClient();

// A wrapper component to protect routes that require approval
const ApprovedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading, isApproved } = useSession();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen text-lg">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" attribute="class">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter 
            future={{ 
              v7_startTransition: true, 
              v7_relativeSplatPath: true 
            }}
          >
            <SessionContextProvider>
              <NotificationProvider>
                <CountryProvider>
                  <VersionChecker /> {/* Add the VersionChecker here */}
                  <Suspense fallback={<div className="flex items-center justify-center h-screen text-lg">Loading page...</div>}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/pending-approval" element={<PendingApproval />} />
                      <Route path="/" element={<Index />} />

                      {/* Routes accessible to all logged-in users (even if not approved) */}
                      <Route element={<Layout />}>
                        <Route path="/missing-receipts" element={<MissingReceipts />} />
                        <Route path="/completed-receipts" element={<CompletedReceipts />} />
                        <Route path="/transaction/:id" element={<TransactionDetail />} />
                        <Route path="/direct-debits" element={<DirectDebits />} />
                        <Route path="/direct-debit/:id" element={<DirectDebitDetail />} />
                        <Route path="/standing-orders" element={<StandingOrders />} />
                        <Route path="/standing-order/:id" element={<StandingOrderDetail />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/admin/statistics" element={<Statistics />} />
                        <Route path="/admin/customers" element={<Customers />} />
                      </Route>

                      {/* Protected routes requiring approval */}
                      <Route element={<ApprovedRoute><Layout /></ApprovedRoute>}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/new-request" element={<NewPaymentRequest />} />
                        <Route path="/request/:id" element={<PaymentRequestDetail />} />
                        <Route path="/admin/requests" element={<Dashboard />} />
                        <Route path="/admin/panel" element={<AdminPanel />} />
                        <Route path="/admin/users" element={<UserManagement />} />
                        <Route path="/admin/upload-transactions" element={<AdminUploadTransactions />} />
                        <Route path="/admin/upload-direct-debits" element={<AdminUploadDirectDebits />} />
                        <Route path="/admin/upload-standing-orders" element={<AdminUploadStandingOrders />} />
                        <Route path="/customer-deposit-returns" element={<CustomerDepositReturns />} />
                        <Route path="/notifications" element={<NotificationsPage />} />
                        <Route path="/admin/feedback" element={<AdminFeedback />} />
                        <Route path="/admin/economic-integration" element={<EconomicIntegration />} />
                        <Route path="/admin/departments" element={<AdminDepartments />} />
                      </Route>

                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </CountryProvider>
              </NotificationProvider>
            </SessionContextProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;