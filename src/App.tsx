import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewPaymentRequest from "./pages/NewPaymentRequest";
import PaymentRequestDetail from "./pages/PaymentRequestDetail";
import UserManagement from "./pages/UserManagement";
import AdminUploadTransactions from "./pages/AdminUploadTransactions";
import MissingReceipts from "./pages/MissingReceipts";
import TransactionDetail from "./pages/TransactionDetail";
import PendingApproval from "./pages/PendingApproval";
import CompletedReceipts from "./pages/CompletedReceipts";
import NotificationsPage from "./pages/Notifications"; // Import the NotificationsPage
import DirectDebits from "./pages/DirectDebits"; // Import DirectDebits
import DirectDebitDetail from "./pages/DirectDebitDetail"; // NEW: Import DirectDebitDetail
import StandingOrders from "./pages/StandingOrders"; // Import StandingOrders
import StandingOrderDetail from "./pages/StandingOrderDetail"; // NEW: Import StandingOrderDetail
import AdminUploadDirectDebits from "./pages/AdminUploadDirectDebits"; // NEW: Import AdminUploadDirectDebits
import AdminUploadStandingOrders from "./pages/AdminUploadStandingOrders"; // NEW: Import AdminUploadStandingOrders
import CustomerDepositReturns from "./pages/CustomerDepositReturns"; // NEW: Import CustomerDepositReturns
import AdminFeedback from "./pages/AdminFeedback"; // NEW: Import AdminFeedback
import { SessionContextProvider, useSession } from "./integrations/supabase/SessionContext";
import { NotificationProvider } from "./integrations/supabase/NotificationContext";
import { CountryProvider } from "./integrations/supabase/CountryContext"; // Import CountryProvider
import Layout from "./components/Layout";

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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SessionContextProvider>
            <NotificationProvider>
              <CountryProvider> {/* Wrap with CountryProvider */}
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
                    <Route path="/direct-debit/:id" element={<DirectDebitDetail />} /> {/* NEW: Direct Debit Detail Route */}
                    <Route path="/standing-orders" element={<StandingOrders />} />
                    <Route path="/standing-order/:id" element={<StandingOrderDetail />} /> {/* NEW: Standing Order Detail Route */}
                  </Route>

                  {/* Protected routes requiring approval */}
                  <Route element={<ApprovedRoute><Layout /></ApprovedRoute>}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/new-request" element={<NewPaymentRequest />} />
                    <Route path="/request/:id" element={<PaymentRequestDetail />} />
                    <Route path="/admin/requests" element={<Dashboard />} />
                    <Route path="/admin/users" element={<UserManagement />} />
                    <Route path="/admin/upload-transactions" element={<AdminUploadTransactions />} />
                    <Route path="/admin/upload-direct-debits" element={<AdminUploadDirectDebits />} /> {/* NEW: Direct Debit Upload Route */}
                    <Route path="/admin/upload-standing-orders" element={<AdminUploadStandingOrders />} /> {/* NEW: Standing Order Upload Route */}
                    <Route path="/customer-deposit-returns" element={<CustomerDepositReturns />} /> {/* NEW: Customer Deposit Returns Route */}
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/admin/feedback" element={<AdminFeedback />} /> {/* NEW: Admin Feedback Route */}
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </CountryProvider>
            </NotificationProvider>
          </SessionContextProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;