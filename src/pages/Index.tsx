"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";

const Index = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Index: Current session state - isLoading:", isLoading, "session:", session);
    if (!isLoading) {
      if (session) {
        console.log("Index: Session found, redirecting to /dashboard.");
        navigate('/dashboard'); // Redirect to dashboard if logged in
      } else {
        console.log("Index: No session found, redirecting to /login.");
        navigate('/login'); // Redirect to login if not logged in
      }
    }
  }, [session, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Loading application...</p>
      </div>
    );
  }

  // This will be rendered if isLoading is false and before any redirects happen, or if redirects fail.
  // It should quickly disappear if redirects work.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-xl text-gray-600">Checking authentication status...</p>
    </div>
  );
};

export default Index;