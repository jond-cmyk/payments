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
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');

    if (!sendgridApiKey) {
      console.error('SENDGRID_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const testEmailRecipient = 'jon.d@khpayments.com'; // Sending to the same 'from' address for testing
    const senderEmail = `jon.d@khpayments.com`; // Use your verified SendGrid sender email/domain

    const subject = `Test Email from Supabase Edge Function (SendGrid) - ${new Date().toLocaleString()}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a test email sent from your Supabase Edge Function using SendGrid.</p>
      <p>Your configured APP_URL is: <a href="${appUrl}">${appUrl}</a></p>
      <p>If you received this, your SendGrid API key and domain are likely configured correctly!</p>
      <p>Best regards,</p>
      <p>Your Dyad App</p>
    `;

    const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: testEmailRecipient }],
        }],
        from: { email: senderEmail },
        subject: subject,
        content: [{
          type: 'text/html',
          value: htmlContent,
        }],
      }),
    });

    if (!sendgridResponse.ok) {
      const errorText = await sendgridResponse.text();
      console.error('Error sending test email via SendGrid:', sendgridResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Failed to send test email via SendGrid: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Test email sent successfully via SendGrid.');

    return new Response(JSON.stringify({ message: 'Test email sent successfully via SendGrid' }), {
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