import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple category mapping
const categoryMap = {
  '950': '950_rent',
  '952': '952_utilities_el',
  '953': '953_water',
  '954': '954_heating',
  '956': '956_fiber_wifi',
  '958': '958_internet',
  '960': '960_cleaning_services',
  '962': '962_cleaning_move_out',
  '964': '964_parking',
  '970': '970_maintenance',
  '972': '972_maintenance_move_out',
  '974': '974_other',
  '975': '975_small_furniture',
  '976': '976_council_tax',
  '3055': '3055_subcontractors',
  '3056': '3056_otg_service_team_costs',
  '3057': '3057_storage_units_facilities',
  '3075': '3075_software',
  '3079': '3079_fines',
  '3089': '3089_car_fuel',
  '3090': '3090_car_taxes',
  '3091': '3091_car_insurance',
  '3092': '3092_bridge_ferry_tolls',
  '3102': '3102_office_rent',
  '3115': '3115_office_phone_internet',
  '3122': '3122_accountant',
  '3125': '3125_lawyer',
  '3147': '3147_company_insurance',
  '3157': '3157_postage',
  '3444': '3444_restaurant_visits',
  '3469': '3469_gifts_flowers',
  '3476': '3476_travel_hotels',
  '3480': '3480_marketing',
  '5201': '5201_provider_deposit',
};

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

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    console.log(`[upload-direct-debits] Received payload:`, {
      fileName,
      fileContentLength: fileContent?.length,
      uploaderId,
      country
    });

    if (!fileName || !fileContent || !uploaderId || !country) {
      const missing = [];
      if (!fileName) missing.push('fileName');
      if (!fileContent) missing.push('fileContent');
      if (!uploaderId) missing.push('uploaderId');
      if (!country) missing.push('country');
      
      console.error(`[upload-direct-debits] Missing required fields: ${missing.join(', ')}`);
      return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-direct-debits] Processing file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-direct-debits] CSV parsed successfully. Number of rows: ${parsedRows.length}`);
    } catch (csvParseError) {
      console.error('[upload-direct-debits] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (parsedRows.length === 0) {
      console.error('[upload-direct-debits] CSV file is empty');
      return new Response(JSON.stringify({ error: 'CSV file is empty or contains no data rows.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the correct header row by scanning first few rows for expected columns
    const expectedHeaderHints = ['Payee', 'Payment Date', 'Account Number'];
    let headerRowIndex = 0;
    const scanLimit = Math.min(parsedRows.length, 10);
    for (let i = 0; i < scanLimit; i++) {
      const row = parsedRows[i].map(h => (h || '').trim());
      const containsHint = expectedHeaderHints.some(hint => row.includes(hint));
      if (containsHint) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = parsedRows[headerRowIndex].map(h => (h || '').trim());
    const dataRows = parsedRows.slice(headerRowIndex + 1);

    console.log(`[upload-direct-debits] Header row index: ${headerRowIndex}`);
    console.log(`[upload-direct-debits] Headers found: ${JSON.stringify(headers)}`);
    console.log(`[upload-direct-debits] Number of data rows: ${dataRows.length}`);

    // Validate that we found a plausible direct debit header
    if (!headers.includes('Payee')) {
      const serverDebugInfo = `Header row index guessed: ${headerRowIndex}\nHeaders found: ${JSON.stringify(headers, null, 2)}\n\nFirst 5 rows:\n${JSON.stringify(parsedRows.slice(0, 5), null, 2)}`;
      const msg = 'The CSV does not contain a "Payee" column. Please upload the Direct Debits CSV with the correct headers.';
      return new Response(JSON.stringify({ message: msg, errors: [msg], error: msg, serverDebugInfo }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helpers
    const toISODate = (s: string | undefined | null) => {
      if (!s) return null;
      const str = s.trim();
      // Try DD.MM.YYYY
      const dot = str.split('.');
      if (dot.length === 3) {
        const [dd, mm, yyyy] = dot;
        return `${yyyy}-${mm}-${dd}`;
      }
      // Try DD/MM/YYYY
      const slash = str.split('/');
      if (slash.length === 3) {
        const [dd, mm, yyyy] = slash;
        return `${yyyy}-${mm}-${dd}`;
      }
      return str; // fallback (assume already ISO)
    };

    const mapCategory = (raw: string | undefined | null) => {
      if (!raw) return '974_other';
      const val = raw.trim();
      const codeMatch = val.match(/^(\d{3,4})/);
      if (codeMatch && categoryMap[codeMatch[1]]) {
        return categoryMap[codeMatch[1]];
      }
      return val || '974_other';
    };

    const parseBoolean = (raw: string | undefined | null) => {
      if (!raw) return false;
      const v = raw.trim().toLowerCase();
      return v === 'yes' || v === 'true' || v === '1' || v === 'y';
    };

    const directDebitsToInsert = [];
    const errors: string[] = [];

    // Process each data row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (row[index]?.trim() || '');
      });

      try {
        // Expected columns for Direct Debits CSV
        const payee = record['Payee'];
        const paymentDateRaw = record['Payment Date'];
        const categoryRaw = record['Category'];
        const accountNumber = record['Account Number'];
        const userEmail = record['User Email'];
        const sku = record['SKU'];
        const notPropertyRelatedRaw = record['Not Property Related'];
        const paymentReference = record['Payment Reference'];
        const bankAccount = record['Bank Account'];

        // Basic validation
        if (!payee) {
          errors.push(`Row ${i + 1}: Missing 'Payee' column. This row will not be imported.`);
          continue;
        }

        // Resolve requester_id via User Email if provided
        let requesterId = uploaderId;
        if (userEmail) {
          const { data: profileRow, error: profileErr } = await supabaseClient
            .from('profile_with_email')
            .select('id, user_email')
            .eq('user_email', userEmail)
            .limit(1)
            .single();

          if (profileErr) {
            console.warn(`[upload-direct-debits] Row ${i + 1}: Could not resolve requester by email "${userEmail}". Using uploaderId. Error: ${profileErr.message}`);
          } else if (profileRow?.id) {
            requesterId = profileRow.id;
          }
        }

        const payment_date = toISODate(paymentDateRaw);
        const category = mapCategory(categoryRaw);
        const not_property_related = parseBoolean(notPropertyRelatedRaw);

        // Create direct debit record
        const directDebitRecord = {
          requester_id: requesterId,
          payee: payee,
          payment_date: payment_date, // YYYY-MM-DD or null
          sku: sku || null,
          not_property_related,
          category,
          account_number: accountNumber || 'UNKNOWN',
          payment_reference: paymentReference || null,
          status: 'awaiting_info',
          country: country,
          bank_account: bankAccount || null,
        };

        directDebitsToInsert.push(directDebitRecord);

      } catch (rowError) {
        console.error(`[upload-direct-debits] Error processing row ${i + 1}:`, rowError);
        errors.push(`Row ${i + 1}: ${rowError.message}`);
        continue;
      }
    }

    console.log(`[upload-direct-debits] Total records to insert: ${directDebitsToInsert.length}`);
    console.log(`[upload-direct-debits] Total errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log(`[upload-direct-debits] Errors:`, errors);
    }

    let insertedCount = 0;
    if (directDebitsToInsert.length > 0) {
      console.log('[upload-direct-debits] Inserting direct debits into database...');
      
      const { data: insertData, error: insertError } = await supabaseClient
        .from('direct_debits')
        .insert(directDebitsToInsert)
        .select();

      if (insertError) {
        console.error('[upload-direct-debits] Failed to insert direct debits:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert direct debits: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      insertedCount = insertData?.length || 0;
      console.log(`[upload-direct-debits] Successfully inserted ${insertedCount} direct debits.`);
    }

    let message = `${insertedCount} direct debits inserted successfully with status 'Awaiting Info'.`;
    if (errors.length > 0) {
      message += ` ${errors.length} warnings/errors encountered during processing.`;
      console.log('[upload-direct-debits] Processing completed with errors:', errors);
      
      // Create debug info for client
      const serverDebugInfo = `Header row index guessed: ${headerRowIndex}\nHeaders found: ${JSON.stringify(headers, null, 2)}\n\nFirst 3 data rows with headers:\n${JSON.stringify(dataRows.slice(0, 3).map((row, i) => {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, index) => {
            rowObj[header] = row[index]?.trim() || '';
          });
          return `Row ${i + 1}: ${JSON.stringify(rowObj)}`;
        }), null, 2)}\n\nAll errors:\n${errors.join('\n')}`;
      
      return new Response(JSON.stringify({ 
        message: message, 
        errors: errors,
        serverDebugInfo: serverDebugInfo
      }), {
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
    return new Response(JSON.stringify({ 
      error: 'An unexpected error occurred in the Edge Function.',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});