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
  payee: ['payee'],
  payment_date: ['payment start date', 'payments start date', 'start date'],
  payment_end_date: ['payment end date', 'payments end date', 'end date'],
  payment_day: ['payment day', 'paymentday'],
  sku: ['sku'],
  not_property_related: ['not property related', 'notpropertyrelated'],
  category: ['category'],
  total_amount: ['amount', 'total amount'],
  account_name: ['account name', 'accountname'],
  account_address: ['account address', 'accountaddress'],
  iban_number: ['iban', 'iban number'],
  sort_code: ['sort code', 'sortcode'],
  account_number: ['account number', 'accountnumber'],
  from_day: ['from day', 'fromday'],
  to_day: ['to day', 'today'],
  payment_reference: ['payment reference', 'paymentreference'],
  comments: ['comment', 'comments'],
  user_email: ['user email', 'useremail', 'email'],
  currency: ['currency'],
  bank_account: ['bank account', 'bankaccount'],
};

const REQUIRED_HEADERS = ['payee', 'sku', 'category', 'total_amount'];

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
      throw new Error('Server configuration error: Missing Supabase credentials.');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      throw new Error('Invalid request: Missing file data, uploader ID, or country.');
    }

    const firstLine = fileContent.split('\n')[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    const parsedRows = await parse(fileContent, { header: false, separator, trimLeadingWhitespace: true, lazyQuotes: true }) as string[][];

    if (parsedRows.length < 2) {
      return new Response(JSON.stringify({ success: false, message: 'CSV file is empty or has no data rows.', errors: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    // Strip BOM from the first header if it exists
    if (headers[0] && headers[0].startsWith('\uFEFF')) {
      headers[0] = headers[0].substring(1);
    }

    const missingHeaders = REQUIRED_HEADERS.filter(key => !findHeader(headers, key));
    if (missingHeaders.length > 0) {
      const friendlyNames = missingHeaders.map(key => HEADER_MAP[key][0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      const debugInfo = `Detected Headers: [${headers.join(', ')}]\nNumber of Headers Detected: ${headers.length}\nFirst Header Raw: "${parsedRows[0][0]}"\nFirst Header Trimmed: "${headers[0]}"\nFirst Header Char Codes: [${headers[0].split('').map(c => c.charCodeAt(0)).join(', ')}]`;
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'An unexpected server error occurred.', 
        errors: [`CSV file is missing required columns: ${friendlyNames.join(', ')}.`] ,
        serverDebugInfo: debugInfo
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const standingOrdersToInsert = [];
    const errors: string[] = [];
    const userEmailToIdCache: Record<string, string> = {};

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      try {
        if (row.length !== headers.length) {
          throw new Error(`Column count mismatch. Expected ${headers.length}, but got ${row.length}.`);
        }

        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || "";
        });

        const payee = getValue(record, 'payee');
        if (!payee) {
          throw new Error(`Missing required value for 'Payee'.`);
        }

        let requesterId = uploaderId;
        const userEmail = getValue(record, 'user_email');
        if (userEmail) {
          if (userEmailToIdCache[userEmail]) {
            requesterId = userEmailToIdCache[userEmail];
          } else {
            const { data: profileRow, error: profileError } = await supabaseClient.from('profile_with_email').select('id').eq('user_email', userEmail).single();
            if (profileError || !profileRow) {
              errors.push(`Row ${rowNum}: Could not find user with email '${userEmail}'. Assigning to uploader.`);
            } else {
              requesterId = profileRow.id;
              userEmailToIdCache[userEmail] = profileRow.id;
            }
          }
        }

        const parseDate = (dateStr: string | undefined) => {
          if (!dateStr) return null;
          const parts = dateStr.split(/[./-]/);
          if (parts.length === 3) {
            const [p1, p2, p3] = parts;
            if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`; // YYYY-MM-DD
            return `${p3.length === 2 ? `20${p3}` : p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`; // DD.MM.YYYY
          }
          return null;
        };

        const payment_date = parseDate(getValue(record, 'payment_date'));
        if (!payment_date) {
          throw new Error(`Invalid or missing Payment Start Date. Please use DD.MM.YYYY or YYYY-MM-DD.`);
        }
        const payment_end_date = parseDate(getValue(record, 'payment_end_date'));

        const not_property_related_str = getValue(record, 'not_property_related');
        const not_property_related = not_property_related_str?.toLowerCase() === 'yes' || not_property_related_str?.toLowerCase() === 'true';

        const amountStr = getValue(record, 'total_amount');
        const parsedAmount = parseFloat((amountStr || '0').replace(/,/g, '').replace(/\s/g, ''));
        const total_amount = isNaN(parsedAmount) ? 0 : parsedAmount;

        const category = getValue(record, 'category') || '974_other';

        let currency = getValue(record, 'currency');
        if (country === 'United Kingdom') {
          currency = 'GBP';
        }

        const fromDayStr = getValue(record, 'from_day') || '1';
        const toDayStr = getValue(record, 'to_day') || '31';
        const from_day = parseInt(fromDayStr, 10);
        const to_day = parseInt(toDayStr, 10);

        if (isNaN(from_day) || isNaN(to_day)) {
          throw new Error(`Invalid 'From Day' or 'To Day'.`);
        }

        standingOrdersToInsert.push({
          requester_id: requesterId,
          payee,
          payment_date,
          payment_end_date,
          payment_day: parseInt(getValue(record, 'payment_day') || '0', 10) || null,
          sku: not_property_related ? null : (getValue(record, 'sku') || null),
          not_property_related,
          categories: [{ category, amount: total_amount }],
          total_amount,
          account_name: getValue(record, 'account_name') || null,
          account_address: getValue(record, 'account_address') || null,
          iban_number: getValue(record, 'iban_number') || null,
          sort_code: getValue(record, 'sort_code') || null,
          account_number: getValue(record, 'account_number') || null,
          from_day,
          to_day,
          payment_reference: getValue(record, 'payment_reference') || null,
          comments: getValue(record, 'comments') || null,
          status: 'awaiting_info',
          country,
          bank_details_verified: false,
          currency,
          bank_account: getValue(record, 'bank_account') || null,
        });
      } catch (rowError) {
        errors.push(`Row ${rowNum}: ${rowError.message}`);
      }
    }

    let insertedCount = 0;
    if (standingOrdersToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('standing_orders')
        .insert(standingOrdersToInsert)
        .select();

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      insertedCount = insertData?.length || 0;
    }

    const success = errors.length === 0 && insertedCount > 0;
    let message = `${insertedCount} of ${dataRows.length} standing orders processed successfully.`;
    if (errors.length > 0) {
      message = `${insertedCount} standing orders inserted. ${errors.length} records were skipped due to errors.`;
    }

    return new Response(JSON.stringify({ success, message, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-standing-orders] Edge Function Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, message: 'An unexpected server error occurred.', errors: [errorMessage] }), {
      status: 200, // IMPORTANT: Return 200 so client can parse the error message
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});