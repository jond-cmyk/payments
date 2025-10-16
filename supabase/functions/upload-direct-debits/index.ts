import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const categoryMap: Record<string, string> = {
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
    console.log('[upload-direct-debits] Boot: v1.1.0 – direct-debit parser with transaction CSV fallback');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      const msg = 'Supabase URL or Service Role Key is missing in environment variables.';
      console.error(`[upload-direct-debits] Error: ${msg}`);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: { persistSession: false },
      }
    );

    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload ?? {};

    console.log(`[upload-direct-debits] Received payload:`, {
      fileName,
      fileContentLength: fileContent?.length,
      uploaderId,
      country
    });

    if (!fileName || !fileContent || !uploaderId || !country) {
      const missing: string[] = [];
      if (!fileName) missing.push('fileName');
      if (!fileContent) missing.push('fileContent');
      if (!uploaderId) missing.push('uploaderId');
      if (!country) missing.push('country');
      
      const msg = `Missing required fields: ${missing.join(', ')}`;
      console.error(`[upload-direct-debits] Error: ${msg}`);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-direct-debits] Processing file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);

    // Normalize content: remove BOM and auto-detect separator (comma/semicolon)
    const rawContent = typeof fileContent === 'string' ? fileContent : String(fileContent);
    const normalizedContent = rawContent.replace(/^\uFEFF/, '');
    const firstLine = (normalizedContent.split(/\r?\n/)[0] ?? '');
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const separator = semicolonCount > commaCount ? ';' : ',';

    let parsedRows: string[][];
    try {
      parsedRows = await parse(normalizedContent, {
        header: false,
        separator,
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-direct-debits] CSV parsed successfully. Number of rows: ${parsedRows.length}. Using separator: "${separator}"`);
    } catch (csvParseError: any) {
      const msg = `Failed to parse CSV file: ${csvParseError?.message || 'Unknown parse error'}`;
      console.error('[upload-direct-debits] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!parsedRows || parsedRows.length === 0) {
      const msg = 'CSV file is empty or contains no data rows.';
      console.error('[upload-direct-debits] CSV file is empty');
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find header row
    let headerRowIndex = 0;
    const scanLimit = Math.min(parsedRows.length, 10);
    for (let i = 0; i < scanLimit; i++) {
      const rowLower = parsedRows[i].map(h => (h || '').trim().toLowerCase());
      const containsDirectDebitHints = ['payee', 'payment date', 'account number'].some(h => rowLower.includes(h));
      const containsTransactionHints = ['approval', 'date', 'text'].some(h => rowLower.includes(h));
      if (containsDirectDebitHints || containsTransactionHints) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = parsedRows[headerRowIndex].map(h => (h || '').trim());
    const headersLower = headers.map(h => h.toLowerCase());
    const headerSet = new Set(headersLower);
    const dataRows = parsedRows.slice(headerRowIndex + 1);

    console.log(`[upload-direct-debits] Header row index: ${headerRowIndex}`);
    console.log(`[upload-direct-debits] Headers found: ${JSON.stringify(headers)}`);
    console.log(`[upload-direct-debits] Number of data rows: ${dataRows.length}`);

    // Determine mode: direct debit or transaction fallback
    const isDirectDebitHeaders = headerSet.has('payee') && headerSet.has('payment date');
    const isTransactionHeaders = headerSet.has('approval') && headerSet.has('date') && headerSet.has('text');

    if (!isDirectDebitHeaders && !isTransactionHeaders) {
      const serverDebugInfo =
        `Header row index guessed: ${headerRowIndex}\n` +
        `Headers found: ${JSON.stringify(headers, null, 2)}\n\n` +
        `First 5 rows:\n${JSON.stringify(parsedRows.slice(0, 5), null, 2)}`;
      const msg = 'CSV headers not recognized. Expected either direct-debit headers (e.g. "Payee", "Payment Date") or transaction-style headers (e.g. "Approval", "Date", "Text").';
      console.error(`[upload-direct-debits] Error: ${msg}`);
      return new Response(JSON.stringify({ success: false, error: msg, serverDebugInfo }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const idxOf = (name: string) => headersLower.indexOf(name.toLowerCase());
    const pick = (row: string[], name: string) => {
      const idx = idxOf(name);
      return idx >= 0 ? (row[idx]?.trim() || '') : '';
    };

    const toISODate = (s: string | undefined | null) => {
      if (!s) return null;
      const str = s.trim();
      const dot = str.split('.');
      if (dot.length === 3) {
        const [dd, mm, yyyy] = dot;
        return `${yyyy}-${mm}-${dd}`;
      }
      const slash = str.split('/');
      if (slash.length === 3) {
        const [dd, mm, yyyy] = slash;
        return `${yyyy}-${mm}-${dd}`;
      }
      return str;
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

    const directDebitsToInsert: any[] = [];
    const errors: string[] = [];
    const duplicateRefs = new Set<string>();

    // Build set of existing payment_reference values for this country
    const { data: existingRefs } = await supabaseClient
      .from('direct_debits')
      .select('payment_reference')
      .eq('country', country)
      .not('payment_reference', 'is', null);

    existingRefs?.forEach(r => duplicateRefs.add(r.payment_reference!));

    // Process rows
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        let payee = '';
        let paymentDateRaw = '';
        let categoryRaw = '';
        let accountNumber = '';
        let userEmail = '';
        let sku = '';
        let notPropertyRelatedRaw = '';
        let paymentReference = '';
        let bankAccount = '';

        if (isDirectDebitHeaders) {
          // Direct-debit CSV mapping
          payee = pick(row, 'Payee');
          paymentDateRaw = pick(row, 'Payment Date');
          categoryRaw = pick(row, 'Category');
          accountNumber = pick(row, 'Account Number');
          userEmail = pick(row, 'User Email');
          sku = pick(row, 'SKU');
          notPropertyRelatedRaw = pick(row, 'Not Property Related');
          paymentReference = pick(row, 'Payment Reference');
          bankAccount = pick(row, 'Bank Account');
        } else {
          // Transaction CSV fallback mapping to direct debits
          payee = pick(row, 'Text'); // merchant/payee
          paymentDateRaw = pick(row, 'Date');
          // prefer Reason for Payment, else Comment
          categoryRaw = pick(row, 'Reason for Payment') || pick(row, 'Comment');
          accountNumber = pick(row, 'Contra account'); // map to account number
          userEmail = ''; // not present in transaction export → fallback to uploaderId
          sku = pick(row, 'SKU');
          notPropertyRelatedRaw = ''; // default false
          paymentReference = pick(row, 'Entry'); // use numeric entry as reference
          bankAccount = pick(row, 'Bank'); // keep for context
        }

        if (!payee) {
          errors.push(`Row ${i + 1}: Missing payee/merchant value. This row will not be imported.`);
          continue;
        }

        // Resolve requester_id via email if present, otherwise fallback to uploader
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

        const directDebitRecord = {
          requester_id: requesterId,
          payee,
          payment_date, // YYYY-MM-DD or null
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
      } catch (rowError: any) {
        console.error(`[upload-direct-debits] Error processing row ${i + 1}:`, rowError);
        errors.push(`Row ${i + 1}: ${rowError.message || 'Unknown row error'}`);
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
        const msg = `Failed to insert direct debits: ${insertError.message}`;
        console.error('[upload-direct-debits] Failed to insert direct debits:', insertError);
        return new Response(JSON.stringify({ success: false, error: msg }), {
          status: 200,
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
      
      const serverDebugInfo =
        `Header row index guessed: ${headerRowIndex}\n` +
        `Detected mode: ${isDirectDebitHeaders ? 'direct-debit' : 'transaction-fallback'}\n` +
        `Headers found: ${JSON.stringify(headers, null, 2)}\n\n` +
        `First 3 data rows mapped:\n${JSON.stringify(dataRows.slice(0, 3).map((row, i) => {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, index) => {
            rowObj[header] = row[index]?.trim() || '';
          });
          return `Row ${i + 1}: ${JSON.stringify(rowObj)}`;
        }), null, 2)}\n\n` +
        `All errors:\n${errors.join('\n')}`;
      
      return new Response(JSON.stringify({ 
        success: true,
        message,
        errors,
        serverDebugInfo
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[upload-direct-debits] Processing completed successfully');
    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    const msg = 'An unexpected error occurred in the Edge Function.';
    console.error('[upload-direct-debits] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: msg,
      details: error?.message 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});