// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flexible header mapping (lowercase keys)
const HEADER_MAP: Record<string, string[]> = {
  payee: ['payee', 'text'],
  payment_day: ['payment day', 'paymentday'],
  sku: ['sku', 'department'],
  not_property_related: ['not property related', 'notpropertyrelated'],
  category: ['category', 'reason for payment', 'comment'],
  total_amount: ['amount', 'total amount'],
  account_number: ['account number', 'accountnumber', 'contra account'],
  payment_reference: ['payment reference', 'paymentreference', 'entry'],
  user_email: ['user email', 'useremail', 'email'],
  bank_account: ['bank account', 'bankaccount', 'bank'],
  currency: ['currency'],
  payment_date: ['payment date', 'date'], // For fallback
};

const REQUIRED_HEADERS = ['payee'];

// Helper to find a header key from multiple variants
function findHeader(headers: string[], key: string): string | undefined {
  const variants = HEADER_MAP[key];
  if (!variants) return undefined;
  for (const variant of variants) {
    const found = headers.find(h => h.toLowerCase() === variant);
    if (found) return found;
  }
  return undefined;
}

// Helper to get a value from a record using the flexible header map
function getValue(record: Record<string, string>, key: string): string | undefined {
  const variants = HEADER_MAP[key];
  if (!variants) return undefined;
  for (const variant of variants) {
    const foundKey = Object.keys(record).find(k => k.toLowerCase() === variant);
    if (foundKey && record[foundKey] !== undefined) {
      return record[foundKey];
    }
  }
  return undefined;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ success: false, message: 'Server configuration error.', errors: ['Missing Supabase credentials.'] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid request.', errors: ['Missing file data, uploader ID, or country.'] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const separator = fileContent.includes(';') ? ';' : ',';
    const parsedRows = await parse(fileContent, { header: false, separator, trimLeadingWhitespace: true }) as string[][];

    if (parsedRows.length < 2) {
      return new Response(JSON.stringify({ success: false, message: 'CSV file is empty or has no data rows.', errors: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    const missingHeaders = REQUIRED_HEADERS.filter(key => !findHeader(headers, key));
    if (missingHeaders.length > 0) {
      const friendlyNames = missingHeaders.map(key => HEADER_MAP[key][0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      return new Response(JSON.stringify({ success: false, message: 'CSV file is missing required columns.', errors: [`Please ensure your file has the following columns: ${friendlyNames.join(', ')}.`] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const directDebitsToInsert = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      if (row.length !== headers.length) {
        errors.push(`Row ${rowNum}: Column count mismatch. Skipping.`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      const payee = getValue(record, 'payee');
      if (!payee) {
        errors.push(`Row ${rowNum}: Missing required value for 'Payee' or 'Text'. Skipping.`);
        continue;
      }

      let requesterId = uploaderId;
      const userEmail = getValue(record, 'user_email');
      if (userEmail) {
        const { data: profileRow } = await supabaseClient.from('profile_with_email').select('id').eq('user_email', userEmail).single();
        if (profileRow?.id) {
          requesterId = profileRow.id;
        } else {
          errors.push(`Row ${rowNum}: Could not find user with email '${userEmail}'. Assigning to uploader.`);
        }
      }

      const paymentDayStr = getValue(record, 'payment_day');
      let payment_day: number | null = null;
      if (paymentDayStr) {
        const day = parseInt(paymentDayStr, 10);
        if (!isNaN(day) && day >= 1 && day <= 31) {
          payment_day = day;
        } else {
          errors.push(`Row ${rowNum}: Invalid Payment Day '${paymentDayStr}'. It must be a number between 1 and 31.`);
        }
      }

      const paymentDateStr = getValue(record, 'payment_date');
      let payment_date: string | null = null;
      if (paymentDateStr) {
        const dateParts = paymentDateStr.split(/[./-]/);
        if (dateParts.length === 3) {
          const [d, m, y] = dateParts;
          payment_date = `${y}-${m}-${d}`;
        } else {
          errors.push(`Row ${rowNum}: Invalid Payment Date format '${paymentDateStr}'. Please use DD.MM.YYYY.`);
        }
      }

      const not_sku_related_str = getValue(record, 'not_property_related');
      const not_sku_related = not_sku_related_str?.toLowerCase() === 'yes' || not_sku_related_str?.toLowerCase() === 'true';

      const amountStr = getValue(record, 'total_amount');
      const parsedAmount = parseFloat((amountStr || '0').replace(/,/g, ''));
      const total_amount = isNaN(parsedAmount) ? 0 : parsedAmount;

      const category = getValue(record, 'category') || '974_other';

      let currency = getValue(record, 'currency');
      if (country === 'United Kingdom') {
        currency = 'GBP';
      }

      directDebitsToInsert.push({
        requester_id: requesterId,
        payee,
        payment_date,
        payment_day,
        sku: not_sku_related ? null : getValue(record, 'sku'),
        not_property_related: not_sku_related,
        categories: [category],
        total_amount,
        account_number: getValue(record, 'account_number') || 'UNKNOWN',
        payment_reference: getValue(record, 'payment_reference') || null,
        status: 'awaiting_info',
        country,
        bank_account: getValue(record, 'bank_account') || null,
        currency,
      });
    }

    let insertedCount = 0;
    if (directDebitsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('direct_debits')
        .insert(directDebitsToInsert)
        .select();

      if (insertError) {
        return new Response(JSON.stringify({ success: false, message: 'Database insert failed.', errors: [`Error: ${insertError.message}`] }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      insertedCount = insertData?.length || 0;
    }

    const success = errors.length === 0;
    let message = `${insertedCount} of ${dataRows.length} direct debits processed successfully.`;
    if (errors.length > 0) {
      message = `${insertedCount} direct debits inserted. ${errors.length} records were skipped due to errors.`;
    }

    return new Response(JSON.stringify({ success, message, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-direct-debits] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ success: false, message: 'An unexpected server error occurred.', errors: [error.message] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});