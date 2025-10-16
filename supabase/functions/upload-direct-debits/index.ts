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

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    console.log(`[upload-direct-debits] Headers found: ${JSON.stringify(headers)}`);
    console.log(`[upload-direct-debits] Number of data rows: ${dataRows.length}`);

    // DEBUG: Show first few rows of actual data with headers
    console.log(`[upload-direct-debits] First 3 data rows with headers:`);
    dataRows.slice(0, 3).forEach((row, i) => {
      const rowObj: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObj[header] = row[index]?.trim() || '';
      });
      console.log(`Row ${i + 1}: ${JSON.stringify(rowObj)}`);
    });

    const directDebitsToInsert = [];
    const errors: string[] = [];

    // Process each data row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      console.log(`[upload-direct-debits] Processing row ${i + 1}: ${JSON.stringify(row)}`);
      
      if (row.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch (${row.length} vs ${headers.length}). Skipping.`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index]?.trim() || '';
      });

      console.log(`[upload-direct-debits] Row ${i + 1} as object: ${JSON.stringify(record)}`);
      console.log(`[upload-direct-debits] Available headers: ${Object.keys(record).join(', ')}`);

      try {
        // Extract fields from your CSV format - let's see what headers we actually have
        console.log(`[upload-direct-debits] Available headers: ${Object.keys(record).join(', ')}`);
        
        // Try different possible header names for payee - be more comprehensive
        const payee = record['Payee'] || record['payee'] || record['PAYEE'] || 
                     record['Name'] || record['name'] || record['NAME'] ||
                     record['Description'] || record['description'] || record['DESCRIPTION'] ||
                     record['Payee Name'] || record['Payee name'] || record['payee name'] ||
                     record['PayeeName'] || record['Payeename'] || record['payeename'] ||
                     record['Merchant'] || record['merchant'] || record['MERCHANT'] ||
                     record['Merchant Name'] || record['Merchant name'] || record['merchant name'] ||
                     record['Company'] || record['company'] || record['COMPANY'] ||
                     record['Vendor'] || record['vendor'] || record['VENDOR'] ||
                     record['Supplier'] || record['supplier'] || record['SUPPLIER'];

        const leaseId = record['Lease ID'] || record['lease id'] || record['LeaseID'] || record['lease_id'] || '';
        const sku = record['SKU'] || record['sku'] || '';
        const categoryCode = record['Category'] || record['category'] || record['CAT'] || record['cat'] || '';
        const accountNumber = record['Account Number'] || record['account number'] || record['AccountNumber'] || record['account_number'] || '';
        const paymentReference = record['Payment Reference'] || record['payment reference'] || record['PaymentReference'] || record['payment_reference'] || '';

        console.log(`[upload-direct-debits] Row ${i + 1} extracted values:`, {
          leaseId: leaseId || '(empty)',
          sku: sku || '(empty)', 
          categoryCode: categoryCode || '(empty)',
          payee: payee || '(empty)',
          accountNumber: accountNumber || '(empty)',
          paymentReference: paymentReference || '(empty)'
        });

        // Basic validation - only payee is required
        if (!payee) {
          errors.push(`Row ${i + 1}: Missing Payee (tried headers: Payee, Name, Description, Payee Name, Merchant, Company, Vendor, Supplier) - available headers: ${Object.keys(record).join(', ')}`);
          continue;
        }

        // Map category code (like "952") to full category value
        const category = categoryMap[categoryCode] || '974_other';
        console.log(`[upload-direct-debits] Row ${i + 1}: Mapped category '${categoryCode}' to '${category}'`);

        // Create direct debit record
        const directDebitRecord = {
          requester_id: uploaderId, // Always use uploader ID
          payee: payee,
          payment_date: null, // Payment date is blank as you mentioned
          sku: sku || null,
          not_property_related: false, // Default to false
          category: category,
          account_number: accountNumber || 'UNKNOWN',
          payment_reference: paymentReference || null,
          status: 'awaiting_info',
          country: country,
          bank_account: null,
        };

        console.log(`[upload-direct-debits] Row ${i + 1}: Final record:`, JSON.stringify(directDebitRecord, null, 2));
        directDebitsToInsert.push(directDebitRecord);

      } catch (rowError) {
        console.error(`[upload-direct-debits] Error processing row ${i + 1}:`, rowError);
        errors.push(`Row ${i + 1}: ${rowError.message}`);
        continue;
      }
    }

    console.log(`[upload-direct-debits] Total records to insert: ${directDebitsToInsert.length}`);
    console.log(`[upload-direct-debits] Total errors: ${errors.length}`);
    console.log(`[upload-direct-debits] Errors:`, errors);

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
      const serverDebugInfo = `Headers found: ${JSON.stringify(headers, null, 2)}\n\n` +
        `First 3 data rows with headers:\n${JSON.stringify(dataRows.slice(0, 3).map((row, i) => {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, index) => {
            rowObj[header] = row[index]?.trim() || '';
          });
          return `Row ${i + 1}: ${JSON.stringify(rowObj)}`;
        }), null, 2)}\n\n` +
        `All errors:\n${errors.join('\n')}`;
      
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