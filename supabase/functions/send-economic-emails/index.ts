// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { Resend } from 'https://esm.sh/resend@3.4.0';
// @ts-ignore
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ECONOMIC_EMAILS = {
  'Switzerland': '868bilag1677646@e-conomic.dk',
  'United Kingdom': '505bilag1675383@e-conomic.dk',
  'Ireland': '', 
};

// Helper to download file content as ArrayBuffer
async function downloadFileAsBuffer(supabaseClient: SupabaseClient, bucket: string, url: string): Promise<{ buffer: ArrayBuffer, filename: string, mimeType: string }> {
  console.log(`[send-economic-emails] Downloading: ${url}`);
  
  const urlObject = new URL(url);
  const pathname = urlObject.pathname;
  const publicPathSegment = `/storage/v1/object/public/${bucket}/`;
  const pathIndex = pathname.indexOf(publicPathSegment);

  if (pathIndex === -1) throw new Error(`Invalid URL path: ${pathname}`);
  
  const filePath = decodeURIComponent(pathname.substring(pathIndex + publicPathSegment.length));

  const { data: blob, error } = await supabaseClient.storage
    .from(bucket)
    .download(filePath);

  if (error) throw new Error(`Download error: ${error.message}`);
  if (!blob) throw new Error(`No data for: ${filePath}`);

  const buffer = await blob.arrayBuffer();
  const filename = filePath.split('/').pop() || 'attachment';
  return { buffer, filename, mimeType: blob.type };
}

// Helper to create the Summary PDF Page
async function createSummaryPdf(record: any): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const fontSize = 10;
  const titleSize = 18;
  const margin = 50;
  let y = height - margin;

  const drawText = (text: string, x: number, yPos: number, fontRef = font, size = fontSize, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y: yPos, size, font: fontRef, color });
  };

  const drawLabelValue = (label: string, value: string, x: number, yPos: number) => {
    drawText(label, x, yPos, boldFont, 9, rgb(0.4, 0.4, 0.4));
    drawText(value || 'N/A', x, yPos - 12, font, 10, rgb(0, 0, 0));
  };

  // --- Header ---
  drawText("Payment Request Summary", margin, y, boldFont, titleSize, rgb(0, 0.45, 0.56)); // Dyad Blue-ish
  y -= 25;
  drawText(`ID: #${record.id.substring(0, 8).toUpperCase()}`, margin, y, font, 10, rgb(0.3, 0.3, 0.3));
  drawText(`Date: ${new Date().toISOString().split('T')[0]}`, width - margin - 100, y, font, 10);
  y -= 30;

  // --- Overview ---
  drawText("Overview", margin, y, boldFont, 12, rgb(0, 0.45, 0.56));
  y -= 20;
  drawLabelValue("Status", (record.status || '').toUpperCase(), margin, y);
  drawLabelValue("Requester ID", record.requester_id || 'Unknown', margin + 150, y);
  drawLabelValue("Urgent", record.is_urgent ? "YES" : "No", margin + 300, y);
  y -= 40;

  // --- Supplier & Property ---
  drawText("Supplier & Property", margin, y, boldFont, 12, rgb(0, 0.45, 0.56));
  y -= 20;
  drawLabelValue("Supplier Name", record.supplier_name, margin, y);
  drawLabelValue("Country", record.country, margin + 250, y);
  y -= 35;
  drawLabelValue("Address", (record.supplier_address || '').substring(0, 60) + (record.supplier_address?.length > 60 ? '...' : ''), margin, y);
  y -= 35;
  drawLabelValue("SKU", record.not_sku_related ? "N/A (Not SKU Related)" : record.sku_number, margin, y);
  drawLabelValue("Lease ID", record.lease_id, margin + 150, y);
  y -= 40;

  // --- Financials ---
  drawText("Financials", margin, y, boldFont, 12, rgb(0, 0.45, 0.56));
  y -= 20;
  
  // Table Header
  drawText("Category", margin, y, boldFont, 9);
  drawText(`Amount (${record.currency})`, width - margin - 100, y, boldFont, 9);
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 15;

  // Categories
  if (record.categories && Array.isArray(record.categories)) {
    record.categories.forEach((cat: any) => {
      drawText(cat.category, margin, y, font, 10);
      drawText(Number(cat.amount).toFixed(2), width - margin - 100, y, font, 10);
      y -= 15;
    });
  }
  
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 15;
  drawText("Total Amount", margin, y, boldFont, 10);
  drawText(`${Number(record.total_amount).toFixed(2)}`, width - margin - 100, y, boldFont, 10);
  y -= 30;

  drawLabelValue("Notes", record.reason_for_payment, margin, y);
  y -= 40;

  // --- Bank Details ---
  drawText("Bank Details", margin, y, boldFont, 12, rgb(0, 0.45, 0.56));
  y -= 20;
  
  if (record.country === 'United Kingdom') {
    drawLabelValue("Account Name", record.bank_account_name, margin, y);
    drawLabelValue("Sort Code", record.sort_code, margin + 150, y);
    drawLabelValue("Account Number", record.account_number, margin + 300, y);
  } else {
    drawLabelValue("IBAN", record.iban_number, margin, y);
    if (record.bank_account_name) {
      drawLabelValue("Account Name", record.bank_account_name, margin + 250, y);
    }
  }
  
  y -= 35;
  drawLabelValue("Verified?", record.bank_details_verified ? "Yes" : "No", margin, y);

  // Footer
  drawText("KH Payments System", margin, 30, font, 8, rgb(0.5, 0.5, 0.5));

  return doc;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing environment variables.');
    }
    
    const resend = new Resend(resendApiKey);
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    
    const { record, table } = await req.json();

    if (!record || !table) throw new Error('Missing record or table.');

    const country = record.country;
    const recipientEmail = ECONOMIC_EMAILS[country as keyof typeof ECONOMIC_EMAILS];

    if (!recipientEmail) {
      return new Response(JSON.stringify({ message: `No recipient for country ${country}.` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subject = '';
    let bodyText = '';
    let bucket = '';
    let attachmentUrls: string[] = [];
    let combinedPdfBuffer: Uint8Array | null = null;
    let filename = '';

    if (table === 'payment_requests' && record.status === 'approved') {
      console.log(`[send-economic-emails] Processing Payment Request #${record.id}`);
      subject = `Invoice ${record.sku_number || 'N/A'} - ${record.supplier_name}`;
      bucket = 'invoices';
      attachmentUrls = record.invoice_pdf_urls || [];
      bodyText = `Payment Request #${record.id.substring(0, 8)} approved. See attached combined PDF.`;
      filename = `Request_${record.id.substring(0,8)}.pdf`;

      // 1. Generate Summary PDF
      const pdfDoc = await createSummaryPdf(record);

      // 2. Merge Attachments
      if (attachmentUrls.length > 0) {
        for (const url of attachmentUrls) {
          try {
            const { buffer, mimeType } = await downloadFileAsBuffer(supabaseClient, bucket, url);
            
            if (mimeType === 'application/pdf') {
              const attachmentPdf = await PDFDocument.load(buffer);
              const copiedPages = await pdfDoc.copyPages(attachmentPdf, attachmentPdf.getPageIndices());
              copiedPages.forEach(page => pdfDoc.addPage(page));
            } else if (['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
              let image;
              if (mimeType === 'image/png') image = await pdfDoc.embedPng(buffer);
              else image = await pdfDoc.embedJpg(buffer);
              
              const page = pdfDoc.addPage();
              const { width, height } = page.getSize();
              const dims = image.scaleToFit(width - 40, height - 40);
              page.drawImage(image, {
                x: (width - dims.width) / 2,
                y: (height - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
            }
          } catch (e) {
            console.error(`Failed to merge attachment ${url}:`, e);
            bodyText += `\n\n[Warning] Failed to merge attachment: ${url}`;
          }
        }
      }
      
      const base64Pdf = await pdfDoc.saveAsBase64();
      
      const attachments = [{
        filename: filename,
        content: base64Pdf, 
        contentType: 'application/pdf' 
      }];

      const { data, error } = await resend.emails.send({
        from: 'KH Payments <no-reply@khpayments.com>',
        to: [recipientEmail],
        subject: subject,
        html: `<p>${bodyText.replace(/\n/g, '<br>')}</p>`,
        attachments: attachments,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ message: 'Email sent with combined PDF.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (table === 'transactions' && record.status === 'completed' && record.receipt_urls?.length > 0) {
      // Logic for transactions/receipts remains simple (just attach files, no summary merge for now)
      subject = `Missing Receipt Entry ${record.entry || 'N/A'}`;
      bucket = 'transaction_receipts';
      bodyText = `Transaction #${record.id.substring(0, 8)} receipt added.`;
      
      const attachments = [];
      for (const url of record.receipt_urls) {
        const { buffer, filename } = await downloadFileAsBuffer(supabaseClient, bucket, url);
        // Convert buffer to base64 for Resend
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        attachments.push({ filename, content: base64Content });
      }

      await resend.emails.send({
        from: 'KH Payments <no-reply@khpayments.com>',
        to: [recipientEmail],
        subject: subject,
        html: `<p>${bodyText}</p>`,
        attachments: attachments,
      });

      return new Response(JSON.stringify({ message: 'Receipt email sent.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'No action required.' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[send-economic-emails] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});