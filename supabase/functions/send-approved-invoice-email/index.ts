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

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');

    if (!brevoApiKey) {
      console.error('BREVO_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderEmail = `jon.d@khpayments.com`; // Use your verified Brevo sender email/domain
    const recipientEmail = '868bilag1677646@e-conomic.dk'; // Target email

    // Fetch the invoice PDF content
    const invoiceResponse = await fetch(newRecord.invoice_pdf_url);
    if (!invoiceResponse.ok) {
      throw new Error(`Failed to fetch invoice PDF from ${newRecord.invoice_pdf_url}: ${invoiceResponse.statusText}`);
    }
    const invoiceBlob = await invoiceResponse.blob();
    const arrayBuffer = await invoiceBlob.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))); // Base64 encode

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

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail },
        to: [{ email: recipientEmail }],
        subject: subject,
        htmlContent: htmlContent,
        attachments: [
          {
            content: base64Content,
            name: fileName,
          },
        ],
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      console.error('Error sending approved invoice email via Brevo:', brevoResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Failed to send approved invoice email via Brevo: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Approved invoice email sent successfully via Brevo.');

    return new Response(JSON.stringify({ message: 'Approved invoice email sent successfully via Brevo' }), {
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