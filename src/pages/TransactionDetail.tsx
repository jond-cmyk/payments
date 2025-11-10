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
import * as z from 'zod'; // Keep z for other Zod usage if any
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry
import { categoryOptions } from '@/lib/constants'; // Import categoryOptions from constants

import TransactionDetailsDisplayCard from '@/components/transactions/TransactionDetailsDisplayCard';
import TransactionEditFormCard from '@/components/transactions/TransactionEditFormCard';
import TransactionAdminActionsCard from '@/components/transactions/TransactionAdminActionsCard';
import TransactionAuditTrailCard from '@/components/transactions/TransactionAuditTrailCard';
import { Button } from '@/components/ui/button'; // Import Button
import { transactionDetailSchema, TransactionDetailSchema } from '@/schemas/transactionSchema'; // Import centralized schema
import { Card } from '@/components/ui/card'; // Import Card

const TransactionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry(); // Get currentCountry from context
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false); // New state for editing mode

  const isAdmin = userProfile?.role === 'admin';

  // Fetch transaction details
  const { data: transaction, isLoading: isTransactionLoading, error: transactionError } = useQuery<Transaction | null>({
    queryKey: ['transaction', id, currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      if (!id) return null;
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('id', id);
      
      // Apply country filter based on user role and selected country
      // For requesters, RLS will handle the country filter.
      // For admins, apply client-side filter if a specific country is selected.
      if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Effect to set initial editing mode if transaction is pending_input
  useEffect(() => {
    if (transaction) {
      const canAmendInitial = transaction.status === 'pending_input';
      setIsEditing(canAmendInitial);
    }
  }, [transaction]); // Depend on transaction to ensure it runs after data is fetched

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<TransactionAudit[]>({
    queryKey: ['transactionAudits', id, currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('transaction_audits')
        .select('*')
        .eq('transaction_id', id)
        // No country filter on audit table itself, as it references transactions
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch user names and emails for audit trail
  const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
    queryKey: ['auditUsers', currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      
      // Filter profiles by selected country if not 'all'
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query;
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
    enabled: !!session, // Changed enabled condition
  });

  const form = useForm<TransactionDetailSchema>({
    resolver: zodResolver(transactionDetailSchema),
    defaultValues: {
      category: "",
      merchant_name: "",
      notes: "",
      sku: "CH", // Default for PrefixedInput
      not_sku_related: false, // Default to false
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
        sku: transaction.sku || "CH", // Ensure default for PrefixedInput
        not_sku_related: transaction.not_sku_related, // Set the checkbox state
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
      const hasSku = dbUpdateFields.not_sku_related || (!!dbUpdateFields.sku && dbUpdateFields.sku.trim() !== ''); // SKU is optional if not_sku_related

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

      let query = supabase
        .from('transactions')
        .update({
          ...dbUpdateFields,
          receipt_urls: updatedReceiptUrls,
          updated_at: new Date().toISOString(),
          status: newStatus, // Use the determined newStatus
        })
        .eq('id', id);
      
      // Apply country filter for update
      // For requesters, RLS will handle the country filter.
      // For admins, apply client-side filter if a specific country is selected.
      if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { error } = await query;
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', id] });
      queryClient.invalidateQueries({ queryKey: ['myTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['completedReceipts'] }); // Invalidate completed receipts list
      // Add a small delay before refetching audits to allow the database trigger to complete
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['transactionAudits', id] });
      }, 500); // 500ms delay
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
      let query = supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      // Apply country filter for delete
      // For requesters, RLS will handle the country filter.
      // For admins, apply client-side filter if a specific country is selected.
      if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { error } = await query;
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

  const onSubmit = async (values: TransactionDetailSchema) => {
    const toastId = showLoading("Updating transaction...");
    try {
      const updatedFields: Partial<Transaction> & { new_receipt_files?: FileList } = {
        category: values.category,
        merchant_name: values.merchant_name,
        notes: values.notes,
        sku: values.not_sku_related ? null : values.sku, // Set to null if not SKU related
        not_sku_related: values.not_sku_related, // Save the checkbox state
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

  // Any user can amend a transaction as long as it's pending input.
  const canAmend = transaction.status === 'pending_input';

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Transaction Details #{transaction.id.substring(0, 8)}</h1>
        {canAmend && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"> {/* Added shadow-sm */}
            Amend Transaction
          </Button>
        )}
      </div>

      <TransactionAdminActionsCard
        transaction={transaction}
        isAdmin={isAdmin}
        deleteTransactionMutation={deleteTransactionMutation}
      />

      <TransactionDetailsDisplayCard transaction={transaction} />

      {isEditing && transaction.status !== 'completed' && ( // Conditional rendering for edit form
        <TransactionEditFormCard
          transaction={transaction}
          isEditingMode={isEditing} // Pass the new state
          form={form}
          onSubmit={onSubmit}
          updateTransactionMutation={updateTransactionMutation}
        />
      )}

      {isEditing && transaction.status !== 'completed' && ( // Conditional rendering for save/cancel buttons
        <div className="flex justify-end space-x-2 mb-8"> {/* Moved this block here */}
          <Button variant="outline" onClick={() => { setIsEditing(false); form.reset(); }} className="shadow-sm">
            Cancel
          </Button>
          <Button type="submit" form="transaction-edit-form" className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm">
            Save Changes
          </Button>
        </div>
      )}

      <TransactionAuditTrailCard
        audits={audits}
        auditUsers={auditUsers}
      />
    </div>
  );
};

export default TransactionDetail;