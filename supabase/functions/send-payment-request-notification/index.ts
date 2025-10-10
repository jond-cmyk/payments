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
    const { type: eventType, record: newRecord, old_record: oldRecord } = payload;

    if (!newRecord || !newRecord.id) {
      return new Response(JSON.stringify({ error: 'Missing payment request data in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    const _project_ref = 'vcpvwcfuvpngmxenhixj'; // Updated Supabase Project ID

    // --- Fetch Requester Details ---
    const { data: requesterProfile, error: requesterProfileError } = await supabaseClient
      .from('profile_with_email')
      .select('first_name, last_name, user_email')
      .eq('id', newRecord.requester_id)
      .single();

    if (requesterProfileError || !requesterProfile?.user_email) {
      console.error('Error fetching requester profile or email:', requesterProfileError?.message || 'Requester email not found');
      // Continue, as admin emails might still be sent
    }
    const requesterEmail = requesterProfile?.user_email;
    const requesterName = `${requesterProfile?.first_name || ''} ${requesterProfile?.last_name || ''}`.trim() || 'Requester';

    // --- Fetch Admin Emails ---
    const { data: adminProfiles, error: adminProfilesError } = await supabaseClient
      .from('profile_with_email')
      .select('user_email')
      .eq('role', 'admin');

    if (adminProfilesError) {
      console.error('Error fetching admin profiles:', adminProfilesError.message);
      // Continue, as requester email might still be sent
    }
    const adminEmails = adminProfiles?.map(p => p.user_email).filter((email): email is string => !!email) || [];

    let subject = '';
    let htmlContent = '';
    let recipientEmails: string[] = [];

    if (eventType === 'INSERT') {
      // New Request Submitted
      subject = `New Payment Request Submitted: #${newRecord.id.substring(0, 8)}`;
      htmlContent = `
        <p>Dear ${requesterName},</p>
        <p>Your new payment request (ID: <strong>#${newRecord.id.substring(0, 8)}</strong>) has been successfully submitted.</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>Supplier: ${newRecord.supplier_name}</li>
          <li>SKU: ${newRecord.sku_number}</li>
          <li>Reason: ${newRecord.reason_for_payment}</li>
          <li>Status: ${newRecord.status}</li>
        </ul>
        <p>You can view the details here: <a href="${appUrl}/request/${newRecord.id}">View Request</a></p>
        <p>We will notify you once it has been reviewed by an administrator.</p>
        <p>Thank you,</p>
        <p>Your Payment Team</p>
      `;
      recipientEmails = [...adminEmails]; // Admins get new request alerts
      if (requesterEmail) recipientEmails.push(requesterEmail); // Requester also gets confirmation

    } else if (eventType === 'UPDATE' && oldRecord && newRecord.status !== oldRecord.status) {
      // Status Changed
      subject = `Payment Request #${newRecord.id.substring(0, 8)} Status Updated to ${newRecord.status.replace(/_/g, ' ').toUpperCase()}`;
      htmlContent = `
        <p>Dear ${requesterName},</p>
        <p>The status of your payment request (ID: <strong>#${newRecord.id.substring(0, 8)}</strong>) has been updated.</p>
        <p><strong>Previous Status:</strong> ${oldRecord.status.replace(/_/g, ' ').toUpperCase()}</p>
        <p><strong>New Status:</strong> ${newRecord.status.replace(/_/g, ' ').toUpperCase()}</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>Supplier: ${newRecord.supplier_name}</li>
          <li>SKU: ${newRecord.sku_number}</li>
          <li>Reason: ${newRecord.reason_for_payment}</li>
          <li>Date Required: ${newRecord.date_payment_required}</li>
        </ul>
        ${newRecord.admin_action_reason ? `<p><strong>Admin Note:</strong> ${newRecord.admin_action_reason}</p>` : ''}
        <p>You can view the details here: <a href="${appUrl}/request/${newRecord.id}">View Request</a></p>
        <p>Thank you,</p>
        <p>Your Payment Team</p>
      `;
      recipientEmails = [...adminEmails]; // Admins get status change alerts
      if (requesterEmail) recipientEmails.push(requesterEmail); // Requester also gets status change alerts

    } else {
      // No relevant event or status change, do nothing
      return new Response(JSON.stringify({ message: 'No relevant event or status change to notify' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (recipientEmails.length === 0) {
      console.warn('No recipients found for email notification.');
      return new Response(JSON.stringify({ message: 'No recipients found for email notification' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email
    const { data: emailData, error: resendError } = await resend.emails.send({
      from: 'jon.d@kassoehousing.com', // Updated with the specified email
      to: recipientEmails,
      subject: subject,
      html: htmlContent,
    });

    if (resendError) {
      console.error('Error sending email:', resendError);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Email sent successfully:', emailData);

    return new Response(JSON.stringify({ message: 'Email sent successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});