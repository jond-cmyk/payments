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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role key for backend operations
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { record: newPaymentRequest } = await req.json();

    if (!newPaymentRequest || !newPaymentRequest.id) {
      return new Response(JSON.stringify({ error: 'Missing new payment request data in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch requester's email and name
    const { data: requesterProfile, error: profileError } = await supabaseClient
      .from('profile_with_email') // Using the view to get email
      .select('first_name, last_name, user_email')
      .eq('id', newPaymentRequest.requester_id)
      .single();

    if (profileError || !requesterProfile) {
      console.error('Error fetching requester profile:', profileError?.message || 'Profile not found');
      return new Response(JSON.stringify({ error: 'Requester profile not found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterEmail = requesterProfile.user_email;
    const requesterName = `${requesterProfile.first_name || ''} ${requesterProfile.last_name || ''}`.trim() || 'Requester';

    if (!requesterEmail) {
      console.error('Requester email not found for user ID:', newPaymentRequest.requester_id);
      return new Response(JSON.stringify({ error: 'Requester email not available' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Resend client
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080'; // Fallback for local development

    // Send email to requester
    const { data: emailData, error: resendError } = await resend.emails.send({
      from: 'onboarding@resend.dev', // IMPORTANT: Replace with your VERIFIED sender email
      to: [requesterEmail],
      subject: `New Payment Request Submitted: #${newPaymentRequest.id.substring(0, 8)}`,
      html: `
        <p>Dear ${requesterName},</p>
        <p>Your new payment request (ID: <strong>#${newPaymentRequest.id.substring(0, 8)}</strong>) has been successfully submitted.</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>Supplier: ${newPaymentRequest.supplier_name}</li>
          <li>SKU: ${newPaymentRequest.sku_number}</li>
          <li>Reason: ${newPaymentRequest.reason_for_payment}</li>
          <li>Status: ${newPaymentRequest.status}</li>
        </ul>
        <p>You can view the details here: <a href="${appUrl}/request/${newPaymentRequest.id}">View Request</a></p>
        <p>We will notify you once it has been reviewed by an administrator.</p>
        <p>Thank you,</p>
        <p>Your Payment Team</p>
      `,
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