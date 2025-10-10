import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
    const { record: newRecord } = payload;

    if (!newRecord || !newRecord.id || !newRecord.sku_number || !newRecord.invoice_pdf_url) {
      return new Response(JSON.stringify({ error: 'Missing required payment request data in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const mailgunRegion = Deno.env.get('MAILGUN_REGION') || 'us';

    if (!mailgunApiKey || !mailgunDomain) {
      console.error('MAILGUN_API_KEY or MAILGUN_DOMAIN is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderEmail = `jon.d@${mailgunDomain}`; // Use the configured Mailgun domain
    const recipientEmail = '868bilag1677646@e-conomic.dk'; // Target email

    // Fetch the invoice PDF content
    const invoiceResponse = await fetch(newRecord.invoice_pdf_url);
    if (!invoiceResponse.ok) {
      throw new Error(`Failed to fetch invoice PDF from ${newRecord.invoice_pdf_url}: ${invoiceResponse.statusText}`);
    }
    const invoiceBlob = await invoiceResponse.blob(); // Get Blob for FormData

    // Determine filename from URL or default
    const urlParts = newRecord.invoice_pdf_url.split('/');
    const originalFileName = urlParts[urlParts.length - 1].split('?')[0];
    const fileName = originalFileName.endsWith('.pdf') ? originalFileName : `invoice_${newRecord.sku_number}.pdf`;

    const subject = `Paid ${newRecord.sku_number}`;
    const htmlContent = `
      <p>Dear Recipient,</p>
      <p>This email confirms that payment for request <strong>#${newRecord.id.substring(0, 8)}</strong> (SKU: ${newRecord.sku_number}) has been approved.</p>
      <p>The invoice is attached for your records.</p>
      <p>Thank you,</p>
      <p>Your Payment Team</p>
    `;

    const formData = new FormData();
    formData.append('from', `Dyad App <${senderEmail}>`);
    formData.append('to', recipientEmail);
    formData.append('subject', subject);
    formData.append('html', htmlContent);
    formData.append('attachment', invoiceBlob, fileName); // Append the blob with filename

    const mailgunApiBaseUrl = mailgunRegion === 'eu'
      ? `https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`
      : `https://api.mailgun.net/v3/${mailgunDomain}/messages`;

    const mailgunResponse = await fetch(mailgunApiBaseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`,
        // 'Content-Type': 'multipart/form-data' is automatically set by FormData
      },
      body: formData,
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error('Error sending approved invoice email via Mailgun:', mailgunResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Failed to send approved invoice email via Mailgun: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mailgunData = await mailgunResponse.json();
    console.log('Approved invoice email sent successfully via Mailgun:', mailgunData);

    return new Response(JSON.stringify({ message: 'Approved invoice email sent successfully via Mailgun', mailgunResponse: mailgunData }), {
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