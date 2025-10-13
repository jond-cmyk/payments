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
    const { fileName, fileContent, uploaderId, country } = payload; // Extract country from payload

    if (!fileName || !fileContent || !uploaderId || !country) { // Country is now required
      console.error('[upload-transactions] Missing file data, uploader ID, or country in payload.');
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-transactions] Received file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);
    console.log(`[upload-transactions] File content length: ${fileContent.length}`);

    // Removed fetching uploader's country, as it's now provided in the payload

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-transactions] CSV parsed successfully. Number of rows: ${parsedRows.length}`);
      if (parsedRows.length > 0) {
        console.log(`[upload-transactions] First parsed row (potential headers): ${JSON.stringify(parsedRows[0])}`);
      }
    } catch (csvParseError) {
      console.error('[upload-transactions] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (parsedRows.length === 0) {
      return new Response(JSON.stringify({ error: 'CSV file is empty or contains no data rows.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    console.log(`[upload-transactions] Extracted headers: ${JSON.stringify(headers)}`);
    console.log(`[upload-transactions] Number of data rows: ${dataRows.length}`);

    const transactionsToInsert = [];
    const errors: string[] = [];

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

    // Fetch existing 'entry' values from the database for uniqueness check, filtered by the provided country
    const { data: existingEntriesData, error: fetchEntriesError } = await supabaseClient
      .from('transactions')
      .select('entry')
      .eq('country', country); // Filter existing entries by the provided country

    if (fetchEntriesError) {
      console.error('[upload-transactions] Error fetching existing entries:', fetchEntriesError);
      return new Response(JSON.stringify({ error: `Failed to fetch existing entries for uniqueness check: ${fetchEntriesError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingEntries = new Set(existingEntriesData?.map(row => row.entry).filter(Boolean) || []);
    console.log(`[upload-transactions] Fetched ${existingEntries.size} existing unique entries for country ${country}.`);

    const userEmailToIdCache = new Map<string, string | null>();

    for (const row of dataRows) {
      if (row.length !== headers.length) {
        const msg = `Row has a different number of columns than headers. Skipping row: ${JSON.stringify(row)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

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
        'user_email': user_email_from_csv,
      } = record;

      if (!transaction_date_str || !description || !amount_str || !currency) {
        const msg = `Missing required fields (Date, Text, Amount, or Currency). Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

      if (entry && existingEntries.has(entry)) {
        const msg = `Skipping transaction with duplicate Entry number: '${entry}' for country ${country}.`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

      const dateParts = transaction_date_str.split('.');
      if (dateParts.length !== 3) {
        const msg = `Invalid date format '${transaction_date_str}'. Expected DD.MM.YYYY. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }
      const transaction_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      const parsedAmount = parseFloat(amount_str.replace(/,/g, ''));
      if (isNaN(parsedAmount)) {
        const msg = `Invalid amount '${amount_str}'. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-transactions] ${msg}`);
        continue;
      }

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

      let requesterIdForTransaction = uploaderId;

      if (user_email_from_csv) {
        if (userEmailToIdCache.has(user_email_from_csv)) {
          requesterIdForTransaction = userEmailToIdCache.get(user_email_from_csv) || uploaderId;
          console.log(`[upload-transactions] Found user_id for ${user_email_from_csv} in cache: ${requesterIdForTransaction}`);
        } else {
          const { data: profileData, error: profileError } = await supabaseClient
            .from('profile_with_email')
            .select('id')
            .eq('user_email', user_email_from_csv)
            .eq('country', country) // Filter by the provided country for user lookup
            .single();

          if (profileError || !profileData) {
            const msg = `User with email '${user_email_from_csv}' not found in country ${country}. Assigning transaction to uploader.`;
            errors.push(msg);
            console.warn(`[upload-transactions] ${msg}`);
            userEmailToIdCache.set(user_email_from_csv, null);
          } else {
            requesterIdForTransaction = profileData.id;
            userEmailToIdCache.set(user_email_from_csv, profileData.id);
            console.log(`[upload-transactions] Found user_id for ${user_email_from_csv}: ${requesterIdForTransaction}`);
          }
        }
      }

      transactionsToInsert.push({
        requester_id: requesterIdForTransaction,
        uploaded_by_user_id: uploaderId,
        original_transaction_id: null,
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
        country: country, // Assign the provided country
      });
    }

    console.log(`[upload-transactions] Transactions prepared for insertion: ${transactionsToInsert.length}`);
    if (transactionsToInsert.length > 0) {
      console.log(`[upload-transactions] First transaction to insert: ${JSON.stringify(transactionsToInsert[0])}`);
    }

    let insertedCount = 0;
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
      insertedCount = insertData?.length || 0;
      console.log(`[upload-transactions] Successfully inserted ${insertedCount} transactions.`);
    } else {
      console.warn('[upload-transactions] No transactions to insert after processing.');
    }

    let message = `${insertedCount} transactions inserted successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors (e.g., duplicates, invalid format).`;
      console.error('[upload-transactions] Transaction processing errors summary:', errors);
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
    console.error('[upload-transactions] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});