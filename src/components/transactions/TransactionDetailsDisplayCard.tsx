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
  return (
    <Card className="max-w-2xl mx-auto mb-8 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Transaction Details</CardTitle>
        <CardDescription className="text-center">
          Transaction ID: {transaction.id.substring(0, 8)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm"> {/* Increased gap for better spacing */}
          <div className="space-y-1"> {/* Added space-y-1 for vertical spacing */}
            <p className="font-bold">Transaction Date:</p>
            <p>{format(new Date(transaction.transaction_date), 'PPP')}</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold">Description:</p>
            <p>{transaction.description}</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold">Amount:</p>
            <p>{transaction.currency} {transaction.amount.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold">Status:</p>
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
          <div className="space-y-1">
            <p className="font-bold">Category:</p>
            <p>{transaction.category || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold">Merchant Name:</p>
            <p>{transaction.merchant_name || 'N/A'}</p>
          </div>
          {transaction.original_transaction_id && (
            <div className="space-y-1">
              <p className="font-bold">Original Transaction ID:</p>
              <p>{transaction.original_transaction_id}</p>
            </div>
          )}
          {transaction.type && (
            <div className="space-y-1">
              <p className="font-bold">Type:</p>
              <p>{transaction.type}</p>
            </div>
          )}
          {transaction.entry && (
            <div className="space-y-1">
              <p className="font-bold">Entry:</p>
              <p>{transaction.entry}</p>
            </div>
          )}
          {transaction.bank && (
            <div className="space-y-1">
              <p className="font-bold">Bank:</p>
              <p>{transaction.bank}</p>
            </div>
          )}
          {transaction.bank_account && ( // NEW: Display Bank Account
            <div className="space-y-1">
              <p className="font-bold">Bank Account:</p>
              <p>{transaction.bank_account}</p>
            </div>
          )}
          {transaction.contra_account && (
            <div className="space-y-1">
              <p className="font-bold">Contra Account:</p>
              <p>{transaction.contra_account}</p>
            </div>
          )}
          {transaction.exchange_rate && (
            <div className="space-y-1">
              <p className="font-bold">Exchange Rate:</p>
              <p>{transaction.exchange_rate}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="font-bold">SKU:</p>
            <p>{transaction.not_sku_related ? 'N/A (Not SKU Related)' : (transaction.sku || 'N/A')}</p>
          </div>
          {transaction.receipt_urls && transaction.receipt_urls.length > 0 && (
            <div className="space-y-1 md:col-span-2"> {/* Span two columns for receipts if needed */}
              <p className="font-bold">Receipt PDF(s):</p>
              <div className="space-y-1">
                {transaction.receipt_urls.map((url, index) => (
                  <Button asChild variant="link" className="p-0 h-auto block" key={index}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-1 h-4 w-4" /> Receipt {index + 1}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TransactionDetailsDisplayCard;