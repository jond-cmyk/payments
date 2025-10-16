import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple category mapping
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
];

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

    const expectedHeaders = ['Payee', 'Payment Date', 'SKU', 'Not Property Related', 'Category', 'Amount', 'Account Name', 'Account Address', 'IBAN Number', 'Sort Code', 'Account Number', 'From Day', 'To Day', 'Payment Reference', 'User Email', 'Bank Details Verified'];
    const missingExpectedHeaders = expectedHeaders.filter(h => !headers.includes(h));

    if (missingExpectedHeaders.length > 0) {
      errors.push(`Warning: Missing some expected CSV headers: ${missingExpectedHeaders.join(', ')}. Data for these columns will be null.`);
      console.warn('[upload-standing-orders] Missing expected CSV headers:', missingExpectedHeaders);
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
        'Category': categoryRaw,
        'Account Name': account_name,
        'Account Address': account_address,
        'IBAN Number': iban_number,
        'Sort Code': sort_code,
        'Account Number': account_number,
        'From Day': from_day_str,
        'To Day': to_day_str,
        'Payment Reference': payment_reference,
        'Total Amount': total_amount_str,
        'User Email': user_email_from_csv,
        'Bank Details Verified': bank_details_verified_str,
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

      // Relaxed validation: if critical fields are missing, set to null/default and add a warning
      if (!payee) errors.push(`Missing Payee for row: ${JSON.stringify(record)}`);
      if (!payment_date_str) errors.push(`Missing Payment Date for row: ${JSON.stringify(record)}`);
      if (!category) errors.push(`Missing Category for row: ${JSON.stringify(record)}`);
      if (!total_amount_str) errors.push(`Missing Total Amount for row: ${JSON.stringify(record)}`);
      if (!account_name) errors.push(`Missing Account Name for row: ${JSON.stringify(record)}`);
      if (!from_day_str) errors.push(`Missing From Day for row: ${JSON.stringify(record)}`);
      if (!to_day_str) errors.push(`Missing To Day for row: ${JSON.stringify(record)}`);
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
      const bank_details_verified = bank_details_verified_str?.toLowerCase() === 'yes' || bank_details_verified_str?.toLowerCase() === 'true';

      let from_day: number | null = null;
      if (from_day_str) {
        const parsed = parseInt(from_day_str);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
          from_day = parsed;
        } else {
          errors.push(`Invalid 'From Day' value '${from_day_str}'. Setting to null.`);
        }
      }

      let to_day: number | null = null;
      if (to_day_str) {
        const parsed = parseInt(to_day_str);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
          to_day = parsed;
        } else {
          errors.push(`Invalid 'To Day' value '${to_day_str}'. Setting to null.`);
        }
      }

      if (from_day !== null && to_day !== null && from_day > to_day) {
        errors.push(`'From Day' (${from_day}) cannot be after 'To Day' (${to_day}).`);
      }

      let parsedAmount: number | null = null;
      if (total_amount_str) {
        const parsed = parseFloat(total_amount_str.replace(/,/g, ''));
        if (!isNaN(parsed) && parsed > 0) {
          parsedAmount = parsed;
        } else {
          errors.push(`Invalid or non-positive amount '${total_amount_str}'. Setting to null.`);
        }
      }

      let requesterIdForStandingOrder = uploaderId;

      if (user_email_from_csv) {
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
      } else {
        errors.push(`User Email missing for row. Assigning standing order to uploader.`);
      }

      // Construct categories array and calculate total amount
      const categories = [];
      let total_amount = 0;

      if (category && parsedAmount !== null) {
        categories.push({ category: category, amount: parsedAmount });
        total_amount += parsedAmount;
      } else if (category || parsedAmount !== null) {
        errors.push(`Missing category or amount for primary category. Skipping primary category.`);
      }

      // Handle additional categories if present in CSV (e.g., Category 2, Amount 2)
      for (let i = 2; ; i++) {
        const additionalCategory = record[`Category ${i}`];
        const additionalAmountStr = record[`Amount ${i}`];
        if (additionalCategory && additionalAmountStr) {
          const additionalParsedAmount = parseFloat(additionalAmountStr.replace(/,/g, ''));
          if (!isNaN(additionalParsedAmount) && additionalParsedAmount > 0) {
            categories.push({ category: additionalCategory, amount: additionalParsedAmount });
            total_amount += additionalParsedAmount;
          } else {
            errors.push(`Invalid amount for Category ${i}: '${additionalAmountStr}'. Skipping.`);
            console.warn(`[upload-standing-orders] Invalid amount for Category ${i}: '${additionalAmountStr}'. Skipping.`);
          }
        } else {
          break; // No more additional categories
        }
      }

      standingOrdersToInsert.push({
        requester_id: requesterIdForStandingOrder,
        payee: payee || null,
        payment_date: payment_date,
        sku: sku || null,
        not_property_related: not_property_related,
        category: category,
        account_name: account_name || null,
        account_address: account_address || null,
        iban_number: iban_number || null,
        sort_code: sort_code || null,
        account_number: account_number || null,
        from_day: from_day || 1,
        to_day: to_day || 31,
        payment_reference: payment_reference || null,
        total_amount: total_amount,
        status: 'pending',
        country: country,
        categories: [],
        bank_details_verified: bank_details_verified,
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

    let message = `${insertedCount} standing orders inserted successfully with status 'Pending'.`;
    if (errors.length > 0) {
      message += ` ${errors.length} warnings/errors encountered during processing.`;
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