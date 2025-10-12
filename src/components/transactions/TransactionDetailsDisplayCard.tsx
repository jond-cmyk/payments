"use client";

import React from 'react';
import { format } from 'date-fns';
import { Download } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types/supabase';

interface TransactionDetailsDisplayCardProps {
  transaction: Transaction;
}

const TransactionDetailsDisplayCard: React.FC<TransactionDetailsDisplayCardProps> = ({ transaction }) => {
  console.log("[TransactionDetailsDisplayCard] Received transaction prop:", transaction);
  console.log("[TransactionDetailsDisplayCard] Category from prop:", transaction.category);
  console.log("[TransactionDetailsDisplayCard] Merchant Name from prop:", transaction.merchant_name);

  return (
    <Card className="max-w-2xl mx-auto mb-8 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Transaction Details</CardTitle>
        <CardDescription className="text-center">
          Transaction ID: {transaction.id.substring(0, 8)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="font-medium">Transaction Date:</p>
            <p>{format(new Date(transaction.transaction_date), 'PPP')}</p>
          </div>
          <div>
            <p className="font-medium">Description:</p>
            <p>{transaction.description}</p>
          </div>
          <div>
            <p className="font-medium">Amount:</p>
            <p>{transaction.currency} {transaction.amount.toFixed(2)}</p>
          </div>
          <div>
            <p className="font-medium">Status:</p>
            <p className={`font-semibold ${
              transaction.status === 'pending_input' ? 'text-yellow-600' :
              transaction.status === 'completed' ? 'text-blue-600' :
              transaction.status === 'approved' ? 'text-green-600' :
              transaction.status === 'declined' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              {transaction.status.replace(/_/g, ' ').charAt(0).toUpperCase() + transaction.status.replace(/_/g, ' ').slice(1)}
            </p>
          </div>
          {/* Always render Category and Merchant Name, show 'N/A' if empty */}
          <div>
            <p className="font-medium">Category:</p>
            <p>{transaction.category || 'N/A'}</p>
          </div>
          <div>
            <p className="font-medium">Merchant Name:</p>
            <p>{transaction.merchant_name || 'N/A'}</p>
          </div>
          {transaction.original_transaction_id && (
            <div>
              <p className="font-medium">Original Transaction ID:</p>
              <p>{transaction.original_transaction_id}</p>
            </div>
          )}
          {transaction.type && (
            <div>
              <p className="font-medium">Type:</p>
              <p>{transaction.type}</p>
            </div>
          )}
          {transaction.entry && (
            <div>
              <p className="font-medium">Entry:</p>
              <p>{transaction.entry}</p>
            </div>
          )}
          {transaction.bank && (
            <div>
              <p className="font-medium">Bank:</p>
              <p>{transaction.bank}</p>
            </div>
          )}
          {transaction.contra_account && (
            <div>
              <p className="font-medium">Contra Account:</p>
              <p>{transaction.contra_account}</p>
            </div>
          )}
          {transaction.exchange_rate && (
            <div>
              <p className="font-medium">Exchange Rate:</p>
              <p>{transaction.exchange_rate}</p>
            </div>
          )}
          <div>
            <p className="font-medium">SKU:</p>
            <p>{transaction.not_sku_related ? 'N/A (Not SKU Related)' : (transaction.sku || 'N/A')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransactionDetailsDisplayCard;