"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";

const Index = () => {
  const { session, isLoading, isApproved, userProfile } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Index: Current session state - isLoading:", isLoading, "session:", session, "isApproved:", isApproved);
    if (!isLoading) {
      if (session) {
        if (isApproved) {
          if (userProfile?.role === 'sales') {
            console.log("Index: Sales role detected, redirecting to /admin/customers.");
            navigate('/admin/customers');
          } else {
            console.log("Index: Session found and approved, redirecting to /dashboard.");
            navigate('/dashboard');
          }
        } else {
          console.log("Index: Session found but not approved, redirecting to /pending-approval.");
          navigate('/pending-approval');
        }
      } else {
        console.log("Index: No session found, redirecting to /login.");
        navigate('/login');
      }
    }
  }, [session, isLoading, isApproved, navigate, userProfile]);

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