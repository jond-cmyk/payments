// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
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

// Helper to download file content using the service role client and return as base64
async function downloadFileAsBase64(supabaseClient: SupabaseClient, bucket: string, url: string): Promise<{ content: string, filename: string, mimeType: string }> {
  console.log(`[send-economic-emails] v2: Downloading file from URL: ${url} in bucket: ${bucket}`);
  
  const urlObject = new URL(url);
  const pathname = urlObject.pathname;
  
  // More robust path extraction. Finds the bucket name in the path and takes everything after it.
  const bucketIdentifier = `/${bucket}/`;
  const bucketIndex = pathname.indexOf(bucketIdentifier);
  
  if (bucketIndex === -1) {
    throw new Error(`Could not find bucket identifier '${bucketIdentifier}' in URL path: ${pathname}`);
  }
  
  // Get the path part of the URL and decode it to handle spaces or special characters in filenames.
  const filePath = decodeURIComponent(pathname.substring(bucketIndex + bucketIdentifier.length));
  console.log(`[send-economic-emails] v2: Extracted and decoded file path: ${filePath}`);

  const { data: blob, error: downloadError } = await supabaseClient.storage
    .from(bucket)
    .download(filePath);

  if (downloadError) {
    console.error(`[send-economic-emails] v2: Supabase storage download error for path ${filePath}:`, downloadError);
    throw new Error(`Failed to download file from storage: ${downloadError.message}`);
  }

  if (!blob) {
    throw new Error(`No file data returned for path: ${filePath}`);
  }

  const buffer = await blob.arrayBuffer();
  const base64Content = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  
  const filename = filePath.split('/').pop() || 'attachment';
  const mimeType = blob.type || 'application/octet-stream';

  console.log(`[send-economic-emails] v2: Successfully downloaded and encoded file: ${filename}, size: ${buffer.byteLength} bytes`);

  return { content: base64Content, filename, mimeType };
}


// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
      console.error('[send-economic-emails] Missing environment variables.');
      return new Response(JSON.stringify({ error: 'Missing environment variables.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const resend = new Resend(resendApiKey);
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    
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
    let bucket = '';

    if (table === 'payment_requests' && record.status === 'approved' && record.receipt_pdf_url) {
      subject = `Paid ${record.sku_number || 'N/A'}`;
      attachmentUrls.push(record.receipt_pdf_url);
      bucket = 'receipts';
      bodyText = `Payment Request #${record.id.substring(0, 8)} for ${record.supplier_name} has been approved and paid. Receipt attached.`;
      console.log(`[send-economic-emails] Processing Payment Request Approved: ${record.id}`);
    } else if (table === 'transactions' && record.status === 'completed' && record.receipt_urls && record.receipt_urls.length > 0) {
      subject = `Missing Receipt Entry ${record.entry || 'N/A'}`;
      attachmentUrls = record.receipt_urls;
      bucket = 'transaction_receipts';
      bodyText = `Transaction #${record.id.substring(0, 8)} (Entry: ${record.entry || 'N/A'}) has been completed and the receipt has been added.`;
      console.log(`[send-economic-emails] Processing Transaction Completed: ${record.id}`);
    } else {
      console.log(`[send-economic-emails] Record does not match required criteria. Table: ${table}, Status: ${record.status}. Skipping.`);
      return new Response(JSON.stringify({ message: 'No action required for this change.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let attachments: { content: string, filename: string }[] = [];
    if (attachmentUrls.length > 0) {
      const attachmentPromises = attachmentUrls.map(url => 
        downloadFileAsBase64(supabaseClient, bucket, url).catch(e => {
          console.error(`[send-economic-emails] Failed to download attachment from ${url}: ${e.message}`);
          return { error: e.message, url };
        })
      );

      const settledAttachments = await Promise.all(attachmentPromises);
      
      settledAttachments.forEach(result => {
        if ('content' in result) {
          attachments.push({
            filename: result.filename,
            content: result.content,
          });
        } else {
          bodyText += `\n\n[DEBUG] WARNING: Failed to attach document. URL: ${result.url}. Error: ${result.error}`;
        }
      });
    }

    if (attachments.length === 0) {
      bodyText += `\n\n[DEBUG] WARNING: No attachments could be processed for this email. Attachment URLs found: ${attachmentUrls.join(', ')}`;
      console.warn(`[send-economic-emails] No attachments processed for email with subject: ${subject}`);
    }

    console.log(`[send-economic-emails] Sending email to ${recipientEmail} with subject: ${subject} and ${attachments.length} attachments.`);
    
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: 'KH Payments <no-reply@khpayments.com>',
      to: [recipientEmail],
      subject: subject,
      html: `<p>${bodyText.replace(/\n/g, '<br>')}</p>`,
      attachments: attachments,
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