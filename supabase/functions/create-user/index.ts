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
    // Create a Supabase client with the service role key
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
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

    // 1. Create user in Supabase Auth using admin privileges
    const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: false, // Admin is manually adding, so no email confirmation needed for initial setup
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

    console.log(`Edge Function: User created with ID: ${authData.user.id}. Initial email_confirmed_at: ${authData.user.email_confirmed_at}`);

    // NEW STEP: Mark the user's email as confirmed immediately
    const { data: updatedAuthData, error: updateAuthError } = await supabaseAdminClient.auth.admin.updateUserById(
      authData.user.id,
      { email_confirmed_at: new Date().toISOString() }
    );

    if (updateAuthError) {
      console.error('Edge Function: Error confirming user email in auth:', updateAuthError);
      // Attempt to delete the auth user to prevent orphaned accounts
      await supabaseAdminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: `Failed to confirm user email: ${updateAuthError.message}. User creation rolled back.` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`Edge Function: User email confirmed for ${authData.user.id}. Updated email_confirmed_at: ${updatedAuthData.user?.email_confirmed_at}`);


    // 2. Update the user's profile with the selected role, approval status, and country
    // The handle_new_user trigger creates a default profile, we then update it.
    const { error: profileError } = await supabaseAdminClient
      .from('profiles')
      .update({
        role: role,
        is_approved: is_approved,
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