import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');

    if (!brevoApiKey) {
      console.error('BREVO_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const testEmailRecipient = 'notifications@khpayments.com'; // Changed recipient
    const senderEmail = `jon.d@khpayments.com`; // Use your verified Brevo sender email/domain

    const subject = `Test Email from Supabase Edge Function (Brevo) - ${new Date().toLocaleString()}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a test email sent from your Supabase Edge Function using Brevo.</p>
      <p>Your configured APP_URL is: <a href="${appUrl}">${appUrl}</a></p>
      <p>If you received this, your Brevo API key and domain are likely configured correctly!</p>
      <p>Best regards,</p>
      <p>Your Dyad App</p>
    `;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail },
        to: [{ email: testEmailRecipient }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      console.error('Error sending test email via Brevo:', brevoResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Failed to send test email via Brevo: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Test email sent successfully via Brevo.');

    return new Response(JSON.stringify({ message: 'Test email sent successfully via Brevo' }), {
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