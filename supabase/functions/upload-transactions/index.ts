import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// EMBED: List of common categories - UPDATED with custom sort
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
  { value: '976_council_tax', label: '976 - Council Tax', countries: ['United Kingdom'] }, // NEW: Council Tax for UK
  { value: '3055_subcontractors', label: '3055 - Subcontractors' },
  { value: '3056_otg_service_team_costs', label: '3056 - OTG - Service Team Costs' },
  { value: '3057_storage_units_facilities', label: '3057 - Storage Units & Facilities' },
  { value: '3075_software', label: '3075 - Software' },
  { value: '3079_fines', label: '3079 - Fines' },
  { value: '3089_car_fuel', label: '3089 - Car fuel' },
  { value: '3090_car_taxes', label: '3090 - Car taxes' },
  { value: '3091_car_insurance', label: '3091 - Car Insurance' },
  { value: '3092_bridge_ferry_tolls', label: '3092 - Bridge, ferry and tolls' },
  { value: '3102_office_rent', label: '3102 - Office rent' },
  { value: '3115_office_phone_internet', label: '3115 - Office Phone and internet' },
  { value: '3122_accountant', label: '3122 - Accountant' },
  { value: '3125_lawyer', label: '3125 - Lawyer' },
  { value: '3147_company_insurance', label: '3147 - Company insurance' },
  { value: '3157_postage', label: '3157 - Postage' },
  { value: '3444_restaurant_visits', label: '3444 - Restaurant visits' },
  { value: '3469_gifts_flowers', label: '3469 - Gifts and flowers' },
  { value: '3476_travel_hotels', label: '3476 - Travel and hotels' },
  { value: '3480_marketing', label: '3480 – Marketing' },
  { value: '5201_provider_deposit', label: '5201 – Provider Deposit' },
].sort((a, b) => {
  // Extract numerical prefix from label
  const getPrefix = (label: string) => {
    const match = label.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity; // Use Infinity for items without a numerical prefix to push them to the end
  };

  const prefixA = getPrefix(a.label);
  const prefixB = getPrefix(b.label);

  if (prefixA !== prefixB) {
    return prefixA - prefixB; // Sort by numerical prefix
  }
  return a.label.localeCompare(b.label); // Fallback to alphabetical sort
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[upload-transactions] Edge Function invoked.');

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
    const { fileName, fileContent, uploaderId, country } = payload;

    console.log(`[upload-transactions] Received payload: fileName=${fileName}, uploaderId=${uploaderId}, country=${country}, fileContentLength=${fileContent?.length || 0}`);

    if (!fileName || !fileContent || !uploaderId || !country) {
      const msg = 'Missing file data, uploader ID, or country in payload.';
      console.error(`[upload-transactions] Error: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-transactions] Received file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);
    console.log(`[upload-transactions] File content length: ${fileContent.length}`);

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false, // We will manually extract headers
        separator: ',',
        trimLeadingWhitespace: true,
        // Removed skipFirstNLines to manually handle row indexing
      }) as string[][];
      console.log(`[upload-transactions] CSV parsed successfully. Total raw rows: ${parsedRows.length}`);
      
      // Log the first few raw parsed rows for debugging
      for (let i = 0; i < Math.min(parsedRows.length, 5); i++) {
        console.log(`[upload-transactions] Raw parsed row ${i}: ${JSON.stringify(parsedRows[i])}`);
      }

    } catch (csvParseError) {
      console.error('[upload-transactions] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure there are enough rows for metadata + headers + at least one data row
    if (parsedRows.length < 4) { 
      const msg = 'CSV file is too short to contain expected metadata and headers.';
      errors.push(msg);
      console.error(`[upload-transactions] Error: ${msg}`);
      return new Response(JSON.stringify({ message: msg, errors: errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[3].map(h => h.trim()); // Actual headers are at index 3 (4th row)
    const dataRows = parsedRows.slice(4); // Data starts from index 4 (5th row)

    console.log(`[upload-transactions] Extracted headers: ${JSON.stringify(headers)}`);
    console.log(`[upload-transactions] Number of data rows: ${dataRows.length}`);

    const transactionsToInsert = [];
    const errors: string[] = [];

    const headerMap: Record<string, string> = {
      'Date': 'transaction_date',
      'Text': 'description',
      'Amount': 'amount',
      'Currency': 'currency',
      'Type': 'type',
      'Entry': 'entry',
      'Account': 'bank',
      'Contra account': 'contra_account',
      'Exchange rate': 'exchange_rate',
      'Payment identifier/Message': 'comment',
      'Department': 'sku',
    };

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

    const { data: existingEntriesData, error: fetchEntriesError } = await supabaseClient
      .from('transactions')
      .select('entry')
      .eq('country', country);

    if (fetchEntriesError) {
      console.error('[upload-transactions] Error fetching existing entries:', fetchEntriesError);
      return new Response(JSON.stringify({ error: `Failed to fetch existing entries for uniqueness check: ${fetchEntriesError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingEntries = new Set(existingEntriesData?.map(row => row.entry).filter(Boolean) || []);
    console.log(`[upload-transactions] Fetched ${existingEntries.size} existing unique entries for country ${country}.`);

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
        'Transaction Date': transaction_date_str,
        'Entry': entry,
        'Description': description,
        'Amount': amount_str,
        'Currency': currency,
        'Bank': bank,
        'Contra Account': contra_account,
        'SKU': sku,
        'Not SKU Related': not_sku_related_str,
        'Category': categoryRaw,
        'Merchant Name': merchant_name,
        'Reason for Payment': reason_for_payment,
        'User Email': user_email_from_csv,
      } = record;

      // Map numeric category to full label
      let category = categoryRaw || null;
      if (category && /^\d{3}$/.test(category.trim())) {
        const found = categoryOptions.find(opt => opt.value.startsWith(category.trim()));
        if (found) {
          category = found.value;
        } else {
          errors.push(`Unknown category code "${category}" for row: ${JSON.stringify(record)}`);
        }
      }

      const transaction_date_str = record['Date'];
      const description = record['Text'];
      const amount_str = record['Amount'];
      const currency = record['Currency'];
      const type = record['Type'];
      const entry = record['Entry'];
      const bank = record['Account'];
      const contra_account = record['Contra account'];
      const exchange_rate_str = record['Exchange rate'];
      const comment = record['Payment identifier/Message'];
      const sku = record['Department'];

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

      const requesterIdForTransaction = uploaderId;

      transactionsToInsert.push({
        requester_id: requesterIdForTransaction,
        original_transaction_id: original_transaction_id || null,
        status: 'pending_input',
        type: null,
        transaction_date: transactionDate,
        entry: entry || null,
        description: description,
        amount: amount,
        bank: bank || null,
        contra_account: contra_account || null,
        currency: currency,
        exchange_rate: null,
        comment: null,
        sku: not_sku_related ? null : sku,
        reason_for_payment: reason_for_payment || null,
        receipt_urls: [],
        category: category,
        merchant_name: merchant_name || null,
        notes: null,
        not_sku_related: not_sku_related,
        country: country,
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