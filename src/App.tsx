import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard"; // Import Dashboard
import NewPaymentRequest from "./pages/NewPaymentRequest"; // Import NewPaymentRequest
import PaymentRequestDetail from "./pages/PaymentRequestDetail"; // Import PaymentRequestDetail
import { SessionContextProvider } from "./integrations/supabase/SessionContext";
import Layout from "./components/Layout"; // Import the new Layout component

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionContextProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}> {/* Wrap routes that need the layout */}
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/new-request" element={<NewPaymentRequest />} />
              <Route path="/request/:id" element={<PaymentRequestDetail />} />
              <Route path="/admin/requests" element={<Dashboard />} /> {/* Admin view of all requests, for now points to dashboard */}
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;