CREATE OR REPLACE FUNCTION public.log_payment_request_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _user_id UUID;
  _change_description TEXT;
BEGIN
  SELECT auth.uid() INTO _user_id;

  IF TG_OP = 'UPDATE' THEN
    _change_description := 'Payment request updated. ';
    IF OLD.supplier_name IS DISTINCT FROM NEW.supplier_name THEN
      _change_description := _change_description || 'Supplier Name changed from \\"\\' || OLD.supplier_name || '\\" to \\"\\' || NEW.supplier_name || '\\"\\. ';
    END IF;
    IF OLD.sku_number IS DISTINCT FROM NEW.sku_number THEN
      _change_description := _change_description || 'SKU Number changed from \\"\\' || COALESCE(OLD.sku_number, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.sku_number, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.not_sku_related IS DISTINCT FROM NEW.not_sku_related THEN
      _change_description := _change_description || 'Not SKU Related changed from \\"\\' || OLD.not_sku_related || '\\" to \\"\\' || NEW.not_sku_related || '\\"\\. ';
    END IF;
    IF OLD.lease_id IS DISTINCT FROM NEW.lease_id THEN
      _change_description := _change_description || 'Lease ID changed from \\"\\' || COALESCE(OLD.lease_id, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.lease_id, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.supplier_address IS DISTINCT FROM NEW.supplier_address THEN
      _change_description := _change_description || 'Supplier Address changed from \\"\\' || OLD.supplier_address || '\\" to \\"\\' || NEW.supplier_address || '\\"\\. ';
    END IF;
    IF OLD.iban_number IS DISTINCT FROM NEW.iban_number THEN
      _change_description := _change_description || 'IBAN Number changed from \\"\\' || COALESCE(OLD.iban_number, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.iban_number, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.sort_code IS DISTINCT FROM NEW.sort_code THEN
      _change_description := _change_description || 'Sort Code changed from \\"\\' || COALESCE(OLD.sort_code, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.sort_code, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.account_number IS DISTINCT FROM NEW.account_number THEN
      _change_description := _change_description || 'Account Number changed from \\"\\' || COALESCE(OLD.account_number, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.account_number, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.bank_account_name IS DISTINCT FROM NEW.bank_account_name THEN
      _change_description := _change_description || 'Bank Account Name changed from \\"\\' || COALESCE(OLD.bank_account_name, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.bank_account_name, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.reason_for_payment IS DISTINCT FROM NEW.reason_for_payment THEN
      _change_description := _change_description || 'Reason for Payment changed from \\"\\' || OLD.reason_for_payment || '\\" to \\"\\' || NEW.reason_for_payment || '\\"\\. ';
    END IF;
    IF OLD.date_payment_required IS DISTINCT FROM NEW.date_payment_required THEN
      _change_description := _change_description || 'Date Payment Required changed from \\"\\' || OLD.date_payment_required || '\\" to \\"\\' || NEW.date_payment_required || '\\"\\. ';
    END IF;
    IF OLD.invoice_pdf_urls IS DISTINCT FROM NEW.invoice_pdf_urls THEN
      _change_description := _change_description || 'Invoice PDF URLs changed. ';
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _change_description := _change_description || 'Status changed from \\"\\' || OLD.status || '\\" to \\"\\' || NEW.status || '\\"\\. ';
    END IF;
    IF OLD.admin_action_by IS DISTINCT FROM NEW.admin_action_by THEN
      _change_description := _change_description || 'Admin Action By changed. ';
    END IF;
    IF OLD.admin_action_reason IS DISTINCT FROM NEW.admin_action_reason THEN
      _change_description := _change_description || 'Admin Action Reason changed from \\"\\' || COALESCE(OLD.admin_action_reason, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.admin_action_reason, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.receipt_pdf_url IS DISTINCT FROM NEW.receipt_pdf_url THEN
      _change_description := _change_description || 'Receipt PDF URL changed. ';
    END IF;
    IF OLD.payment_setup_date IS DISTINCT FROM NEW.payment_setup_date THEN
      _change_description := _change_description || 'Payment Setup Date changed from \\"\\' || COALESCE(OLD.payment_setup_date::text, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.payment_setup_date::text, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.payment_approved_date IS DISTINCT FROM NEW.payment_approved_date THEN
      _change_description := _change_description || 'Payment Approved Date changed from \\"\\' || COALESCE(OLD.payment_approved_date::text, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.payment_approved_date::text, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.currency IS DISTINCT FROM NEW.currency THEN
      _change_description := _change_description || 'Currency changed from \\"\\' || COALESCE(OLD.currency, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.currency, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN
      _change_description := _change_description || 'Total Amount changed from \\"\\' || COALESCE(OLD.total_amount::text, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.total_amount::text, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.receipt_required IS DISTINCT FROM NEW.receipt_required THEN
      _change_description := _change_description || 'Receipt Required changed from \\"\\' || OLD.receipt_required || '\\" to \\"\\' || NEW.receipt_required || '\\"\\. ';
    END IF;
    IF OLD.is_urgent IS DISTINCT FROM NEW.is_urgent THEN
      _change_description := _change_description || 'Urgent status changed from \\"\\' || OLD.is_urgent || '\\" to \\"\\' || NEW.is_urgent || '\\"\\. ';
    END IF;
    IF OLD.country IS DISTINCT FROM NEW.country THEN
      _change_description := _change_description || 'Country changed from \\"\\' || COALESCE(OLD.country, 'NULL') || '\\" to \\"\\' || COALESCE(NEW.country, 'NULL') || '\\"\\. ';
    END IF;
    IF OLD.last_reminder_sent_at IS DISTINCT FROM NEW.last_reminder_sent_at THEN
      _change_description := _change_description || 'Last Reminder Sent At changed. ';
    END IF;
    IF OLD.is_reminded IS DISTINCT FROM NEW.is_reminded THEN
      _change_description := _change_description || 'Is Reminded status changed from \\"\\' || OLD.is_reminded || '\\" to \\"\\' || NEW.is_reminded || '\\"\\. ';
    END IF;
    IF OLD.categories IS DISTINCT FROM NEW.categories THEN
      _change_description := _change_description || 'Categories changed. ';
    END IF;
    IF OLD.bank_details_verified IS DISTINCT FROM NEW.bank_details_verified THEN
      _change_description := _change_description || 'Bank Details Verified changed from \\"\\' || OLD.bank_details_verified || '\\" to \\"\\' || NEW.bank_details_verified || '\\"\\. ';
    END IF;

    INSERT INTO public.payment_request_audits (payment_request_id, changed_by_user_id, change_description)
    VALUES (NEW.id, _user_id, _change_description);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.payment_request_audits (payment_request_id, changed_by_user_id, change_description)
    VALUES (NEW.id, _user_id, 'New payment request created.');
  END IF;

  RETURN NEW;
END;
$function$