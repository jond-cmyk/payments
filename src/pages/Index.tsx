"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";

const Index = () => {
  const { session, isLoading, isApproved } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Index: Current session state - isLoading:", isLoading, "session:", session, "isApproved:", isApproved);
    if (!isLoading) {
      if (session) {
        if (isApproved) {
          console.log("Index: Session found and approved, redirecting to /dashboard.");
          navigate('/dashboard'); // Redirect to dashboard if logged in and approved
        } else {
          console.log("Index: Session found but not approved, redirecting to /pending-approval.");
          navigate('/pending-approval'); // Redirect to pending approval if logged in but not approved
        }
      } else {
        console.log("Index: No session found, redirecting to /login.");
        navigate('/login'); // Redirect to login if not logged in
      }
    }
  }, [session, isLoading, isApproved, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Loading application...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-xl text-gray-600">Checking authentication status...</p>
    </div>
  );
};

export default Index;