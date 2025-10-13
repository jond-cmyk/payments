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
import { SessionContextProvider, useSession } from "./integrations/supabase/SessionContext";
import { NotificationProvider } from "./integrations/supabase/NotificationContext";
import Layout from "./components/Layout";
import AutoRefreshHandler from "./components/AutoRefreshHandler";

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
              <AutoRefreshHandler>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/pending-approval" element={<PendingApproval />} />
                  <Route path="/" element={<Index />} />

                  {/* Routes accessible to all logged-in users (even if not approved) */}
                  <Route element={<Layout />}>
                    <Route path="/missing-receipts" element={<MissingReceipts />} />
                    <Route path="/completed-receipts" element={<CompletedReceipts />} />
                    <Route path="/transaction/:id" element={<TransactionDetail />} />
                  </Route>

                  {/* Protected routes requiring approval */}
                  <Route element={<ApprovedRoute><Layout /></ApprovedRoute>}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/new-request" element={<NewPaymentRequest />} />
                    <Route path="/request/:id" element={<PaymentRequestDetail />} />
                    <Route path="/admin/requests" element={<Dashboard />} />
                    <Route path="/admin/users" element={<UserManagement />} />
                    <Route path="/admin/upload-transactions" element={<AdminUploadTransactions />} />
                    <Route path="/notifications" element={<NotificationsPage />} /> {/* New route for Notifications */}
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AutoRefreshHandler>
            </NotificationProvider>
          </SessionContextProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;