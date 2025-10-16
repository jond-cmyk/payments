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
    console.log('[upload-standing-orders] Starting function execution');
    
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

    let payload;
    try {
      payload = await req.json();
      console.log('[upload-standing-orders] Payload received successfully');
    } catch (jsonError) {
      console.error('[upload-standing-orders] Failed to parse JSON payload:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      console.error('[upload-standing-orders] Missing required fields:', { fileName: !!fileName, fileContent: !!fileContent, uploaderId: !!uploaderId, country: !!country });
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-standing-orders] Processing file: ${fileName} from uploader: ${uploaderId} for country: ${country}`);

    let parsedRows: string[][];
    try {
      parsedRows = await parse(fileContent, {
        header: false,
        separator: ',',
        trimLeadingWhitespace: true,
      }) as string[][];
      console.log(`[upload-standing-orders] CSV parsed successfully. Number of rows: ${parsedRows.length}`);
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

    // Process each data row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      if (row.length !== headers.length) {
        const msg = `Row ${i + 1} has ${row.length} columns but headers have ${headers.length}. Skipping.`;
        errors.push(msg);
        console.warn(`[upload-standing-orders] ${msg}`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      try {
        let payee = record['Payee'] || '';
        let payment_date_str = record['Payment Date'] || '';
        let sku = record['SKU'] || '';
        let not_property_related_str = record['Not Property Related'] || '';
        let categoryRaw = record['Category'] || '';
        let account_name = record['Account Name'] || '';
        let account_address = record['Account Address'] || '';
        let iban_number = record['IBAN Number'] || '';
        let sort_code = record['Sort Code'] || '';
        let account_number = record['Account Number'] || '';
        let from_day_str = record['From Day'] || '';
        let to_day_str = record['To Day'] || '';
        let payment_reference = record['Payment Reference'] || '';
        let total_amount_str = record['Total Amount'] || '';
        let user_email_from_csv = record['User Email'] || '';
        let bank_details_verified_str = record['Bank Details Verified'] || '';

        // Map numeric category to full label
        let category = categoryRaw || null;
        if (category && /^\d{3}$/.test(category.trim())) {
          const found = categoryOptions.find(opt => opt.value.startsWith(category.trim()));
          if (found) {
            category = found.value;
          } else {
            errors.push(`Row ${i + 1}: Unknown category code "${category}"`);
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
        if (!total_amount_str) {
          errors.push(`Row ${i + 1}: Missing Total Amount`);
          continue;
        }
        if (!account_name) {
          errors.push(`Row ${i + 1}: Missing Account Name`);
          continue;
        }
        if (!from_day_str) {
          errors.push(`Row ${i + 1}: Missing From Day`);
          continue;
        }
        if (!to_day_str) {
          errors.push(`Row ${i + 1}: Missing To Day`);
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
          } else {
            errors.push(`Row ${i + 1}: Invalid date format '${payment_date_str}'. Expected DD.MM.YYYY.`);
            continue;
          }
        }

        const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';
        const bank_details_verified = bank_details_verified_str?.toLowerCase() === 'yes' || bank_details_verified_str?.toLowerCase() === 'true';

        // Parse day values
        let from_day = 1;
        if (from_day_str) {
          const parsed = parseInt(from_day_str);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
            from_day = parsed;
          } else {
            errors.push(`Row ${i + 1}: Invalid 'From Day' value '${from_day_str}'`);
            continue;
          }
        }

        let to_day = 31;
        if (to_day_str) {
          const parsed = parseInt(to_day_str);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
            to_day = parsed;
          } else {
            errors.push(`Row ${i + 1}: Invalid 'To Day' value '${to_day_str}'`);
            continue;
          }
        }

        if (from_day > to_day) {
          errors.push(`Row ${i + 1}: 'From Day' (${from_day}) cannot be after 'To Day' (${to_day})`);
          continue;
        }

        // Parse amount
        let total_amount = 0;
        if (total_amount_str) {
          const parsed = parseFloat(total_amount_str.replace(/,/g, ''));
          if (!isNaN(parsed) && parsed > 0) {
            total_amount = parsed;
          } else {
            errors.push(`Row ${i + 1}: Invalid amount '${total_amount_str}'`);
            continue;
          }
        }

        // Find user ID from email
        let requesterIdForStandingOrder = uploaderId;
        
        try {
          const { data: profileData, error: profileError } = await supabaseClient
            .from('profile_with_email')
            .select('id')
            .eq('user_email', user_email_from_csv)
            .eq('country', country)
            .single();

          if (profileError || !profileData) {
            errors.push(`Row ${i + 1}: User with email '${user_email_from_csv}' not found in country ${country}. Using uploader ID.`);
          } else {
            requesterIdForStandingOrder = profileData.id;
          }
        } catch (userError) {
          console.error(`[upload-standing-orders] Error finding user for email ${user_email_from_csv}:`, userError);
          errors.push(`Row ${i + 1}: Error finding user. Using uploader ID.`);
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
          total_amount: total_amount,
          status: 'pending',
          country: country,
          categories: [],
          bank_details_verified: bank_details_verified,
        });

      } catch (rowError) {
        console.error(`[upload-standing-orders] Error processing row ${i + 1}:`, rowError);
        errors.push(`Row ${i + 1}: ${rowError.message}`);
        continue;
      }
    }

    console.log(`[upload-standing-orders] Standing Orders prepared for insertion: ${standingOrdersToInsert.length}`);

    let insertedCount = 0;
    if (standingOrdersToInsert.length > 0) {
      console.log('[upload-standing-orders] Inserting standing orders into database...');
      
      const { data: insertData, error: insertError } = await supabaseClient
        .from('standing_orders')
        .insert(standingOrdersToInsert)
        .select();

      if (insertError) {
        console.error('[upload-standing-orders] Failed to insert standing orders into database:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert standing orders: ${insertError.message}` }), {
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
      console.log('[upload-standing-orders] Processing completed with errors:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[upload-standing-orders] Processing completed successfully');
    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-standing-orders] Edge Function unhandled error:', error);
    console.error('[upload-standing-orders] Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: 'An unexpected error occurred in the Edge Function.',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});