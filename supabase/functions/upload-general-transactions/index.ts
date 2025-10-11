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

    let records: Record<string, string>[];
    try {
      records = await parse(fileContent, {
        header: true,
        separator: ',',
      }) as Record<string, string>[];
      console.log(`[upload-general-transactions] CSV parsed successfully. Number of records: ${records.length}`);
      console.log(`[upload-general-transactions] First parsed record: ${JSON.stringify(records[0])}`);
    } catch (csvParseError) {
      console.error('[upload-general-transactions] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transactionsToInsert = [];
    const errors: string[] = [];

    // Expected headers based on your new general_transactions table and CSV input
    const expectedHeaders = [
      'Approval', 'Type', 'Date', 'Entry', 'Text', 'Amount', 'Bank',
      'Contra account', 'Currency', 'Exchange rate', 'Comment', 'SKU', 'Reason For Payment', 'Requester Email'
    ];

    if (records.length > 0) {
        const actualHeaders = Object.keys(records[0]);
        const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
        // Only warn for missing headers that are NOT nullable in the DB and are critical for initial processing
        const criticalHeaders = ['Date', 'Text', 'Amount', 'Currency', 'Requester Email'];
        const missingCriticalHeaders = criticalHeaders.filter(h => !actualHeaders.includes(h));
        if (missingCriticalHeaders.length > 0) {
            errors.push(`Missing critical CSV headers: ${missingCriticalHeaders.join(', ')}. Please ensure these are present.`);
            console.error(`[upload-general-transactions] Missing critical headers: ${missingCriticalHeaders.join(', ')}`);
        }
    }

    for (const record of records) {
      console.log(`[upload-general-transactions] Processing record: ${JSON.stringify(record)}`);
      const {
        'Date': transaction_date,
        'Text': description,
        'Amount': amount,
        'Currency': currency,
        'Requester Email': requester_email, // Assuming this column exists for assignment
        'Type': type,
        'Entry': entry,
        'Bank': bank,
        'Contra account': contra_account,
        'Exchange rate': exchange_rate,
        'Comment': comment,
        'SKU': sku,
        'Reason For Payment': reason_for_payment,
      } = record;

      // Validate critical fields for insertion
      if (!transaction_date || !description || !amount || !currency || !requester_email) {
        errors.push(`Missing required fields (Date, Text, Amount, Currency, or Requester Email) for a transaction. Skipping record: ${JSON.stringify(record)}`);
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

      // Find requester_id from email
      const { data: requesterProfile, error: profileError } = await supabaseClient
        .from('profile_with_email')
        .select('id')
        .eq('user_email', requester_email)
        .single();

      if (profileError || !requesterProfile) {
        errors.push(`Could not find requester for email '${requester_email}' for transaction '${description}'. Error: ${profileError?.message || 'Profile not found'}.`);
        console.warn(`[upload-general-transactions] Skipping record due to requester not found: ${requester_email} for ${description}. Error: ${profileError?.message || 'Profile not found'}`);
        continue;
      }
      console.log(`[upload-general-transactions] Found requester ID: ${requesterProfile.id} for email: ${requester_email}`);

      transactionsToInsert.push({
        requester_id: requesterProfile.id,
        uploaded_by_user_id: uploaderId,
        status: 'pending_input', // Default status for newly uploaded transactions
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
        receipt_urls: [], // Initialize as empty array, to be filled by requester
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