import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This Edge Function is now primarily a placeholder or for future direct auth.users updates
    // that are not related to email_confirmed_at, as that field is not directly settable
    // via admin.updateUserById for the purpose of bypassing email verification.
    // The actual profile approval is handled by updating public.profiles.is_approved directly.

    const { userId, isApproved } = await req.json();
    console.log(`[update-user-approval] Received request for userId: ${userId}, isApproved: ${isApproved}`);

    if (!userId || typeof isApproved !== 'boolean') {
      console.error('[update-user-approval] Missing userId or isApproved status.');
      return new Response(JSON.stringify({ error: 'User ID and isApproved status are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No direct update to auth.users.email_confirmed_at here, as it's not effective.
    // The public.profiles.is_approved field is the source of truth for application access.

    console.log(`[update-user-approval] No direct update to auth.users for email_confirmed_at. Profile approval is handled in client.`);
    return new Response(JSON.stringify({ message: 'User email confirmation status (via profile) handled successfully!' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});