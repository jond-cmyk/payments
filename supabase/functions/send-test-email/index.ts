import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@1.1.0'; // Import Resend

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY'); // Use Resend API Key

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey); // Initialize Resend client

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const testEmailRecipient = 'notifications@khpayments.com';
    const senderEmail = `jon.d@khpayments.com`; // Use your verified Resend sender email/domain

    const subject = `Test Email from Supabase Edge Function (Resend) - ${new Date().toLocaleString()}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a test email sent from your Supabase Edge Function using Resend.</p>
      <p>Your configured APP_URL is: <a href="${appUrl}">${appUrl}</a></p>
      <p>If you received this, your Resend API key and domain are likely configured correctly!</p>
      <p>Best regards,</p>
      <p>Your Dyad App</p>
    `;

    const { data, error: resendError } = await resend.emails.send({
      from: senderEmail,
      to: [testEmailRecipient],
      subject: subject,
      html: htmlContent,
    });

    if (resendError) {
      console.error('Error sending test email via Resend:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send test email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Test email sent successfully via Resend:', data);

    return new Response(JSON.stringify({ message: 'Test email sent successfully via Resend' }), {
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