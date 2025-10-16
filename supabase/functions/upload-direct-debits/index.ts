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

    const expectedHeaders = ['Payee', 'Payment Date', 'SKU', 'Not Property Related', 'Category', 'Account Number', 'Payment Reference', 'Bank Account', 'User Email'];
    const missingExpectedHeaders = expectedHeaders.filter(h => !headers.includes(h));

    if (missingExpectedHeaders.length > 0) {
      errors.push(`Warning: Missing some expected CSV headers: ${missingExpectedHeaders.join(', ')}. Data for these columns will be null.`);
      console.warn('[upload-direct-debits] Missing expected CSV headers:', missingExpectedHeaders);
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

      // Relaxed validation: if critical fields are missing, set to null and add a warning
      if (!payee) errors.push(`Missing Payee for row: ${JSON.stringify(record)}`);
      if (!payment_date_str) errors.push(`Missing Payment Date for row: ${JSON.stringify(record)}`);
      if (!category) errors.push(`Missing Category for row: ${JSON.stringify(record)}`);
      if (!account_number) errors.push(`Missing Account Number for row: ${JSON.stringify(record)}`);
      if (!user_email_from_csv) errors.push(`Missing User Email for row: ${JSON.stringify(record)}`);

      let payment_date = null;
      if (payment_date_str) {
        const dateParts = payment_date_str.split('.');
        if (dateParts.length === 3) {
          payment_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        } else {
          errors.push(`Invalid date format '${payment_date_str}'. Expected DD.MM.YYYY. Setting Payment Date to null.`);
        }
      }

      const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';

      let requesterIdForDirectDebit = uploaderId;

      if (user_email_from_csv) {
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
      } else {
        errors.push(`User Email missing for row. Assigning direct debit to uploader.`);
      }

      directDebitsToInsert.push({
        requester_id: requesterIdForDirectDebit,
        payee: payee || null,
        payment_date: payment_date,
        sku: sku || null,
        not_property_related: not_property_related,
        category: category || null,
        account_number: account_number || null,
        payment_reference: payment_reference || null,
        status: 'awaiting_info', // Set status to 'awaiting_info'
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

    let message = `${insertedCount} direct debits inserted successfully with status 'Awaiting Info'.`;
    if (errors.length > 0) {
      message += ` ${errors.length} warnings/errors encountered during processing.`;
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