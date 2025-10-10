import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewPaymentRequest from "./pages/NewPaymentRequest";
import PaymentRequestDetail from "./pages/PaymentRequestDetail";
import UserManagement from "./pages/UserManagement";
import AdminUploadTransactions from "./pages/AdminUploadTransactions"; // Import AdminUploadTransactions
import MyTransactions from "./pages/MyTransactions"; // Import MyTransactions
import TransactionDetail from "./pages/TransactionDetail"; // Import TransactionDetail
import { SessionContextProvider } from "./integrations/supabase/SessionContext";
import Layout from "./components/Layout";
import useAutoRefresh from "./hooks/use-auto-refresh";

const queryClient = new QueryClient();

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
              <Route element={<Layout />}>
                <Route path="/" element={<Index />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/new-request" element={<NewPaymentRequest />} />
                <Route path="/request/:id" element={<PaymentRequestDetail />} />
                <Route path="/admin/requests" element={<Dashboard />} />
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/upload-transactions" element={<AdminUploadTransactions />} /> {/* New admin route */}
                <Route path="/my-transactions" element={<MyTransactions />} /> {/* New user route */}
                <Route path="/transaction/:id" element={<TransactionDetail />} /> {/* New transaction detail route */}
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