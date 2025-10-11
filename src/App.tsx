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
import AdminUploadCardTransactions from "./pages/AdminUploadCardTransactions"; // Renamed import
import AdminUploadGeneralTransactions from "./pages/AdminUploadGeneralTransactions"; // New import
import MyTransactions from "./pages/MyTransactions";
import TransactionDetail from "./pages/TransactionDetail";
import MyGeneralTransactions from "./pages/MyGeneralTransactions"; // New import
import GeneralTransactionDetail from "./pages/GeneralTransactionDetail"; // New import
import PendingApproval from "./pages/PendingApproval";
import AdminTestEmail from "./pages/AdminTestEmail";
import { SessionContextProvider, useSession } from "./integrations/supabase/SessionContext";
import Layout from "./components/Layout";
import useAutoRefresh from "./hooks/use-auto-refresh";

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
  useAutoRefresh({ intervalMinutes: 2, enabled: true });

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SessionContextProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/" element={<Index />} />

              {/* Protected routes requiring approval */}
              <Route element={<ApprovedRoute><Layout /></ApprovedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/new-request" element={<NewPaymentRequest />} />
                <Route path="/request/:id" element={<PaymentRequestDetail />} />
                <Route path="/admin/requests" element={<Dashboard />} />
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/upload-card-transactions" element={<AdminUploadCardTransactions />} /> {/* Renamed route */}
                <Route path="/admin/upload-general-transactions" element={<AdminUploadGeneralTransactions />} /> {/* New route */}
                <Route path="/admin/test-email" element={<AdminTestEmail />} />
                <Route path="/my-transactions" element={<MyTransactions />} />
                <Route path="/transaction/:id" element={<TransactionDetail />} />
                <Route path="/my-general-transactions" element={<MyGeneralTransactions />} /> {/* New route */}
                <Route path="/general-transaction/:id" element={<GeneralTransactionDetail />} /> {/* New route */}
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SessionContextProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;