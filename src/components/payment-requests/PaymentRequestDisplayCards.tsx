"use client";

import React from 'react';
import { format } from 'date-fns';
import { Download, Info, Banknote, CalendarDays, UserCircle2, AlertTriangle, DollarSign, Home } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PaymentRequest } from '@/types/supabase';
import { cn } from '@/lib/utils';
import { categoryOptions } from '@/lib/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';
import PropertyAddressField from '@/components/PropertyAddressField';

interface PaymentRequestDisplayCardsProps {
  request: PaymentRequest;
  auditUsers: Record<string, string> | undefined;
}

const PaymentRequestDisplayCards: React.FC<PaymentRequestDisplayCardsProps> = ({
  request,
  auditUsers,
}) => {
  const getStatusDisplay = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'setup_awaiting_approval':
        return 'Payment Setup';
      case 'approved':
        return 'Payment Complete';
      case 'declined':
        return 'Declined';
      case 'queried':
        return 'Queried';
      default:
        return status;
    }
  };

  const isUK = request.country === 'United Kingdom';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Section 1: Overview & Status */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Info className="mr-2 h-5 w-5" /> Overview
            {request.is_urgent && (
              <Badge variant="destructive" className={cn("ml-3 bg-red-600 text-white flex items-center", "border border-white")}>
                <AlertTriangle className="h-4 w-4 mr-1" /> Urgent
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Status: <span className={`font-semibold ${
              request.status === 'pending' ? 'text-yellow-600' :
              request.status === 'setup_awaiting_approval' ? 'text-blue-600' :
              request.status === 'approved' ? 'text-green-600' :
              request.status === 'declined' ? 'text-red-600' :
              request.status === 'queried' ? 'text-gray-600' :
              'text-gray-600'
            }`}>
              {getStatusDisplay(request.status)}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-bold">Requested By:</p>
              <p className="font-semibold text-foreground">{auditUsers?.[request.requester_id] || request.requester_id}</p>
            </div>
            <div>
              <p className="font-bold">Country:</p>
              <p>{request.country}</p>
            </div>
            <div className="md:col-span-2">
              <p className="font-bold">Supplier Name:</p>
              <p>{request.supplier_name}</p>
            </div>
            <div>
              <p className="font-bold">Supplier Address:</p>
              <p>{request.supplier_address}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NEW: Property Details Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Home className="mr-2 h-5 w-5" /> Property Details
          </CardTitle>
          <CardDescription>SKU, Lease, and Property Address information.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-bold">SKU Number:</p>
              <p>{request.not_sku_related ? 'N/A (Not SKU Related)' : request.sku_number}</p>
            </div>
            <div>
              <p className="font-bold">Lease ID:</p>
              <p>{request.lease_id || 'N/A'}</p>
            </div>
            <PropertyAddressField skuValue={request.sku_number} country={request.country} />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Financial & Dates */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="mr-2 h-5 w-5" /> Financial Details
          </CardTitle>
          <CardDescription>Payment amounts and required dates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="md:col-span-2">
              <p className="font-bold flex items-center mb-2">
                Categories & Amounts:
              </p>
              {request.categories && request.categories.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount ({request.currency})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {request.categories.map((cat, index) => (
                        <TableRow key={index}>
                          <TableCell>{categoryOptions.find(c => c.value === cat.category)?.label || cat.category}</TableCell>
                          <TableCell className="text-right">{formatAmount(cat.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total Amount:</TableCell>
                        <TableCell className="text-right">{formatAmount(request.total_amount)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="ml-2">No categories defined.</p>
              )}
            </div>
            <div>
              <p className="font-bold">Currency:</p>
              <p>{request.currency}</p>
            </div>
            <div>
              <p className="font-bold">Date Payment Required:</p>
              <p>{format(new Date(request.date_payment_required), 'PPP')}</p>
            </div>
            <div className={cn(
              "space-y-1",
              request.receipt_required && "bg-dyad-blue text-white p-4 rounded-md"
            )}>
              <p className="font-bold">Payment Receipt Required:</p>
              <p>{request.receipt_required ? 'Yes' : 'No'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="font-bold">Notes:</p>
              <p>{request.reason_for_payment || 'N/A'}</p> {/* CHANGED: Display reason_for_payment as Notes */}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Bank Details */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Banknote className="mr-2 h-5 w-5" /> Bank Details
          </CardTitle>
          <CardDescription>Account information for the supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {isUK ? (
              <>
                <div>
                  <p className="font-bold">Account Name:</p>
                  <p>{request.bank_account_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-bold">Sort Code:</p>
                  <p>{request.sort_code || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-bold">Account Number:</p>
                  <p>{request.account_number ? request.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
                </div>
              </>
            ) : (
              <>
                {request.bank_account_name && (
                  <div>
                    <p className="font-bold">Bank Account Name:</p>
                    <p>{request.bank_account_name || 'N/A'}</p>
                  </div>
                )}
                <div>
                  <p className="font-bold">IBAN Number:</p>
                  <p>{request.iban_number || 'N/A'}</p>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <p className="font-bold">Bank Details Verified:</p>
              <p>{request.bank_details_verified ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Documents & Admin Info */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCircle2 className="mr-2 h-5 w-5" /> Documents & Admin Info
          </CardTitle>
          <CardDescription>Invoices, receipts, and processing dates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="md:col-span-2">
              <p className="font-bold">Invoice PDF(s):</p>
              {request.invoice_pdf_urls && request.invoice_pdf_urls.length > 0 ? (
                <div className="space-y-1">
                  {request.invoice_pdf_urls.map((url, index) => (
                    <Button asChild variant="link" className="p-0 h-auto block" key={index}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-4 w-4" /> Invoice {index + 1}
                      </a>
                    </Button>
                  ))}
                </div>
              ) : (
                <p>No invoices uploaded.</p>
              )}
            </div>
            {request.receipt_pdf_url && (
              <div>
                <p className="font-bold">Receipt PDF:</p>
                <Button asChild variant="link" className="p-0 h-auto">
                  <a href={request.receipt_pdf_url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-4 w-4" /> Download Receipt
                  </a>
                </Button>
              </div>
            )}
            <div>
              <p className="font-bold">Created At:</p>
              <p>{format(new Date(request.created_at), 'PPP p')}</p>
            </div>
            <div>
              <p className="font-bold">Last Updated:</p>
              <p>{format(new Date(request.updated_at), 'PPP p')}</p>
            </div>
            {request.payment_setup_date && (
              <div>
                <p className="font-bold">Payment Setup Date:</p>
                <p>{format(new Date(request.payment_setup_date), 'PPP p')}</p>
              </div>
            )}
            {request.payment_approved_date && (
              <div>
                <p className="font-bold">Payment Approved Date:</p>
                <p>{format(new Date(request.payment_approved_date), 'PPP p')}</p>
              </div>
            )}
            {request.admin_action_by && (
              <div>
                <p className="font-bold">Admin Action By:</p>
                <p>{auditUsers?.[request.admin_action_by] || request.admin_action_by}</p>
              </div>
            )}
            {request.admin_action_reason && (
              <div className="md:col-span-2">
                <p className="font-bold">Admin Reason:</p>
                <p>{request.admin_action_reason}</p>
              </div>
            )}
            {request.last_reminder_sent_at && (
              <div>
                <p className="font-bold">Last Reminder Sent:</p>
                <p>{format(new Date(request.last_reminder_sent_at), 'PPP p')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentRequestDisplayCards;