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
    const { record: newAuditRecord } = payload;

    if (!newAuditRecord || !newAuditRecord.payment_request_id || !newAuditRecord.change_description) {
      return new Response(JSON.stringify({ error: 'Missing audit record data in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only proceed if the audit record is a comment
    if (!newAuditRecord.change_description.startsWith('Comment: ')) {
      return new Response(JSON.stringify({ message: 'Not a comment audit record, skipping notification' }), {
        status: 200,
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
    const senderEmail = `jon.d@khpayments.com`;

    // Fetch payment request details to get requester_id
    const { data: paymentRequest, error: requestError } = await supabaseClient
      .from('payment_requests')
      .select('id, requester_id, supplier_name, sku_number')
      .eq('id', newAuditRecord.payment_request_id)
      .single();

    if (requestError || !paymentRequest) {
      console.error('Error fetching payment request for comment notification:', requestError?.message || 'Payment request not found');
      return new Response(JSON.stringify({ error: 'Failed to fetch associated payment request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch Requester Details
    const { data: requesterProfile, error: requesterProfileError } = await supabaseClient
      .from('profile_with_email')
      .select('first_name, last_name, user_email')
      .eq('id', paymentRequest.requester_id)
      .single();

    if (requesterProfileError || !requesterProfile?.user_email) {
      console.error('Error fetching requester profile or email for comment notification:', requesterProfileError?.message || 'Requester email not found');
    }
    const requesterEmail = requesterProfile?.user_email;
    const requesterName = `${requesterProfile?.first_name || ''} ${requesterProfile?.last_name || ''}`.trim() || 'Requester';

    // Fetch Admin Emails
    const { data: adminProfiles, error: adminProfilesError } = await supabaseClient
      .from('profile_with_email')
      .select('user_email')
      .eq('role', 'admin');

    if (adminProfilesError) {
      console.error('Error fetching admin profiles for comment notification:', adminProfilesError.message);
    }
    const adminEmails = adminProfiles?.map(p => p.user_email).filter((email): email is string => !!email) || [];

    let recipientEmails: string[] = [...adminEmails];
    if (requesterEmail) recipientEmails.push(requesterEmail);

    if (recipientEmails.length === 0) {
      console.warn('No recipients found for comment email notification.');
      return new Response(JSON.stringify({ message: 'No recipients found for comment email notification' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const commentText = newAuditRecord.change_description.replace('Comment: ', '');
    const subject = `New Comment on Payment Request #${paymentRequest.id.substring(0, 8)}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>A new comment has been added to payment request <strong>#${paymentRequest.id.substring(0, 8)}</strong> (Supplier: ${paymentRequest.supplier_name}, SKU: ${paymentRequest.sku_number}).</p>
      <p><strong>Comment:</strong></p>
      <p>"${commentText}"</p>
      <p>You can view the request and respond here: <a href="${appUrl}/request/${paymentRequest.id}">View Request</a></p>
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
      console.error('Error sending comment email via Resend:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send comment email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Comment email sent successfully via Resend:', data);

    return new Response(JSON.stringify({ message: 'Comment email sent successfully via Resend' }), {
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