// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    )

    const { email, password, first_name, last_name, role, is_approved, country, permissions } = await req.json()

    if (!email || !password || !role || !country) {
      return new Response(JSON.stringify({ error: 'Email, password, role, and country are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Edge Function: Received payload for user ${email}`)

    // 1. Create user in Supabase Auth using admin privileges
    const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email for created users
      user_metadata: {
        first_name: first_name,
        last_name: last_name,
      },
    })

    if (authError) {
      console.error('Edge Function: Error creating user in auth:', authError)
      return new Response(JSON.stringify({ error: `Failed to create user: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!authData.user) {
      console.error('Edge Function: User creation failed, no user data returned.')
      return new Response(JSON.stringify({ error: 'User creation failed, no user data returned.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Update the user's profile
    const { error: profileError } = await supabaseAdminClient
      .from('profiles')
      .update({
        role: role,
        is_approved: is_approved,
        first_name: first_name,
        last_name: last_name,
        country: country,
        permissions: permissions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    if (profileError) {
      console.error('Edge Function: Error updating user profile, rolling back:', profileError)
      await supabaseAdminClient.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: `Failed to update user profile: ${profileError.message}. User creation rolled back.` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'User created and profile updated successfully!' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Edge Function unhandled error:', error)
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})