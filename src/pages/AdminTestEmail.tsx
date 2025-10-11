"use client";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

const AdminTestEmail = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const [isSending, setIsSending] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    showError("Your user profile could not be loaded. Please try again.");
    navigate('/dashboard');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  const handleSendTestEmail = async () => {
    const toastId = showLoading("Sending test email...");
    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-test-email', {
        body: {}, // No specific body needed for this test function
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      showSuccess(data?.message || "Test email sent successfully!");
    } catch (error: any) {
      showError(error.message || "Failed to send test email.");
      console.error("Test email error:", error);
    } finally {
      dismissToast(toastId);
      setIsSending(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Send Test Email</CardTitle>
          <CardDescription className="text-center">
            Click the button below to send a test email via the Supabase Edge Function.
            The email will be sent to `jon.d@kassoehousing.com`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            onClick={handleSendTestEmail}
            disabled={isSending}
            className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground"
          >
            <Mail className="mr-2 h-4 w-4" />
            {isSending ? "Sending..." : "Send Test Email"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTestEmail;