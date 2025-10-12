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
    if (!isLoading && session) {
      if (isApproved) {
        console.log("Login: Session found and approved, redirecting to /dashboard.");
        navigate('/dashboard');
      } else {
        console.log("Login: Session found but not approved, redirecting to /pending-approval.");
        navigate('/pending-approval');
      }
    }
  }, [session, isLoading, isApproved, navigate]);

  if (isLoading) {
    console.log("Login: Displaying loading state.");
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dyad-blue p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <div className="flex justify-center mb-6">
          <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-16" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-6">Sign In / Sign Up</h2>
        <Auth
          supabaseClient={supabase}
          providers={[]} // No third-party providers by default
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
          redirectTo={window.location.origin} // Redirect to the current origin after auth
        />
      </div>
    </div>
  );
};

export default Login;