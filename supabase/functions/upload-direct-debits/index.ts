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
      console.error(`[upload-direct-debits] Error: ${msg}`);
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
      console.log('[upload-direct-debits] Supabase client created successfully.');
    } catch (clientError) {
      const msg = `Failed to create Supabase client: ${clientError.message}`;
      console.error(`[upload-direct-debits] Error: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      console.error('[upload-direct-debits] Missing file data, uploader ID, or country in payload.');
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-direct-debits] Received file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);
    console.log(`[upload-direct-debits] File content length: ${fileContent.length}`);

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-direct-debits] CSV parsed successfully. Number of rows: ${parsedRows.length}`);
      if (parsedRows.length > 0) {
        console.log(`[upload-direct-debits] First parsed row (potential headers): ${JSON.stringify(parsedRows[0])}`);
      }
    } catch (csvParseError) {
      console.error('[upload-direct-debits] CSV parsing error:', csvParseError);
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

    console.log(`[upload-direct-debits] Extracted headers: ${JSON.stringify(headers)}`);
    console.log(`[upload-direct-debits] Number of data rows: ${dataRows.length}`);

    const directDebitsToInsert = [];
    const errors: string[] = [];

    const requiredHeaders = ['Payee', 'Payment Date', 'Category', 'Account Number', 'User Email'];
    const missingRequiredHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingRequiredHeaders.length > 0) {
      const msg = `Missing required CSV headers: ${missingRequiredHeaders.join(', ')}. Please ensure your CSV contains 'Payee', 'Payment Date', 'Category', 'Account Number', and 'User Email' columns.`;
      errors.push(msg);
      console.error('[upload-direct-debits] Invalid CSV format. Headers:', headers);
      return new Response(JSON.stringify({ message: msg, errors: errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmailToIdCache = new Map<string, string | null>();

    for (const row of dataRows) {
      if (row.length !== headers.length) {
        const msg = `Row has a different number of columns than headers. Skipping row: ${JSON.stringify(row)}`;
        errors.push(msg);
        console.warn(`[upload-direct-debits] ${msg}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      console.log(`[upload-direct-debits] Processing record: ${JSON.stringify(record)}`);

      let {
        'Payee': payee,
        'Payment Date': payment_date_str,
        'SKU': sku,
        'Not Property Related': not_property_related_str,
        'Category': category,
        'Account Number': account_number,
        'Payment Reference': payment_reference,
        'Bank Account': bank_account,
        'User Email': user_email_from_csv,
      } = record;

      if (!payee || !payment_date_str || !category || !account_number || !user_email_from_csv) {
        const msg = `Missing required fields (Payee, Payment Date, Category, Account Number, or User Email). Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-direct-debits] ${msg}`);
        continue;
      }

      const dateParts = payment_date_str.split('.');
      if (dateParts.length !== 3) {
        const msg = `Invalid date format '${payment_date_str}'. Expected DD.MM.YYYY. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-direct-debits] ${msg}`);
        continue;
      }
      const payment_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';

      let requesterIdForDirectDebit = uploaderId;

      if (userEmailToIdCache.has(user_email_from_csv)) {
        requesterIdForDirectDebit = userEmailToIdCache.get(user_email_from_csv) || uploaderId;
        console.log(`[upload-direct-debits] Found user_id for ${user_email_from_csv} in cache: ${requesterIdForDirectDebit}`);
      } else {
        const { data: profileData, error: profileError } = await supabaseClient
          .from('profile_with_email')
          .select('id')
          .eq('user_email', user_email_from_csv)
          .eq('country', country)
          .single();

        if (profileError || !profileData) {
          const msg = `User with email '${user_email_from_csv}' not found in country ${country}. Assigning direct debit to uploader.`;
          errors.push(msg);
          console.warn(`[upload-direct-debits] ${msg}`);
          userEmailToIdCache.set(user_email_from_csv, null);
        } else {
          requesterIdForDirectDebit = profileData.id;
          userEmailToIdCache.set(user_email_from_csv, profileData.id);
          console.log(`[upload-direct-debits] Found user_id for ${user_email_from_csv}: ${requesterIdForDirectDebit}`);
        }
      }

      directDebitsToInsert.push({
        requester_id: requesterIdForDirectDebit,
        payee: payee,
        payment_date: payment_date,
        sku: sku || null,
        not_property_related: not_property_related,
        category: category,
        account_number: account_number,
        payment_reference: payment_reference || null,
        status: 'pending', // Set status to 'pending' as requested
        country: country,
        bank_account: bank_account || null,
      });
    }

    console.log(`[upload-direct-debits] Direct Debits prepared for insertion: ${directDebitsToInsert.length}`);
    if (directDebitsToInsert.length > 0) {
      console.log(`[upload-direct-debits] First direct debit to insert: ${JSON.stringify(directDebitsToInsert[0])}`);
    }

    let insertedCount = 0;
    if (directDebitsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('direct_debits')
        .insert(directDebitsToInsert)
        .select();

      if (insertError) {
        console.error('[upload-direct-debits] Failed to insert direct debits into database:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert direct debits into database: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      insertedCount = insertData?.length || 0;
      console.log(`[upload-direct-debits] Successfully inserted ${insertedCount} direct debits.`);
    } else {
      console.warn('[upload-direct-debits] No direct debits to insert after processing.');
    }

    let message = `${insertedCount} direct debits inserted successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors (e.g., missing data, invalid format, user not found).`;
      console.error('[upload-direct-debits] Direct Debit processing errors summary:', errors);
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
    console.error('[upload-direct-debits] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});