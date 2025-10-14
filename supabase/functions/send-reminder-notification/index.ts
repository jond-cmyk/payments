import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Resend } from 'https://esm.sh/resend@1.1.0';

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
      .select('*, requester_profile:profiles(first_name, last_name, user_email), admin_profiles:profiles!inner(id, first_name, last_name, user_email)')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('Error fetching payment request:', requestError?.message || 'Request not found');
      return new Response(JSON.stringify({ error: `Payment request not found or error fetching: ${requestError?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch sender's profile for "sent by" info
    const { data: senderProfile, error: senderProfileError } = await supabaseClient
      .from('profile_with_email')
      .select('first_name, last_name, user_email')
      .eq('id', senderId)
      .single();

    if (senderProfileError || !senderProfile) {
      console.warn('Could not fetch sender profile:', senderProfileError?.message || 'Sender profile not found');
    }
    const senderDisplayName = senderProfile?.first_name && senderProfile?.last_name
      ? `${senderProfile.first_name} ${senderProfile.last_name}`
      : senderProfile?.user_email || 'A user';

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const senderEmail = `jon.d@khpayments.com`; // Your sender email

    const recipientEmails: string[] = [];
    const notificationUserIds: string[] = [];

    // Add requester's email and ID
    if (request.requester_profile?.user_email) {
      recipientEmails.push(request.requester_profile.user_email);
      notificationUserIds.push(request.requester_id);
    }

    // Add admin emails and IDs
    const { data: adminProfiles, error: adminProfilesError } = await supabaseClient
      .from('profile_with_email')
      .select('id, user_email')
      .eq('role', 'admin');

    if (adminProfilesError) {
      console.error('Error fetching admin profiles:', adminProfilesError);
    } else {
      adminProfiles?.forEach(admin => {
        if (admin.user_email && !recipientEmails.includes(admin.user_email)) {
          recipientEmails.push(admin.user_email);
        }
        if (admin.id && !notificationUserIds.includes(admin.id)) {
          notificationUserIds.push(admin.id);
        }
      });
    }

    if (recipientEmails.length === 0) {
      console.warn('No valid recipient emails found for reminder.');
      return new Response(JSON.stringify({ message: 'No recipients for reminder email.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `Reminder: Payment Request #${request.id.substring(0, 8)} - ${request.supplier_name}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a reminder regarding payment request <strong>#${request.id.substring(0, 8)}</strong> for <strong>${request.supplier_name}</strong> (SKU: ${request.sku_number || 'N/A'}).</p>
      <p>The current status is: <strong>${request.status.replace(/_/g, ' ').charAt(0).toUpperCase() + request.status.replace(/_/g, ' ').slice(1)}</strong>.</p>
      <p>This reminder was sent by ${senderDisplayName}.</p>
      <p>You can view the request details here: <a href="${appUrl}/request/${request.id}">View Payment Request</a></p>
      <p>Thank you,</p>
      <p>Your Payment Team</p>
    `;

    const { data, error: resendError } = await resend.emails.send({
      from: senderEmail,
      to: recipientEmails,
      subject: subject,
      html: htmlContent,
    });

    if (resendError) {
      console.error('Error sending reminder email via Resend:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send reminder email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Reminder email sent successfully via Resend:', data);

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
      // Don't fail the whole function, email was sent. Just log.
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

    return new Response(JSON.stringify({ message: 'Reminder email and notifications sent successfully.' }), {
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