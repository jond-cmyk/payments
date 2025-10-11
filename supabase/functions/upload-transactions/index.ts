import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      const msg = 'Supabase URL or Service Role Key is missing in environment variables.';
      console.error(`[upload-transactions] Error: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let supabaseClient;
    try {
      supabaseClient = createClient(
        supabaseUrl,
        supabaseServiceRoleKey,
        {
          auth: {
            persistSession: false,
          },
        }
      );
      console.log('[upload-transactions] Supabase client created successfully.');
    } catch (clientError) {
      const msg = `Failed to create Supabase client: ${clientError.message}`;
      console.error(`[upload-transactions] Error: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { fileName, fileContent, uploaderId } = payload;

    if (!fileName || !fileContent || !uploaderId) {
      console.error('[upload-transactions] Missing file data or uploader ID in payload.');
      return new Response(JSON.stringify({ error: 'Missing file data or uploader ID in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-transactions] Received file: ${fileName} from uploader: ${uploaderId}`);
    console.log(`[upload-transactions] File content length: ${fileContent.length}`);

    let records: Record<string, string>[];
    try {
      records = await parse(fileContent, {
        header: true,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as Record<string, string>[];
      console.log(`[upload-transactions] CSV parsed successfully. Number of records: ${records.length}`);
      if (records.length > 0) {
        console.log(`[upload-transactions] First parsed record: ${JSON.stringify(records[0])}`);
      }
    } catch (csvParseError) {
      console.error('[upload-transactions] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transactionsToInsert = [];
    const errors: string[] = [];

    const headers = records.length > 0 ? Object.keys(records[0]) : [];

    // Define expected headers for the unified transaction format
    const criticalHeaders = ['Date', 'Text', 'Amount', 'Currency'];
    const missingCriticalHeaders = criticalHeaders.filter(h => !headers.includes(h));

    if (missingCriticalHeaders.length > 0) {
      const msg = `Missing critical CSV headers: ${missingCriticalHeaders.join(', ')}. Please ensure your CSV contains 'Date', 'Text', 'Amount', and 'Currency' columns.`;
      errors.push(msg);
      console.error('[upload-transactions] Invalid CSV format. Headers:', headers);
      return new Response(JSON.stringify({ message: msg, errors: errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const record of records) {
      console.log(`[upload-transactions] Processing record: ${JSON.stringify(record)}`);

      let {
        'Date': transaction_date_str,
        'Text': description,
        'Amount': amount_str,
        'Currency': currency,
        'Type': type,
        'Entry': entry,
        'Bank': bank,
        'Contra account': contra_account,
        'Exchange rate': exchange_rate_str,
        'Comment': comment,
        'SKU': sku,
        'Reason for Payment': reason_for_payment,
      } = record;

      // Validate required fields
      if (!transaction_date_str || !description || !amount_str || !currency) {
        const msg = `Missing required fields (Date, Text, Amount, or Currency). Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

      // Date reformatting from DD.MM.YYYY to YYYY-MM-DD
      const dateParts = transaction_date_str.split('.');
      if (dateParts.length !== 3) {
        const msg = `Invalid date format '${transaction_date_str}'. Expected DD.MM.YYYY. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }
      const transaction_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      // Amount parsing: remove thousands commas, then parse float
      const parsedAmount = parseFloat(amount_str.replace(/,/g, ''));
      if (isNaN(parsedAmount)) {
        const msg = `Invalid amount '${amount_str}'. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

      // Exchange rate parsing: replace comma decimal with period, then parse float
      let parsedExchangeRate: number | null = null;
      if (exchange_rate_str) {
        parsedExchangeRate = parseFloat(exchange_rate_str.replace(',', '.'));
        if (isNaN(parsedExchangeRate)) {
          const msg = `Invalid exchange rate '${exchange_rate_str}'. Skipping record: ${JSON.stringify(record)}`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }
      }

      transactionsToInsert.push({
        requester_id: uploaderId, // Default to uploaderId as no user_email column in this CSV
        uploaded_by_user_id: uploaderId,
        original_transaction_id: null, // Not present in this CSV
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

    console.log(`[upload-transactions] Transactions prepared for insertion: ${transactionsToInsert.length}`);
    if (transactionsToInsert.length > 0) {
      console.log(`[upload-transactions] First transaction to insert: ${JSON.stringify(transactionsToInsert[0])}`);
    }

    if (transactionsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('transactions')
        .insert(transactionsToInsert)
        .select();

      if (insertError) {
        console.error('[upload-transactions] Failed to insert transactions into database:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert transactions into database: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`[upload-transactions] Successfully inserted ${insertData?.length || 0} transactions.`);
    } else {
      console.warn('[upload-transactions] No transactions to insert after processing.');
    }

    let message = `${transactionsToInsert.length} transactions processed successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors. Please check logs for details.`;
      console.error('[upload-transactions] Transaction processing errors summary:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-transactions] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});