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

    const { email, password, first_name, last_name, role, is_approved, country } = await req.json();

    if (!email || !password || !role || !country) {
      return new Response(JSON.stringify({ error: 'Email, password, role, and country are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Edge Function: Received payload for user ${email} - role: ${role}, is_approved: ${is_approved}, country: ${country}`);

    // 1. Create user in Supabase Auth using admin privileges
    // Supabase will now handle sending a confirmation email.
    const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
      email: email,
      password: password,
      user_metadata: {
        first_name: first_name,
        last_name: last_name,
      },
    });

    if (authError) {
      console.error('Edge Function: Error creating user in auth:', authError);
      return new Response(JSON.stringify({ error: `Failed to create user: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!authData.user) {
      console.error('Edge Function: User creation failed, no user data returned.');
      return new Response(JSON.stringify({ error: 'User creation failed, no user data returned.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Edge Function: User created with ID: ${authData.user.id}. A confirmation email will be sent.`);

    // 2. Update the user's profile with the selected role, approval status, and country
    // The handle_new_user trigger creates a default profile, we then update it.
    const { error: profileError } = await supabaseAdminClient
      .from('profiles')
      .update({
        role: role,
        is_approved: is_approved, // This is the value from the form
        first_name: first_name,
        last_name: last_name,
        country: country, // Set the country
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id);

    if (profileError) {
      // If profile update fails, attempt to delete the auth user to prevent orphaned accounts
      console.error('Edge Function: Error updating user profile, attempting to roll back user creation:', profileError);
      await supabaseAdminClient.auth.admin.deleteUser(authData.user.id); // Rollback
      return new Response(JSON.stringify({ error: `Failed to update user profile: ${profileError.message}. User creation rolled back.` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'User created and profile updated successfully!' }), {
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