"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PaymentRequest, Transaction } from '@/types/supabase';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

interface PaymentRequestTableProps {
  paymentRequests: (PaymentRequest & { requester_profile: { first_name: string | null } | null })[] | undefined;
  userRole: string | null;
  handleSort: (column: keyof PaymentRequest) => void;
  renderSortIcon: (column: keyof PaymentRequest) => React.ReactNode;
  getStatusBadge: (status: PaymentRequest['status'] | Transaction['status']) => React.ReactNode;
  handleToggleUrgent: (requestId: string, currentUrgentStatus: boolean) => Promise<void>;
  toggleUrgentMutation: UseMutationResult<boolean, Error, { id: string; is_urgent: boolean; }, unknown>;
}

const PaymentRequestTable: React.FC<PaymentRequestTableProps> = ({
  paymentRequests,
  userRole,
  handleSort,
  renderSortIcon,
  getStatusBadge,
  handleToggleUrgent,
  toggleUrgentMutation,
}) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('supplier_name')}>
              <div className="flex items-center">
                Supplier Name {renderSortIcon('supplier_name')}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku_number')}>
              <div className="flex items-center">
                SKU Number {renderSortIcon('sku_number')}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('date_payment_required')}>
              <div className="flex items-center">
                Payment Required {renderSortIcon('date_payment_required')}
              </div>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('created_at')}>
              <div className="flex items-center">
                Created At {renderSortIcon('created_at')}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_setup_date')}>
              <div className="flex items-center">
                Payment Setup Date {renderSortIcon('payment_setup_date')}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_approved_date')}>
              <div className="flex items-center">
                Payment Approved Date {renderSortIcon('payment_approved_date')}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('requester_id')}>
              <div className="flex items-center">
                Requester {renderSortIcon('requester_id')}
              </div>
            </TableHead>
            {userRole === 'admin' && <TableHead className="text-center">Urgent</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paymentRequests?.map((request) => (
            <TableRow
              key={request.id}
              className={cn(
                "transition-all duration-200 ease-in-out",
                request.is_urgent ? "bg-red-600 text-white hover:bg-red-700" : "hover:bg-gradient-to-r hover:from-dyad-blue-light hover:to-dyad-blue/10"
              )}
            >
              <TableCell className="font-medium">{request.supplier_name}</TableCell>
              <TableCell>{request.sku_number}</TableCell>
              <TableCell>{format(new Date(request.date_payment_required), 'PPP')}</TableCell>
              <TableCell>
                {getStatusBadge(request.status)}
              </TableCell>
              <TableCell>{format(new Date(request.created_at), 'PPP')}</TableCell>
              <TableCell>
                {request.payment_setup_date ? format(new Date(request.payment_setup_date), 'PPP') : 'N/A'}
              </TableCell>
              <TableCell>
                {request.payment_approved_date ? format(new Date(request.payment_approved_date), 'PPP') : 'N/A'}
              </TableCell>
              <TableCell>{request.requester_profile?.first_name || 'N/A'}</TableCell>
              {userRole === 'admin' && (
                <TableCell className="text-center">
                  <Switch
                    checked={request.is_urgent}
                    onCheckedChange={() => handleToggleUrgent(request.id, request.is_urgent)}
                    disabled={toggleUrgentMutation.isPending}
                    aria-label={`Toggle urgent status for ${request.supplier_name}`}
                  />
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={cn(
                    request.is_urgent && "text-gray-900 hover:text-white hover:bg-red-800 border-gray-900"
                  )}
                >
                  <Link to={`/request/${request.id}`}>View Details</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default PaymentRequestTable;