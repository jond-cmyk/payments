"use client";

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const { session, isLoading, isApproved } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Login: Current session state - isLoading:", isLoading, "session:", session, "isApproved:", isApproved);
    console.log("Login: session?.user?.email_confirmed_at:", session?.user?.email_confirmed_at);
    if (!isLoading) {
      if (session) {
        // If a session exists, immediately redirect based on our app's approval status
        if (isApproved) {
          console.log("Login: Session found and approved, redirecting to /dashboard.");
          navigate('/dashboard');
        } else {
          console.log("Login: Session found but not approved, redirecting to /pending-approval.");
          navigate('/pending-approval');
        }
      } else {
        console.log("Login: No session found, rendering Auth component.");
        // No session, so we continue to render the Auth component for sign-in/sign-up
      }
    }
  }, [session, isLoading, isApproved, navigate]);

  if (isLoading || session) { // If loading or a session already exists, don't render the Auth component
    console.log("Login: Displaying loading state or redirecting due to existing session.");
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dyad-blue p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg">
        <div className="flex justify-center mb-6">
          <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-16" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-6">Sign In / Sign Up</h2>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(var(--primary))',
                  brandAccent: 'hsl(var(--primary-foreground))',
                },
              },
            },
          }}
          theme="light"
          redirectTo={window.location.origin}
        />
      </div>
    </div>
  );
};

export default Login;