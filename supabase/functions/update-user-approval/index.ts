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
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { userId, isApproved } = await req.json();
    console.log(`[update-user-approval] Received request for userId: ${userId}, isApproved: ${isApproved}`);

    if (!userId || typeof isApproved !== 'boolean') {
      console.error('[update-user-approval] Missing userId or isApproved status.');
      return new Response(JSON.stringify({ error: 'User ID and isApproved status are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailConfirmedAtValue = isApproved ? new Date().toISOString() : null;
    console.log(`[update-user-approval] Attempting to set email_confirmed_at to: ${emailConfirmedAtValue} for user: ${userId}`);

    const { data, error: authError } = await supabaseAdminClient.auth.admin.updateUserById(
      userId,
      { email_confirmed_at: emailConfirmedAtValue }
    );

    if (authError) {
      console.error('Edge Function: Error updating user email confirmation status:', authError);
      return new Response(JSON.stringify({ error: `Failed to update user email confirmation status: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[update-user-approval] Successfully updated email_confirmed_at for user: ${userId}. Data: ${JSON.stringify(data)}`);
    return new Response(JSON.stringify({ message: 'User email confirmation status updated successfully!' }), {
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