// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
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
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
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

    // If the user is being approved, explicitly set email_confirmed_at in auth.users
    if (isApproved) {
      console.log(`[update-user-approval] User ${userId} is being approved. Attempting to set email_confirmed_at.`);
      const { data: updateAuthUser, error: updateAuthError } = await supabaseAdminClient.auth.admin.updateUserById(
        userId,
        { email_confirmed_at: new Date().toISOString() }
      );

      if (updateAuthError) {
        console.error(`[update-user-approval] Error setting email_confirmed_at for user ${userId}:`, updateAuthError);
        return new Response(JSON.stringify({ error: `Failed to confirm user email: ${updateAuthError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`[update-user-approval] Successfully set email_confirmed_at for user ${userId}. New email_confirmed_at: ${updateAuthUser?.user?.email_confirmed_at}`);
    } else {
      // If the user is being unapproved, we will NOT clear email_confirmed_at in auth.users.
      // The application's access control will rely on public.profiles.is_approved.
      console.log(`[update-user-approval] User ${userId} is being unapproved. Not modifying email_confirmed_at in auth.users.`);
    }

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