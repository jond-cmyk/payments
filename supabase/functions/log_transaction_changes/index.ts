CREATE OR REPLACE FUNCTION public.log_transaction_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _user_id UUID;
  _change_description TEXT;
BEGIN
  -- Attempt to get the current authenticated user's ID
  SELECT auth.uid() INTO _user_id;

  -- Log initial trigger information for debugging
  RAISE LOG 'log_transaction_changes: TG_OP = %, OLD.id = %, NEW.id = %', TG_OP, OLD.id, NEW.id;
  RAISE LOG 'log_transaction_changes: OLD.status = %, NEW.status = %', OLD.status, NEW.status;
  RAISE LOG 'log_transaction_changes: OLD.receipt_urls = %, NEW.receipt_urls = %', OLD.receipt_urls, NEW.receipt_urls;
  RAISE LOG 'log_transaction_changes: OLD.category = %, NEW.category = %', OLD.category, NEW.category;
  RAISE LOG 'log_transaction_changes: OLD.merchant_name = %, NEW.merchant_name = %', OLD.merchant_name, NEW.merchant_name;
  RAISE LOG 'log_transaction_changes: OLD.sku = %, NEW.sku = %', OLD.sku, NEW.sku;
  RAISE LOG 'log_transaction_changes: OLD.not_sku_related = %, NEW.not_sku_related = %', OLD.not_sku_related, NEW.not_sku_related;


  IF TG_OP = 'UPDATE' THEN
    _change_description := 'Transaction updated. ';
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _change_description := _change_description || 'Status changed from "' || OLD.status || '" to "' || NEW.status || '". ';
    END IF;
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      _change_description := _change_description || 'Type changed from "' || COALESCE(OLD.type, 'NULL') || '" to "' || COALESCE(NEW.type, 'NULL') || '". ';
    END IF;
    IF OLD.transaction_date IS DISTINCT FROM NEW.transaction_date THEN
      _change_description := _change_description || 'Transaction Date changed from "' || OLD.transaction_date || '" to "' || NEW.transaction_date || '". ';
    END IF;
    IF OLD.entry IS DISTINCT FROM NEW.entry THEN
      _change_description := _change_description || 'Entry changed from "' || COALESCE(OLD.entry, 'NULL') || '" to "' || COALESCE(NEW.entry, 'NULL') || '". ';
    END IF;
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      _change_description := _change_description || 'Description changed from "' || OLD.description || '" to "' || NEW.description || '". ';
    END IF;
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN
      _change_description := _change_description || 'Amount changed from "' || OLD.amount || '" to "' || NEW.amount || '". ';
    END IF;
    IF OLD.bank IS DISTINCT FROM NEW.bank THEN
      _change_description := _change_description || 'Bank changed from "' || COALESCE(OLD.bank, 'NULL') || '" to "' || COALESCE(NEW.bank, 'NULL') || '". ';
    END IF;
    IF OLD.contra_account IS DISTINCT FROM NEW.contra_account THEN
      _change_description := _change_description || 'Contra Account changed from "' || COALESCE(OLD.contra_account, 'NULL') || '" to "' || COALESCE(NEW.contra_account, 'NULL') || '". ';
    END IF;
    IF OLD.currency IS DISTINCT FROM NEW.currency THEN
      _change_description := _change_description || 'Currency changed from "' || OLD.currency || '" to "' || NEW.currency || '". ';
    END IF;
    IF OLD.exchange_rate IS DISTINCT FROM NEW.exchange_rate THEN
      _change_description := _change_description || 'Exchange Rate changed from "' || COALESCE(OLD.exchange_rate::text, 'NULL') || '" to "' || COALESCE(NEW.exchange_rate::text, 'NULL') || '". ';
    END IF;
    IF OLD.comment IS DISTINCT FROM NEW.comment THEN
      _change_description := _change_description || 'Comment changed from "' || COALESCE(OLD.comment, 'NULL') || '" to "' || COALESCE(NEW.comment, 'NULL') || '". ';
    END IF;
    IF OLD.sku IS DISTINCT FROM NEW.sku THEN
      _change_description := _change_description || 'SKU changed from "' || COALESCE(OLD.sku, 'NULL') || '" to "' || COALESCE(NEW.sku, 'NULL') || '". ';
    END IF;
    IF OLD.reason_for_payment IS DISTINCT FROM NEW.reason_for_payment THEN
      _change_description := _change_description || 'Reason for Payment changed from "' || COALESCE(OLD.reason_for_payment, 'NULL') || '" to "' || COALESCE(NEW.reason_for_payment, 'NULL') || '". ';
    END IF;
    IF OLD.receipt_urls IS DISTINCT FROM NEW.receipt_urls THEN
      _change_description := _change_description || 'Receipt URLs changed. ';
    END IF;
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      _change_description := _change_description || 'Category changed from "' || COALESCE(OLD.category, 'NULL') || '" to "' || COALESCE(NEW.category, 'NULL') || '". ';
    END IF;
    IF OLD.merchant_name IS DISTINCT FROM NEW.merchant_name THEN
      _change_description := _change_description || 'Merchant Name changed from "' || COALESCE(OLD.merchant_name, 'NULL') || '" to "' || COALESCE(NEW.merchant_name, 'NULL') || '". ';
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      _change_description := _change_description || 'Notes changed from "' || COALESCE(OLD.notes, 'NULL') || '" to "' || COALESCE(NEW.notes, 'NULL') || '". ';
    END IF;
    IF OLD.not_sku_related IS DISTINCT FROM NEW.not_sku_related THEN
      _change_description := _change_description || 'Not SKU Related changed from "' || OLD.not_sku_related || '" to "' || NEW.not_sku_related || '". ';
    END IF;

    -- Attempt to insert into transaction_audits, catching any errors
    BEGIN
      RAISE LOG 'log_transaction_changes: Attempting to insert audit for transaction_id: %, changed_by_user_id: %, change_description: %', NEW.id, _user_id, _change_description;
      INSERT INTO public.transaction_audits (transaction_id, changed_by_user_id, change_description)
      VALUES (NEW.id, _user_id, _change_description);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Error inserting into transaction_audits for UPDATE (transaction_id: %): %', NEW.id, SQLERRM;
    END;

  ELSIF TG_OP = 'INSERT' THEN
    -- Attempt to insert into transaction_audits for new transactions, catching any errors
    BEGIN
      RAISE LOG 'log_transaction_changes: Attempting to insert audit for new transaction_id: %, changed_by_user_id: %, change_description: %', NEW.id, _user_id, 'New transaction created.';
      INSERT INTO public.transaction_audits (transaction_id, changed_by_user_id, change_description)
      VALUES (NEW.id, _user_id, 'New transaction created.');
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Error inserting into transaction_audits for INSERT (transaction_id: %): %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$