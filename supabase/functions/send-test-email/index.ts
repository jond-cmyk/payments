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
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN'); // e.g., 'khpayments.com'
    const mailgunRegion = Deno.env.get('MAILGUN_REGION') || 'us'; // 'us' or 'eu'

    if (!mailgunApiKey || !mailgunDomain) {
      console.error('MAILGUN_API_KEY or MAILGUN_DOMAIN is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const testEmailRecipient = 'jon.d@khpayments.com'; // Updated recipient for testing
    const senderEmail = `jon.d@${mailgunDomain}`; // Use the configured Mailgun domain

    const subject = `Test Email from Supabase Edge Function (Mailgun) - ${new Date().toLocaleString()}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a test email sent from your Supabase Edge Function using Mailgun.</p>
      <p>Your configured APP_URL is: <a href="${appUrl}">${appUrl}</a></p>
      <p>If you received this, your Mailgun API key, domain, and APP_URL are likely configured correctly!</p>
      <p>Best regards,</p>
      <p>Your Dyad App</p>
    `;

    const formData = new URLSearchParams();
    formData.append('from', `Dyad App <${senderEmail}>`);
    formData.append('to', testEmailRecipient);
    formData.append('subject', subject);
    formData.append('html', htmlContent);

    const mailgunApiBaseUrl = mailgunRegion === 'eu'
      ? `https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`
      : `https://api.mailgun.net/v3/${mailgunDomain}/messages`;

    const mailgunResponse = await fetch(mailgunApiBaseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`, // Base64 encode "api:YOUR_API_KEY"
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error('Error sending test email via Mailgun:', mailgunResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Failed to send test email via Mailgun: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mailgunData = await mailgunResponse.json();
    console.log('Test email sent successfully via Mailgun:', mailgunData);

    return new Response(JSON.stringify({ message: 'Test email sent successfully via Mailgun', mailgunResponse: mailgunData }), {
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