import { serve } from "https://deno.land/std@0.224.0/http/server.ts"; // Updated Deno std version
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@1.0.0/csv/mod.ts'; // Updated Deno std version for csv

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log environment variables for debugging
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log(`[upload-transactions] SUPABASE_URL: ${supabaseUrl ? 'Loaded' : 'NOT LOADED'}`);
    console.log(`[upload-transactions] SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceRoleKey ? 'Loaded' : 'NOT LOADED'}`);

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

    // Determine file type based on headers
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    const isCardTransactionFile = headers.includes('user_email') && headers.includes('original_transaction_id');
    const isGeneralTransactionFile = headers.includes('Date') && headers.includes('Text') && headers.includes('Amount') && headers.includes('Currency');

    if (!isCardTransactionFile && !isGeneralTransactionFile) {
      const msg = 'CSV file does not match expected format for either card or general transactions. Missing critical headers.';
      errors.push(msg);
      console.error('[upload-transactions] Invalid CSV format. Headers:', headers);
      return new Response(JSON.stringify({ message: msg, errors: errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const record of records) {
      console.log(`[upload-transactions] Processing record: ${JSON.stringify(record)}`);

      if (isCardTransactionFile) {
        const expectedCardHeaders = ['transaction_date', 'description', 'amount', 'currency', 'user_email', 'original_transaction_id'];
        const missingCardHeaders = expectedCardHeaders.filter(h => !headers.includes(h));
        if (missingCardHeaders.length > 0) {
            const msg = `Missing expected CSV headers for card transaction: ${missingCardHeaders.join(', ')}. Skipping record: ${JSON.stringify(record)}`;
            errors.push(msg);
            console.warn(`[upload-transactions] ${msg}`);
            continue;
        }

        const { transaction_date, description, amount, currency, user_email, original_transaction_id } = record;

        if (!transaction_date || !description || !amount || !currency || !user_email) {
          const msg = `Missing required fields (date, description, amount, currency, or user_email) for a card transaction. Skipping record: ${JSON.stringify(record)}`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
          const msg = `Invalid amount '${amount}' for card transaction '${description}'. Skipping record.`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }

        const { data: profile, error: profileError } = await supabaseClient
          .from('profile_with_email')
          .select('id')
          .eq('user_email', user_email)
          .single();

        if (profileError || !profile) {
          const msg = `Could not find user for email '${user_email}' for card transaction '${description}'. Error: ${profileError?.message || 'Profile not found'}.`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }
        console.log(`[upload-transactions] Found user ID: ${profile.id} for email: ${user_email}`);

        transactionsToInsert.push({
          requester_id: profile.id,
          uploaded_by_user_id: uploaderId,
          original_transaction_id: original_transaction_id || null,
          transaction_date: transaction_date,
          description: description,
          amount: parsedAmount,
          currency: currency,
          status: 'pending_input',
          receipt_urls: [], // Initialize as empty array
        });
      } else if (isGeneralTransactionFile) {
        const criticalGeneralHeaders = ['Date', 'Text', 'Amount', 'Currency'];
        const missingCriticalGeneralHeaders = criticalGeneralHeaders.filter(h => !headers.includes(h));
        if (missingCriticalGeneralHeaders.length > 0) {
            const msg = `Missing critical CSV headers for general transaction: ${missingCriticalGeneralHeaders.join(', ')}. Skipping record: ${JSON.stringify(record)}`;
            errors.push(msg);
            console.warn(`[upload-transactions] ${msg}`);
            continue;
        }

        let {
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
          const msg = `Missing required fields (Date, Text, Amount, or Currency) for a general transaction. Skipping record: ${JSON.stringify(record)}`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }

        // Reformat transaction_date from DD.MM.YYYY to YYYY-MM-DD
        const dateParts = transaction_date.split('.');
        if (dateParts.length === 3) {
          transaction_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        } else {
          const msg = `Invalid date format '${transaction_date}' for general transaction '${description}'. Expected DD.MM.YYYY. Skipping record.`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }

        const parsedAmount = parseFloat(amount.replace(',', '')); // Handle comma as decimal separator
        if (isNaN(parsedAmount)) {
          const msg = `Invalid amount '${amount}' for general transaction '${description}'. Skipping record.`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
          continue;
        }

        const parsedExchangeRate = exchange_rate ? parseFloat(exchange_rate.replace(',', '.')) : null; // Handle comma as decimal separator
        if (exchange_rate && isNaN(parsedExchangeRate)) {
          const msg = `Invalid exchange rate '${exchange_rate}' for general transaction '${description}'. Skipping record.`;
          errors.push(msg);
          console.warn(`[upload-transactions] ${msg}`);
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
          receipt_urls: [], // Initialize as empty array
        });
      }
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
        // If database insertion fails, this is a critical error, return 500
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
      // If there were errors during record processing, even if some were inserted, return 400
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