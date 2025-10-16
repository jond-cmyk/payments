import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Category mapping
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

function mapPrefixToCategory(prefix: string | null): string | null {
  if (!prefix) return null;
  const trimmed = prefix.trim();
  if (!/^\d{3}$/.test(trimmed)) return null;
  const found = categoryOptions.find(opt => opt.value.startsWith(trimmed));
  return found ? found.value : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase URL or Service Role Key is missing in environment variables.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      return new Response(JSON.stringify({ error: 'Missing file data, uploader ID, or country in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedRows = await parse(fileContent, {
      header: false,
      separator: ',',
      trimLeadingWhitespace: true,
    }) as string[][];

    if (!parsedRows || parsedRows.length < 2) {
      return new Response(JSON.stringify({ error: 'CSV file is empty or contains no data rows.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    const standingOrdersToInsert: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch, expected ${headers.length} found ${row.length}. Skipping.`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      console.log(`Processing row ${i + 1}`, record);

      try {
        // Minimal inputs expected:
        // SKU, Payee, Amount, Payment Day, Payment Start Date (DD.MM.YYYY), Comment, Category (3-digit prefix)
        const payee = (record['Payee'] || '').trim();
        const sku = (record['SKU'] || '').trim();
        const amountStr = (record['Amount'] || record['Total Amount'] || '').trim();
        const paymentDayStr = (record['Payment Day'] || '').trim();
        const paymentStartDateStr = (record['Payment Start Date'] || '').trim();
        const comment = (record['Comment'] || '').trim();
        const categoryPrefix = (record['Category'] || record['Category Prefix'] || '').trim();

        console.log(`Row ${i + 1} extracted`, { payee, sku, amountStr, paymentDayStr, paymentStartDateStr, comment, categoryPrefix });

        // Basic validation
        if (!payee) {
          errors.push(`Row ${i + 1}: Missing Payee`);
          continue;
        }

        if (!amountStr) {
          errors.push(`Row ${i + 1}: Missing Amount`);
          continue;
        }
        const normalizedAmountStr = amountStr.replace(/[^\d.,-]/g, '').replace(/,/g, '');
        const amount = parseFloat(normalizedAmountStr);
        if (isNaN(amount) || amount <= 0) {
          errors.push(`Row ${i + 1}: Invalid Amount '${amountStr}'`);
          continue;
        }

        if (!paymentDayStr) {
          errors.push(`Row ${i + 1}: Missing Payment Day`);
          continue;
        }
        const payment_day = parseInt(paymentDayStr, 10);
        if (isNaN(payment_day) || payment_day < 1 || payment_day > 31) {
          errors.push(`Row ${i + 1}: Invalid Payment Day '${paymentDayStr}'`);
          continue;
        }

        if (!paymentStartDateStr) {
          errors.push(`Row ${i + 1}: Missing Payment Start Date`);
          continue;
        }
        // Expect DD.MM.YYYY -> convert to YYYY-MM-DD
        let payment_date: string | null = null;
        const parts = paymentStartDateStr.split('.');
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts;
          if (/^\d{2}$/.test(dd) && /^\d{2}$/.test(mm) && /^\d{4}$/.test(yyyy)) {
            payment_date = `${yyyy}-${mm}-${dd}`;
          } else {
            errors.push(`Row ${i + 1}: Invalid Payment Start Date '${paymentStartDateStr}' (expected DD.MM.YYYY).`);
            continue;
          }
        } else {
          errors.push(`Row ${i + 1}: Invalid Payment Start Date '${paymentStartDateStr}' (expected DD.MM.YYYY).`);
          continue;
        }

        const mappedCategory = mapPrefixToCategory(categoryPrefix);
        if (!mappedCategory) {
          errors.push(`Row ${i + 1}: Invalid or unknown Category prefix '${categoryPrefix}'`);
          continue;
        }

        const not_property_related = sku === '' || sku.toLowerCase() === 'n/a';

        // Build categories array with a single item from the provided amount
        const categories = [{ category: mappedCategory, amount }];

        // Defaults for required fields not present in minimal CSV
        const from_day = 1;
        const to_day = 31;

        // Insert-ready record
        const rowPayload = {
          requester_id: uploaderId,
          payee,
          payment_date,              // Start date (YYYY-MM-DD)
          payment_day,               // New field for the day of month
          payment_end_date: null,    // Optional, not provided
          sku: not_property_related ? null : sku,
          not_property_related,
          categories,
          total_amount: amount,
          account_name: null,        // Not provided in minimal sheet
          account_address: null,
          iban_number: null,
          sort_code: null,
          account_number: null,
          from_day,
          to_day,
          payment_reference: comment || null,
          status: 'pending',
          country,
          bank_details_verified: false,
        };

        console.log(`Row ${i + 1} ready for insert`, rowPayload);

        standingOrdersToInsert.push(rowPayload);
      } catch (rowErr: any) {
        errors.push(`Row ${i + 1}: ${rowErr?.message || 'Unknown row error'}`);
        continue;
      }
    }

    console.log('Total rows to insert:', standingOrdersToInsert.length);
    console.log('Errors collected:', errors);

    let insertedCount = 0;
    if (standingOrdersToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('standing_orders')
        .insert(standingOrdersToInsert)
        .select();

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: `Failed to insert standing orders: ${insertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      insertedCount = insertData?.length || 0;
      console.log('Insert result count:', insertedCount);
    }

    let message = `${insertedCount} standing orders inserted successfully with status 'Pending'.`;
    const body: Record<string, unknown> = { message };
    if (errors.length > 0) {
      body.errors = errors;
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: 'An unexpected error occurred in the Edge Function.',
      details: err?.message || String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});