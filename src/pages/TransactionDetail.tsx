"use client";

import React, { useEffect, useState } from 'react'; // Import useState
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionAudit } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import TransactionDetailsDisplayCard from '@/components/transactions/TransactionDetailsDisplayCard';
import TransactionEditFormCard from '@/components/transactions/TransactionEditFormCard';
import TransactionAdminActionsCard from '@/components/transactions/TransactionAdminActionsCard';
import TransactionAuditTrailCard from '@/components/transactions/TransactionAuditTrailCard';
import { Button } from '@/components/ui/button'; // Import Button

// List of common categories - UPDATED with custom sort
const categoryOptions = [
  { value: '950_rent', label: '950 - Rent' },
  { value: '952_utilities_el', label: '952 - Utilities - El' },
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

// Zod schema for unified transaction details form
const transactionDetailSchema = z.object({
  category: z.string().optional(),
  merchant_name: z.string().optional(),
  notes: z.string().optional(),
  sku: z.string().optional(),
  comment: z.string().optional(),
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
});

const TransactionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false); // New state for editing mode

  const isAdmin = userProfile?.role === 'admin';

  // Fetch transaction details
  const { data: transaction, isLoading: isTransactionLoading, error: transactionError } = useQuery<Transaction | null>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Effect to set initial editing mode if transaction is pending_input and has no receipts
  useEffect(() => {
    if (transaction) {
      const canAmendInitial = (transaction.status === 'pending_input' && transaction.receipt_urls.length === 0);
      setIsEditing(canAmendInitial);
    }
  }, [transaction]); // Depend on transaction to ensure it runs after data is fetched

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<TransactionAudit[]>({
    queryKey: ['transactionAudits', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('transaction_audits')
        .select('*')
        .eq('transaction_id', id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch user names and emails for audit trail
  const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
    queryKey: ['auditUsers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      if (error) throw error;
      const usersMap: Record<string, string> = {};
      data.forEach(profile => {
        let displayString = profile.user_email || profile.id;
        if (profile.first_name || profile.last_name) {
          const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          if (profile.user_email) {
            displayString = `${name} (${profile.user_email})`;
          } else {
            displayString = name;
          }
        }
        usersMap[profile.id] = displayString;
      });
      return usersMap;
    },
    enabled: !!audits && audits.length > 0,
  });

  const form = useForm<z.infer<typeof transactionDetailSchema>>({
    resolver: zodResolver(transactionDetailSchema),
    defaultValues: {
      category: "",
      merchant_name: "",
      notes: "",
      sku: "",
      comment: "",
      new_receipt_files: undefined,
    },
  });

  // Effect to reset form when transaction data loads or editing mode changes
  useEffect(() => {
    if (transaction && isEditing) { // Only reset if in editing mode
      form.reset({
        category: transaction.category || "",
        merchant_name: transaction.merchant_name || "",
        notes: transaction.notes || "",
        sku: transaction.sku || "",
        comment: transaction.comment || "",
        new_receipt_files: undefined, // Always reset file input
      });
    }
  }, [transaction, isEditing, form]);

  const updateTransactionMutation = useMutation({
    mutationFn: async (payload: Partial<Transaction> & { new_receipt_files?: FileList }) => {
      if (!id || !user?.id) throw new Error("Transaction ID or user ID missing.");

      const { new_receipt_files, ...dbUpdateFields } = payload;

      let updatedReceiptUrls = transaction?.receipt_urls || [];

      if (new_receipt_files && new_receipt_files.length > 0) {
        const newUploadedUrls: string[] = [];
        for (let i = 0; i < new_receipt_files.length; i++) {
          const file = new_receipt_files[i];
          const fileExtension = file.name.split('.').pop();
          const fileName = `${user.id}/transactions/${crypto.randomUUID()}.${fileExtension}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('transaction_receipts')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Failed to upload receipt ${file.name}: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from('transaction_receipts')
            .getPublicUrl(fileName);

          if (!publicUrlData?.publicUrl) {
            throw new Error(`Failed to get public URL for receipt ${file.name}.`);
          }
          newUploadedUrls.push(publicUrlData.publicUrl);
        }
        updatedReceiptUrls = [...updatedReceiptUrls, ...newUploadedUrls];
      }

      let newStatus: Transaction['status'] = transaction?.status || 'pending_input';

      // Determine if all required fields are filled for 'completed' status
      const hasReceipts = updatedReceiptUrls.length > 0;
      const hasCategory = !!dbUpdateFields.category && dbUpdateFields.category.trim() !== '';
      const hasMerchantName = !!dbUpdateFields.merchant_name && dbUpdateFields.merchant_name.trim() !== '';
      const hasSku = !!dbUpdateFields.sku && dbUpdateFields.sku.trim() !== '';

      // If the transaction was pending_input and now meets all criteria, set status to 'completed'.
      if (
        transaction?.status === 'pending_input' &&
        hasReceipts &&
        hasCategory &&
        hasMerchantName &&
        hasSku
      ) {
        newStatus = 'completed';
      }
      // Otherwise, retain the current status. If it was already 'completed', it stays 'completed'.

      const { error } = await supabase
        .from('transactions')
        .update({
          ...dbUpdateFields,
          receipt_urls: updatedReceiptUrls,
          updated_at: new Date().toISOString(),
          status: newStatus, // Use the determined newStatus
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', id] });
      queryClient.invalidateQueries({ queryKey: ['myTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['completedReceipts'] }); // Invalidate completed receipts list
      queryClient.invalidateQueries({ queryKey: ['transactionAudits', id] });
      showSuccess("Transaction updated successfully!");
      setIsEditing(false); // Exit editing mode on success
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update transaction.");
      console.error("Update transaction error:", error);
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Transaction ID missing.");
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['completedReceipts'] }); // Invalidate completed receipts list
      showSuccess("Transaction deleted successfully!");
      navigate('/missing-receipts');
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete transaction.");
      console.error("Delete transaction error:", error);
    },
  });

  const onSubmit = async (values: z.infer<typeof transactionDetailSchema>) => {
    const toastId = showLoading("Updating transaction...");
    try {
      const updatedFields: Partial<Transaction> & { new_receipt_files?: FileList } = {
        category: values.category,
        merchant_name: values.merchant_name,
        notes: values.notes,
        sku: values.sku,
        reason_for_payment: values.category, // Assuming category can also be reason for payment
        comment: values.comment,
      };

      if (values.new_receipt_files && values.new_receipt_files.length > 0) {
        updatedFields.new_receipt_files = values.new_receipt_files;
      }

      await updateTransactionMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during update.");
    }
  };

  if (isSessionLoading || isTransactionLoading || isAuditsLoading || isAuditUsersLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading transaction details...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading transaction: {transactionError.message}</div>;
  }

  if (!transaction) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Transaction not found.</div>;
  }

  // The `canAmend` logic now allows any authenticated user to amend pending_input transactions without receipts
  const canAmend = (transaction.status === 'pending_input' && transaction.receipt_urls.length === 0);

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Transaction Details #{transaction.id.substring(0, 8)}</h1>
        {canAmend && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
            Amend Transaction
          </Button>
        )}
        {isEditing && (
          <div className="space-x-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); form.reset(); }}>
              Cancel
            </Button>
            <Button type="submit" form="transaction-edit-form" className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <TransactionAdminActionsCard
        transaction={transaction}
        isAdmin={isAdmin}
        deleteTransactionMutation={deleteTransactionMutation}
      />

      <TransactionDetailsDisplayCard transaction={transaction} />

      <TransactionEditFormCard
        transaction={transaction}
        isEditingMode={isEditing} // Pass the new state
        form={form}
        onSubmit={onSubmit}
        updateTransactionMutation={updateTransactionMutation}
        categoryOptions={categoryOptions}
      />

      <TransactionAuditTrailCard
        audits={audits}
        auditUsers={auditUsers}
      />
    </div>
  );
};

export default TransactionDetail;