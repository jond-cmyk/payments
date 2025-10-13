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

  console.log('[send-missing-receipt-notification] Edge Function invoked.');

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

    console.log('[send-missing-receipt-notification] Received payload:', JSON.stringify(payload));

    if (!newRecord || !newRecord.id || !newRecord.entry) {
      const errorMessage = 'Missing required transaction data (id or entry) in payload for missing receipt notification.';
      console.error('[send-missing-receipt-notification] Edge Function Error (400):', errorMessage, 'Payload:', JSON.stringify(payload));
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    console.log(`[send-missing-receipt-notification] RESEND_API_KEY loaded: ${!!resendApiKey}`); // ADDED LOG
    if (!resendApiKey) {
      console.error('[send-missing-receipt-notification] RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
    const senderEmail = `jon.d@khpayments.com`;
    
    // Determine recipient email based on country
    let recipientEmail = '868bilag1677646@e-conomic.dk'; // Default email
    if (newRecord.country === 'United Kingdom') {
      recipientEmail = '505bilag1675383@e-conomic.dk'; // UK specific email
    }
    console.log(`[send-missing-receipt-notification] Sending to: ${recipientEmail} for country: ${newRecord.country}`);

    const subject = `Receipt Added for Transaction - ${newRecord.entry}`; // Updated subject
    const htmlContent = `
      <p>Hello,</p>
      <p>A receipt has been successfully added for transaction <strong>#${newRecord.id.substring(0, 8)}</strong> (Entry: ${newRecord.entry}).</p>
      <p><strong>Transaction Details:</strong></p>
      <ul>
        <li>Description: ${newRecord.description}</li>
        <li>Amount: ${newRecord.currency} ${newRecord.amount?.toFixed(2) || '0.00'}</li>
        <li>Date: ${newRecord.transaction_date}</li>
      </ul>
      <p>You can view the transaction details here: <a href="${appUrl}/transaction/${newRecord.id}">View Transaction</a></p>
      <p>Thank you,</p>
      <p>Your Payment Team</p>
    `;

    const attachments = [];
    if (newRecord.receipt_urls && newRecord.receipt_urls.length > 0) {
      console.log(`[send-missing-receipt-notification] Processing ${newRecord.receipt_urls.length} receipt URLs.`);
      for (const receiptUrl of newRecord.receipt_urls) {
        try {
          console.log(`[send-missing-receipt-notification] Fetching receipt from: ${receiptUrl}`);
          const receiptResponse = await fetch(receiptUrl);
          if (!receiptResponse.ok) {
            console.warn(`[send-missing-receipt-notification] Failed to fetch receipt PDF from ${receiptUrl}: ${receiptResponse.statusText}. Skipping this attachment.`);
            continue;
          }
          const receiptBlob = await receiptResponse.blob();
          const arrayBuffer = await receiptBlob.arrayBuffer();
          const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

          const urlParts = receiptUrl.split('/');
          const originalFileName = urlParts[urlParts.length - 1].split('?')[0];
          const fileName = originalFileName.endsWith('.pdf') ? originalFileName : `receipt_${newRecord.entry}_${attachments.length + 1}.pdf`;

          attachments.push({
            filename: fileName,
            content: base64Content,
          });
          console.log(`[send-missing-receipt-notification] Successfully attached ${fileName}.`);
        } catch (fetchError: any) {
          console.error(`[send-missing-receipt-notification] Error processing receipt URL ${receiptUrl}: ${fetchError.message}`);
        }
      }
    }

    if (attachments.length === 0) {
      console.warn('[send-missing-receipt-notification] No valid receipt PDFs could be attached. Sending email without attachments.');
    }

    console.log('[send-missing-receipt-notification] Sending email via Resend...');
    const { data, error: resendError } = await resend.emails.send({
      from: senderEmail,
      to: [recipientEmail],
      subject: subject,
      html: htmlContent,
      attachments: attachments,
    });

    if (resendError) {
      console.error('[send-missing-receipt-notification] Error sending missing receipt email via Resend:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send missing receipt email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-missing-receipt-notification] Missing receipt email sent successfully via Resend:', data);

    return new Response(JSON.stringify({ message: 'Missing receipt email sent successfully via Resend' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[send-missing-receipt-notification] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});