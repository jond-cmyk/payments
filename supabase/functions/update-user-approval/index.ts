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

    if (!userId || isApproved === undefined) {
      return new Response(JSON.stringify({ error: 'userId and isApproved are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Edge Function: Updating approval for user ${userId} to ${isApproved}`);

    // We can optionally verify the auth user exists, but the main goal here is to sync any auth-level metadata if needed.
    // For now, the app relies on the `profiles` table `is_approved` column which is handled by the client-side call.
    // However, if we wanted to actually ban/disable the user in Supabase Auth, we would do it here.
    
    /* 
    // Example: Ban user if not approved (prevents login token generation)
    const { error: authUpdateError } = await supabaseAdminClient.auth.admin.updateUserById(
      userId,
      { ban_duration: isApproved ? 'none' : '876000h' } // 100 years ban if not approved
    );
    */

    // Since the request is primarily to sync/log, we'll just return success for now as the profile update handles the logic.
    // This function acts as a placeholder for any future strict auth enforcement.

    return new Response(JSON.stringify({ message: 'User approval status updated.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});