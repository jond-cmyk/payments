import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.190.0/csv/mod.ts';

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
    const { fileName, fileContent, uploaderId } = payload;

    if (!fileName || !fileContent || !uploaderId) {
      return new Response(JSON.stringify({ error: 'Missing file data or uploader ID in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-general-transactions] Received file: ${fileName} from uploader: ${uploaderId}`);
    console.log(`[upload-general-transactions] File content (first 200 chars): ${fileContent.substring(0, 200)}`);
    console.log(`[upload-general-transactions] File content length: ${fileContent.length}`);
    console.log(`[upload-general-transactions] File content (raw, full string): "${fileContent}"`);

    let cleanedFileContent = fileContent;
    // Remove extraneous outer quotes if the entire content is wrapped in them
    if (cleanedFileContent.startsWith('"') && cleanedFileContent.endsWith('"')) {
      cleanedFileContent = cleanedFileContent.substring(1, cleanedFileContent.length - 1);
    }
    console.log(`[upload-general-transactions] Cleaned file content (first 200 chars): ${cleanedFileContent.substring(0, 200)}`);

    const lines = cleanedFileContent.split(/\r?\n/); // Split by newline, handling both \n and \r\n
    if (lines.length < 2) { // Need at least a header and one data row
      return new Response(JSON.stringify({ error: 'CSV file must contain at least a header and one data row.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headerLine = lines[0];
    const rawHeaders = headerLine.split(',');
    const headers = rawHeaders.map(h => h.trim()); // Trim whitespace from each header

    const dataContent = lines.slice(1).join('\n'); // Reconstruct data content without header

    let parsedDataRows: Array<Array<string>>;
    try {
      parsedDataRows = await parse(dataContent, {
        header: false, // Now we explicitly say no header, as we handled it
        separator: ',',
        trimLeadingWhitespace: true,
      }) as Array<Array<string>>;
      console.log(`[upload-general-transactions] CSV data parsed successfully (without header). Number of data rows: ${parsedDataRows.length}`);
      if (parsedDataRows.length > 0) {
        console.log(`[upload-general-transactions] First parsed data row (array): ${JSON.stringify(parsedDataRows[0])}`);
      }
    } catch (csvParseError) {
      console.error('[upload-general-transactions] CSV data parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV data: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transactionsToInsert = [];
    const errors: string[] = [];

    const criticalHeaders = ['Date', 'Text', 'Amount', 'Currency'];
    const missingCriticalHeaders = criticalHeaders.filter(h => !headers.includes(h));
    if (missingCriticalHeaders.length > 0) {
        errors.push(`Missing critical CSV headers: ${missingCriticalHeaders.join(', ')}. Please ensure these are present.`);
        console.error(`[upload-general-transactions] Missing critical headers: ${missingCriticalHeaders.join(', ')}`);
        console.error(`[upload-general-transactions] All actual headers found: ${JSON.stringify(headers)}`);
        // If critical headers are missing, we should stop processing this file
        return new Response(JSON.stringify({ message: 'Failed to process file due to missing critical headers.', errors: errors }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    for (const dataRow of parsedDataRows) {
      if (dataRow.length !== headers.length) {
        errors.push(`Skipping row due to column count mismatch with headers. Expected ${headers.length}, got ${dataRow.length}. Row: ${JSON.stringify(dataRow)}`);
        console.warn(`[upload-general-transactions] Skipping row due to column count mismatch: ${JSON.stringify(dataRow)}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = dataRow[index];
      });

      console.log(`[upload-general-transactions] Processing record (mapped): ${JSON.stringify(record)}`);
      const {
        'Date': transaction_date,
        'Text': description,
        'Amount': amount,
        'Currency': currency,
        'Type': type,
        'Entry': entry,
        'Bank': bank,
        'Contra account': contra_account,
        'Exchange rate': exchange_rate,
        'Comment': comment,
        'SKU': sku,
        'Reason for Payment': reason_for_payment,
      } = record;

      if (!transaction_date || !description || !amount || !currency) {
        errors.push(`Missing required fields (Date, Text, Amount, or Currency) for a transaction. Skipping record: ${JSON.stringify(record)}`);
        console.warn(`[upload-general-transactions] Skipping record due to missing critical fields: ${JSON.stringify(record)}`);
        continue;
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        errors.push(`Invalid amount '${amount}' for transaction '${description}'. Skipping record.`);
        console.warn(`[upload-general-transactions] Skipping record due to invalid amount: ${description}`);
        continue;
      }

      const parsedExchangeRate = exchange_rate ? parseFloat(exchange_rate) : null;
      if (exchange_rate && isNaN(parsedExchangeRate)) {
        errors.push(`Invalid exchange rate '${exchange_rate}' for transaction '${description}'. Skipping record.`);
        console.warn(`[upload-general-transactions] Skipping record due to invalid exchange rate: ${description}`);
        continue;
      }

      transactionsToInsert.push({
        requester_id: uploaderId,
        uploaded_by_user_id: uploaderId,
        status: 'pending_input',
        type: type || null,
        transaction_date: transaction_date,
        entry: entry || null,
        description: description,
        amount: parsedAmount,
        bank: bank || null,
        contra_account: contra_account || null,
        currency: currency,
        exchange_rate: parsedExchangeRate,
        comment: comment || null,
        sku: sku || null,
        reason_for_payment: reason_for_payment || null,
        receipt_urls: [],
      });
    }

    console.log(`[upload-general-transactions] General transactions prepared for insertion: ${transactionsToInsert.length}`);
    console.log(`[upload-general-transactions] First transaction to insert: ${JSON.stringify(transactionsToInsert[0])}`);

    if (transactionsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('general_transactions')
        .insert(transactionsToInsert)
        .select();

      if (insertError) {
        console.error('[upload-general-transactions] Failed to insert general transactions into database:', insertError);
        throw new Error(`Failed to insert general transactions into database: ${insertError.message}`);
      }
      console.log(`[upload-general-transactions] Successfully inserted ${insertData?.length || 0} general transactions.`);
    } else {
      console.warn('[upload-general-transactions] No general transactions to insert after processing.');
    }

    let message = `${transactionsToInsert.length} general transactions processed successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors. Please check logs for details.`;
      console.error('[upload-general-transactions] General transaction processing errors summary:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-general-transactions] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});