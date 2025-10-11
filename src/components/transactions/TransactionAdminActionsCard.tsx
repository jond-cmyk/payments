"use client";

import React from 'react';
import { Trash2 } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Transaction } from '@/types/supabase';

interface TransactionAdminActionsCardProps {
  transaction: Transaction;
  isAdmin: boolean;
  deleteTransactionMutation: UseMutationResult<boolean, Error, void, unknown>;
}

const TransactionAdminActionsCard: React.FC<TransactionAdminActionsCardProps> = ({
  transaction,
  isAdmin,
  deleteTransactionMutation,
}) => {
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex justify-end items-center mb-6">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            disabled={deleteTransactionMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Transaction
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the transaction and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTransactionMutation.mutate()} asChild>
              <Button variant="destructive">
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransactionAdminActionsCard;