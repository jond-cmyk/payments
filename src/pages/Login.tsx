"use client";

import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { session, isLoading, isApproved, userProfile } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    console.log("Login: Current session state - isLoading:", isLoading, "session:", session, "isApproved:", isApproved);
    console.log("Login: session?.user?.email_confirmed_at:", session?.user?.email_confirmed_at);
    if (!isLoading) {
      if (session) {
        // If a session exists, immediately redirect based on our app's approval status
        if (isApproved) {
          if (userProfile?.role === 'sales') {
            console.log("Login: Sales user found and approved, redirecting to /admin/customers.");
            navigate('/admin/customers');
          } else {
            console.log("Login: Session found and approved, redirecting to /dashboard.");
            navigate('/dashboard');
          }
        } else {
          console.log("Login: Session found but not approved, redirecting to /pending-approval.");
          navigate('/pending-approval');
        }
      }
    }
  }, [session, isLoading, isApproved, navigate, userProfile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Navigation is handled by the useEffect hook when session updates
    } catch (error: any) {
      showError(error.message || 'Failed to login. Please check your credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading || session) { 
    console.log("Login: Displaying loading state or redirecting due to existing session.");
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dyad-blue p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-6">
            <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-16" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoggingIn}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoggingIn}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoggingIn}>
              {isLoggingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;