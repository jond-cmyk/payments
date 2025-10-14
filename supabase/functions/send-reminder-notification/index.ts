import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// Removed Resend import as email functionality is no longer needed

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const payload = await req.json();
    const { requestId, senderId } = payload;

    if (!requestId || !senderId) {
      const errorMessage = 'Missing requestId or senderId in payload.';
      console.error('Edge Function Error (400):', errorMessage, 'Payload:', JSON.stringify(payload));
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch payment request details
    const { data: request, error: requestError } = await supabaseClient
      .from('payment_requests')
      .select('id, supplier_name, sku_number, status, requester_id') // Select only necessary fields
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('Error fetching payment request:', requestError?.message || 'Request not found');
      return new Response(JSON.stringify({ error: `Payment request not found or error fetching: ${requestError?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch admin user IDs for notifications
    const { data: adminProfiles, error: adminProfilesError } = await supabaseClient
      .from('profile_with_email')
      .select('id')
      .eq('role', 'admin');

    if (adminProfilesError) {
      console.error('Error fetching admin profiles for notifications:', adminProfilesError);
      // Continue without admin notifications if there's an error
    }

    const notificationUserIds: string[] = [];
    // Add requester's ID
    notificationUserIds.push(request.requester_id);

    // Add admin IDs, ensuring no duplicates
    adminProfiles?.forEach(admin => {
      if (admin.id && !notificationUserIds.includes(admin.id)) {
        notificationUserIds.push(admin.id);
      }
    });

    if (notificationUserIds.length === 0) {
      console.warn('No valid user IDs found for reminder notifications.');
      return new Response(JSON.stringify({ message: 'No recipients for reminder notifications.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update payment_requests table with reminder info
    const { error: updateError } = await supabaseClient
      .from('payment_requests')
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        is_reminded: true,
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating payment request with reminder info:', updateError);
      return new Response(JSON.stringify({ error: `Failed to update payment request with reminder info: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert in-app notifications
    const notificationTitle = `Reminder: Payment Request #${request.id.substring(0, 8)}`;
    const notificationMessage = `A reminder has been sent for payment request for ${request.supplier_name} (SKU: ${request.sku_number || 'N/A'}). Current status: ${request.status.replace(/_/g, ' ').charAt(0).toUpperCase() + request.status.replace(/_/g, ' ').slice(1)}.`;
    const notificationLink = `/request/${request.id}`;

    for (const userId of notificationUserIds) {
      const { error: notificationError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: userId,
          title: notificationTitle,
          message: notificationMessage,
          link: notificationLink,
          is_read: false,
        });
      if (notificationError) {
        console.error(`Error inserting notification for user ${userId}:`, notificationError);
      }
    }

    console.log('Reminder notifications sent successfully.');

    return new Response(JSON.stringify({ message: 'Reminder notifications sent successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});