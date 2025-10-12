import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"; // Import useLocation
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
  const location = useLocation(); // Get current location
  
  // Define routes where auto-refresh should be disabled
  const disableAutoRefreshRoutes = [
    '/new-request',
    '/request/', // Matches /request/:id
    '/transaction/', // Matches /transaction/:id
  ];

  // Check if the current path starts with any of the disabled routes
  const isAutoRefreshDisabled = disableAutoRefreshRoutes.some(route => 
    location.pathname.startsWith(route)
  );

  useAutoRefresh({ intervalMinutes: 2, enabled: !isAutoRefreshDisabled }); // Pass enabled prop dynamically

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
                {/* Removed AdminTestEmail route */}
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