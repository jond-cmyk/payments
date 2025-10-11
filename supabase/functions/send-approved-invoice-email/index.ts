import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
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

    // Check for invoice_pdf_urls (array) and ensure it's not empty
    if (!newRecord || !newRecord.id || !newRecord.sku_number || !newRecord.invoice_pdf_urls || newRecord.invoice_pdf_urls.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required payment request data (id, sku_number, or invoice_pdf_urls) in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY'); // Use Resend API Key

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey); // Initialize Resend client

    const senderEmail = `jon.d@khpayments.com`; // Use your verified Resend sender email/domain
    const recipientEmail = '868bilag1677646@e-conomic.dk'; // Target email

    const attachments = await Promise.all(newRecord.invoice_pdf_urls.map(async (invoicePdfUrl: string, index: number) => {
      const invoiceResponse = await fetch(invoicePdfUrl);
      if (!invoiceResponse.ok) {
        throw new Error(`Failed to fetch invoice PDF from ${invoicePdfUrl}: ${invoiceResponse.statusText}`);
      }
      const invoiceBlob = await invoiceResponse.blob();
      const arrayBuffer = await invoiceBlob.arrayBuffer();
      const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))); // Base64 encode

      const urlParts = invoicePdfUrl.split('/');
      const originalFileName = urlParts[urlParts.length - 1].split('?')[0];
      const fileName = originalFileName.endsWith('.pdf') ? originalFileName : `invoice_${newRecord.sku_number}_${index + 1}.pdf`;

      return {
        filename: fileName,
        content: base64Content,
      };
    }));

    const subject = `Paid ${newRecord.sku_number}`;
    const htmlContent = `
      <p>Dear Recipient,</p>
      <p>This email confirms that payment for request <strong>#${newRecord.id.substring(0, 8)}</strong> (SKU: ${newRecord.sku_number}) has been approved.</p>
      <p>The invoice(s) are attached for your records.</p>
      <p>Thank you,</p>
      <p>Your Payment Team</p>
    `;

    const { data, error: resendError } = await resend.emails.send({
      from: senderEmail,
      to: [recipientEmail],
      subject: subject,
      html: htmlContent,
      attachments: attachments,
    });

    if (resendError) {
      console.error('Error sending approved invoice email via Resend:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send approved invoice email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Approved invoice email sent successfully via Resend:', data);

    return new Response(JSON.stringify({ message: 'Approved invoice email sent successfully via Resend' }), {
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