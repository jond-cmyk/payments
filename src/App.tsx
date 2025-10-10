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
import UserManagement from "./pages/UserManagement"; // Import UserManagement
import { SessionContextProvider } from "./integrations/supabase/SessionContext";
import Layout from "./components/Layout";
import useAutoRefresh from "./hooks/use-auto-refresh"; // Import the new hook

const queryClient = new QueryClient();

const App = () => {
  // Enable auto-refresh for the entire application, every 2 minutes
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
                <Route path="/admin/users" element={<UserManagement />} /> {/* New route for User Management */}
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