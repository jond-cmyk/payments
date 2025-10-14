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
      console.error(`[upload-standing-orders] Error: ${msg}`);
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
      console.log('[upload-standing-orders] Supabase client created successfully.');
    } catch (clientError) {
      const msg = `Failed to create Supabase client: ${clientError.message}`;
      console.error(`[upload-standing-orders] Error: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      console.error('[upload-standing-orders] Missing file data, uploader ID, or country in payload.');
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-standing-orders] Received file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);
    console.log(`[upload-standing-orders] File content length: ${fileContent.length}`);

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-standing-orders] CSV parsed successfully. Number of rows: ${parsedRows.length}`);
      if (parsedRows.length > 0) {
        console.log(`[upload-standing-orders] First parsed row (potential headers): ${JSON.stringify(parsedRows[0])}`);
      }
    } catch (csvParseError) {
      console.error('[upload-standing-orders] CSV parsing error:', csvParseError);
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

    console.log(`[upload-standing-orders] Extracted headers: ${JSON.stringify(headers)}`);
    console.log(`[upload-standing-orders] Number of data rows: ${dataRows.length}`);

    const standingOrdersToInsert = [];
    const errors: string[] = [];

    const requiredHeaders = ['Payee', 'Payment Date', 'Category', 'Account Name', 'From Day', 'To Day', 'User Email'];
    const missingRequiredHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingRequiredHeaders.length > 0) {
      const msg = `Missing required CSV headers: ${missingRequiredHeaders.join(', ')}. Please ensure your CSV contains 'Payee', 'Payment Date', 'Category', 'Account Name', 'From Day', 'To Day', and 'User Email' columns.`;
      errors.push(msg);
      console.error('[upload-standing-orders] Invalid CSV format. Headers:', headers);
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
        console.warn(`[upload-standing-orders] ${msg}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      console.log(`[upload-standing-orders] Processing record: ${JSON.stringify(record)}`);

      let {
        'Payee': payee,
        'Payment Date': payment_date_str,
        'SKU': sku,
        'Not Property Related': not_property_related_str,
        'Category': category,
        'Account Name': account_name,
        'Account Address': account_address,
        'IBAN Number': iban_number,
        'Sort Code': sort_code,
        'Account Number': account_number,
        'From Day': from_day_str,
        'To Day': to_day_str,
        'Payment Reference': payment_reference,
        'User Email': user_email_from_csv,
      } = record;

      if (!payee || !payment_date_str || !category || !account_name || !from_day_str || !to_day_str || !user_email_from_csv) {
        const msg = `Missing required fields (Payee, Payment Date, Category, Account Name, From Day, To Day, or User Email). Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-standing-orders] ${msg}`);
        continue;
      }

      const dateParts = payment_date_str.split('.');
      if (dateParts.length !== 3) {
        const msg = `Invalid date format '${payment_date_str}'. Expected DD.MM.YYYY. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-standing-orders] ${msg}`);
        continue;
      }
      const payment_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';

      const from_day = parseInt(from_day_str);
      const to_day = parseInt(to_day_str);

      if (isNaN(from_day) || from_day < 1 || from_day > 31 || isNaN(to_day) || to_day < 1 || to_day > 31 || from_day > to_day) {
        const msg = `Invalid 'From Day' or 'To Day' values or range. Skipping record: ${JSON.stringify(record)}`;
        errors.push(msg);
        console.warn(`[upload-standing-orders] ${msg}`);
        continue;
      }

      let requesterIdForStandingOrder = uploaderId;

      if (userEmailToIdCache.has(user_email_from_csv)) {
        requesterIdForStandingOrder = userEmailToIdCache.get(user_email_from_csv) || uploaderId;
        console.log(`[upload-standing-orders] Found user_id for ${user_email_from_csv} in cache: ${requesterIdForStandingOrder}`);
      } else {
        const { data: profileData, error: profileError } = await supabaseClient
          .from('profile_with_email')
          .select('id')
          .eq('user_email', user_email_from_csv)
          .eq('country', country)
          .single();

        if (profileError || !profileData) {
          const msg = `User with email '${user_email_from_csv}' not found in country ${country}. Assigning standing order to uploader.`;
          errors.push(msg);
          console.warn(`[upload-standing-orders] ${msg}`);
          userEmailToIdCache.set(user_email_from_csv, null);
        } else {
          requesterIdForStandingOrder = profileData.id;
          userEmailToIdCache.set(user_email_from_csv, profileData.id);
          console.log(`[upload-standing-orders] Found user_id for ${user_email_from_csv}: ${requesterIdForStandingOrder}`);
        }
      }

      standingOrdersToInsert.push({
        requester_id: requesterIdForStandingOrder,
        payee: payee,
        payment_date: payment_date,
        sku: sku || null,
        not_property_related: not_property_related,
        category: category,
        account_name: account_name,
        account_address: account_address || null,
        iban_number: iban_number || null,
        sort_code: sort_code || null,
        account_number: account_number || null,
        from_day: from_day,
        to_day: to_day,
        payment_reference: payment_reference || null,
        status: 'pending', // Set status to 'pending' as requested
        country: country,
      });
    }

    console.log(`[upload-standing-orders] Standing Orders prepared for insertion: ${standingOrdersToInsert.length}`);
    if (standingOrdersToInsert.length > 0) {
      console.log(`[upload-standing-orders] First standing order to insert: ${JSON.stringify(standingOrdersToInsert[0])}`);
    }

    let insertedCount = 0;
    if (standingOrdersToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('standing_orders')
        .insert(standingOrdersToInsert)
        .select();

      if (insertError) {
        console.error('[upload-standing-orders] Failed to insert standing orders into database:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert standing orders into database: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      insertedCount = insertData?.length || 0;
      console.log(`[upload-standing-orders] Successfully inserted ${insertedCount} standing orders.`);
    } else {
      console.warn('[upload-standing-orders] No standing orders to insert after processing.');
    }

    let message = `${insertedCount} standing orders inserted successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors (e.g., missing data, invalid format, user not found).`;
      console.error('[upload-standing-orders] Standing Order processing errors summary:', errors);
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
    console.error('[upload-standing-orders] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});