// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { Resend } from 'https://esm.sh/resend@3.4.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ECONOMIC_EMAILS = {
  'Switzerland': '868bilag1677646@e-conomic.dk',
  'United Kingdom': '505bilag1675383@e-conomic.dk',
};

// Helper to fetch file content from a public URL and return as base64
async function fetchFileAsBase64(url: string): Promise<{ content: string, filename: string, mimeType: string }> {
  console.log(`[send-economic-emails] Fetching file from URL: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from URL: ${url}. Status: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  const contentDisposition = response.headers.get('Content-Disposition');
  
  let filename = 'attachment';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (match && match[1]) {
      filename = match[1];
    }
  } else {
    // Fallback to extract filename from URL path
    const urlParts = new URL(url).pathname.split('/');
    filename = urlParts[urlParts.length - 1] || 'attachment';
  }

  const buffer = await response.arrayBuffer();
  // Deno's btoa is used for base64 encoding
  const base64Content = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  return { content: base64Content, filename, mimeType: contentType };
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[send-economic-emails] RESEND_API_KEY is missing.');
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is missing.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const resend = new Resend(resendApiKey);
    const payload = await req.json();
    const { record, table } = payload;

    if (!record || !table) {
      return new Response(JSON.stringify({ error: 'Missing record or table in payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const country = record.country;
    const recipientEmail = ECONOMIC_EMAILS[country as keyof typeof ECONOMIC_EMAILS];

    if (!recipientEmail) {
      console.log(`[send-economic-emails] No economic recipient configured for country: ${country}. Skipping email.`);
      return new Response(JSON.stringify({ message: `No recipient for country ${country}.` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subject = '';
    let attachmentUrls: string[] = [];
    let bodyText = '';

    if (table === 'payment_requests' && record.status === 'approved') {
      // Flow 1: Payment Request Approved
      subject = `Paid ${record.sku_number || 'N/A'}`;
      if (record.receipt_pdf_url) {
        attachmentUrls.push(record.receipt_pdf_url);
      }
      bodyText = `Payment Request #${record.id.substring(0, 8)} for ${record.supplier_name} has been approved and paid. Receipt attached.`;
      console.log(`[send-economic-emails] Processing Payment Request Approved: ${record.id}`);
    } else if (table === 'transactions' && record.status === 'completed' && record.receipt_urls && record.receipt_urls.length > 0) {
      // Flow 2: Transaction Completed (Receipt Added)
      subject = `Missing Receipt Entry ${record.entry || 'N/A'}`;
      attachmentUrls = record.receipt_urls; // Use the whole array of URLs
      bodyText = `Transaction #${record.id.substring(0, 8)} (Entry: ${record.entry || 'N/A'}) has been completed and the receipt has been added.`;
      console.log(`[send-economic-emails] Processing Transaction Completed: ${record.id}`);
    } else {
      console.log(`[send-economic-emails] Record does not match required criteria. Table: ${table}, Status: ${record.status}. Skipping.`);
      return new Response(JSON.stringify({ message: 'No action required for this change.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let attachments: { content: string, filename: string, mimeType: string }[] = [];
    if (attachmentUrls.length > 0) {
      const attachmentPromises = attachmentUrls.map(url => 
        fetchFileAsBase64(url).catch(e => {
          console.error(`[send-economic-emails] Failed to fetch attachment from ${url}: ${e.message}`);
          // Return a specific error object to handle it later
          return { error: e.message, url };
        })
      );

      const settledAttachments = await Promise.all(attachmentPromises);
      
      settledAttachments.forEach(result => {
        if ('content' in result) {
          attachments.push(result);
        } else {
          // Handle failed fetches by adding a warning to the email body
          bodyText += `\n\nWARNING: Failed to attach document from URL: ${result.url}`;
        }
      });
    }

    console.log(`[send-economic-emails] Sending email to ${recipientEmail} with subject: ${subject} and ${attachments.length} attachments.`);
    
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: 'KH Payments <no-reply@khpayments.com>',
      to: [recipientEmail],
      subject: subject,
      html: `<p>${bodyText.replace(/\n/g, '<br>')}</p>`,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (resendError) {
      console.error('[send-economic-emails] Resend API Error:', resendError);
      return new Response(JSON.stringify({ error: `Failed to send email via Resend: ${resendError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-economic-emails] Email sent successfully:', resendData);
    return new Response(JSON.stringify({ message: 'Email sent successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[send-economic-emails] Unhandled Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});