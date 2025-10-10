import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080'; // Fallback for APP_URL

    const testEmailRecipient = 'jon.d@kassoehousing.com'; // Sending to the same 'from' address for testing

    const subject = `Test Email from Supabase Edge Function - ${new Date().toLocaleString()}`;
    const htmlContent = `
      <p>Hello,</p>
      <p>This is a test email sent from your Supabase Edge Function.</p>
      <p>Your configured APP_URL is: <a href="${appUrl}">${appUrl}</a></p>
      <p>If you received this, your Resend API key and APP_URL are likely configured correctly!</p>
      <p>Best regards,</p>
      <p>Your Dyad App</p>
    `;

    const { data: emailData, error: resendError } = await resend.emails.send({
      from: 'jon.d@kassoehousing.com', // Use your specified sender email
      to: testEmailRecipient,
      subject: subject,
      html: htmlContent,
    });

    if (resendError) {
      console.error('Error sending test email:', resendError);
      return new Response(JSON.stringify({ error: 'Failed to send test email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Test email sent successfully:', emailData);

    return new Response(JSON.stringify({ message: 'Test email sent successfully' }), {
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