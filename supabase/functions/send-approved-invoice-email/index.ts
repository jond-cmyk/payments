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
    const { record: newRecord } = payload; // Expecting the full new record

    if (!newRecord || !newRecord.id || !newRecord.sku_number || !newRecord.invoice_pdf_url) {
      return new Response(JSON.stringify({ error: 'Missing required payment request data in payload' }), {
        status: 400,
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

    // Fetch the invoice PDF content
    const invoiceResponse = await fetch(newRecord.invoice_pdf_url);
    if (!invoiceResponse.ok) {
      throw new Error(`Failed to fetch invoice PDF from ${newRecord.invoice_pdf_url}: ${invoiceResponse.statusText}`);
    }
    const invoiceBuffer = await invoiceResponse.arrayBuffer(); // Get ArrayBuffer

    // Determine filename from URL or default
    const urlParts = newRecord.invoice_pdf_url.split('/');
    const originalFileName = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
    const fileName = originalFileName.endsWith('.pdf') ? originalFileName : `invoice_${newRecord.sku_number}.pdf`;

    const subject = `Paid ${newRecord.sku_number}`;
    const htmlContent = `
      <p>Dear Recipient,</p>
      <p>This email confirms that payment for request <strong>#${newRecord.id.substring(0, 8)}</strong> (SKU: ${newRecord.sku_number}) has been approved.</p>
      <p>The invoice is attached for your records.</p>
      <p>Thank you,</p>
      <p>Your Payment Team</p>
    `;

    const { data: emailData, error: resendError } = await resend.emails.send({
      from: 'jon.d@kassoehousing.com', // Specified email
      to: '868bilag1677646@e-conomic.dk', // Target email
      subject: subject,
      html: htmlContent,
      attachments: [
        {
          filename: fileName,
          content: new Uint8Array(invoiceBuffer), // Deno-compatible content
        },
      ],
    });

    if (resendError) {
      console.error('Error sending email:', resendError);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Approved invoice email sent successfully:', emailData);

    return new Response(JSON.stringify({ message: 'Approved invoice email sent successfully' }), {
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