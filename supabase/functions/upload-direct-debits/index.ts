import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple category mapping - just the essential ones for direct debits
const categoryOptions = [
  { value: '950_rent', label: '950 - Rent' },
  { value: '952_utilities_el', label: '952 - Electricity' },
  { value: '953_water', label: '953 - Water' },
  { value: '954_heating', label: '954 - Heating' },
  { value: '956_fiber_wifi', label: '956 - Fiber/Wifi' },
  { value: '958_internet', label: '958 - Internet' },
  { value: '960_cleaning_services', label: '960 - Cleaning services' },
  { value: '962_cleaning_move_out', label: '962 - Cleaning, at move-out' },
  { value: '964_parking', label: '964 - Parking' },
  { value: '970_maintenance', label: '970 - Maintenance' },
  { value: '972_maintenance_move_out', label: '972 - Maintenance, at move-out' },
  { value: '974_other', label: '974 - Other' },
  { value: '975_small_furniture', label: '975 - Small Furniture' },
  { value: '976_council_tax', label: '976 - Council Tax', countries: ['United Kingdom'] },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[upload-direct-debits] Starting function execution');
    
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

    let payload;
    try {
      payload = await req.json();
      console.log('[upload-direct-debits] Payload received successfully');
      console.log(`[upload-direct-debits] Payload keys: ${Object.keys(payload).join(', ')}`);
    } catch (jsonError) {
      console.error('[upload-direct-debits] Failed to parse JSON payload:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      console.error('[upload-direct-debits] Missing required fields:', { 
        fileName: !!fileName, 
        fileContent: !!fileContent, 
        uploaderId: !!uploaderId, 
        country: !!country 
      });
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-direct-debits] Processing file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);
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

    // Process each data row with individual error handling
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      if (row.length !== headers.length) {
        const msg = `Row ${i + 1} has ${row.length} columns but headers have ${headers.length}. Skipping.`;
        errors.push(msg);
        console.warn(`[upload-direct-debits] ${msg}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      console.log(`[upload-direct-debits] Processing row ${i + 1}: ${JSON.stringify(record)}`);

      try {
        // Extract fields with safe defaults
        const payee = record['Payee']?.trim() || '';
        const payment_date_str = record['Payment Date']?.trim() || '';
        const sku = record['SKU']?.trim() || '';
        const not_property_related_str = record['Not Property Related']?.trim() || '';
        const categoryRaw = record['Category']?.trim() || '';
        const account_number = record['Account Number']?.trim() || '';
        const payment_reference = record['Payment Reference']?.trim() || '';
        const bank_account = record['Bank Account']?.trim() || '';
        const user_email_from_csv = record['User Email']?.trim() || '';

        console.log(`[upload-direct-debits] Row ${i + 1} extracted fields:`, {
          payee: !!payee,
          payment_date: !!payment_date_str,
          category: !!categoryRaw,
          account_number: !!account_number,
          user_email: !!user_email_from_csv
        });

        // Map numeric category to full label
        let category = categoryRaw || null;
        if (category && /^\d{3}$/.test(category)) {
          const found = categoryOptions.find(opt => opt.value.startsWith(category));
          if (found) {
            category = found.value;
            console.log(`[upload-direct-debits] Row ${i + 1}: Mapped category '${categoryRaw}' to '${category}'`);
          } else {
            errors.push(`Row ${i + 1}: Unknown category code "${category}"`);
            console.warn(`[upload-direct-debits] Row ${i + 1}: Unknown category code "${category}"`);
          }
        }

        // Basic validation
        if (!payee) {
          errors.push(`Row ${i + 1}: Missing Payee`);
          continue;
        }
        if (!category) {
          errors.push(`Row ${i + 1}: Missing or invalid Category`);
          continue;
        }
        if (!account_number) {
          errors.push(`Row ${i + 1}: Missing Account Number`);
          continue;
        }
        if (!user_email_from_csv) {
          errors.push(`Row ${i + 1}: Missing User Email`);
          continue;
        }

        // Parse payment date
        let payment_date = null;
        if (payment_date_str) {
          const dateParts = payment_date_str.split('.');
          if (dateParts.length === 3) {
            payment_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            console.log(`[upload-direct-debits] Row ${i + 1}: Parsed date '${payment_date_str}' to '${payment_date}'`);
          } else {
            errors.push(`Row ${i + 1}: Invalid date format '${payment_date_str}'. Expected DD.MM.YYYY.`);
            continue;
          }
        }

        const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';

        // Find user ID from email
        let requesterIdForDirectDebit = uploaderId;
        
        console.log(`[upload-direct-debits] Row ${i + 1}: Looking up user for email '${user_email_from_csv}' in country '${country}'`);
        
        try {
          const { data: profileData, error: profileError } = await supabaseClient
            .from('profile_with_email')
            .select('id')
            .eq('user_email', user_email_from_csv)
            .eq('country', country)
            .single();

          if (profileError || !profileData) {
            console.warn(`[upload-direct-debits] Row ${i + 1}: User lookup failed - ${profileError?.message || 'User not found'}`);
            errors.push(`Row ${i + 1}: User with email '${user_email_from_csv}' not found in country ${country}. Using uploader ID.`);
          } else {
            requesterIdForDirectDebit = profileData.id;
            console.log(`[upload-direct-debits] Row ${i + 1}: Found user ID '${requesterIdForDirectDebit}'`);
          }
        } catch (userError) {
          console.error(`[upload-direct-debits] Row ${i + 1}: Error finding user for email ${user_email_from_csv}:`, userError);
          errors.push(`Row ${i + 1}: Error finding user. Using uploader ID.`);
        }

        // Create direct debit record
        const directDebitRecord = {
          requester_id: requesterIdForDirectDebit,
          payee: payee,
          payment_date: payment_date,
          sku: sku || null,
          not_property_related: not_property_related,
          category: category,
          account_number: account_number,
          payment_reference: payment_reference || null,
          status: 'awaiting_info',
          country: country,
          bank_account: bank_account || null,
        };

        console.log(`[upload-direct-debits] Row ${i + 1}: Created record:`, JSON.stringify(directDebitRecord, null, 2));
        directDebitsToInsert.push(directDebitRecord);

      } catch (rowError) {
        console.error(`[upload-direct-debits] Error processing row ${i + 1}:`, rowError);
        errors.push(`Row ${i + 1}: ${rowError.message}`);
        continue;
      }
    }

    console.log(`[upload-direct-debits] Direct Debits prepared for insertion: ${directDebitsToInsert.length}`);

    let insertedCount = 0;
    if (directDebitsToInsert.length > 0) {
      console.log('[upload-direct-debits] Inserting direct debits into database...');
      console.log(`[upload-direct-debits] First record to insert:`, JSON.stringify(directDebitsToInsert[0], null, 2));
      
      const { data: insertData, error: insertError } = await supabaseClient
        .from('direct_debits')
        .insert(directDebitsToInsert)
        .select();

      if (insertError) {
        console.error('[upload-direct-debits] Failed to insert direct debits into database:', insertError);
        console.error('[upload-direct-debits] Insert error details:', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint
        });
        return new Response(JSON.stringify({ error: `Failed to insert direct debits: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      insertedCount = insertData?.length || 0;
      console.log(`[upload-direct-debits] Successfully inserted ${insertedCount} direct debits.`);
      console.log(`[upload-direct-debits] Insert response data:`, JSON.stringify(insertData, null, 2));
    } else {
      console.warn('[upload-direct-debits] No direct debits to insert after processing.');
    }

    let message = `${insertedCount} direct debits inserted successfully with status 'Awaiting Info'.`;
    if (errors.length > 0) {
      message += ` ${errors.length} warnings/errors encountered during processing.`;
      console.log('[upload-direct-debits] Processing completed with errors:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[upload-direct-debits] Processing completed successfully');
    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-direct-debits] Edge Function unhandled error:', error);
    console.error('[upload-direct-debits] Error stack:', error.stack);
    console.error('[upload-direct-debits] Error name:', error.name);
    console.error('[upload-direct-debits] Error message:', error.message);
    return new Response(JSON.stringify({ 
      error: 'An unexpected error occurred in the Edge Function.',
      details: error.message,
      type: error.name 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});