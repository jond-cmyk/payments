"use client";

import React from 'react';
import { format } from 'date-fns';
import { History } from 'lucide-react';
import { formatAuditDescription } from '@/utils/formatters'; // Import the new formatter

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PaymentRequestAudit } from '@/types/supabase';

interface PaymentRequestAuditTrailCardProps {
  audits: PaymentRequestAudit[] | undefined;
  auditUsers: Record<string, string> | undefined;
}

const PaymentRequestAuditTrailCard: React.FC<PaymentRequestAuditTrailCardProps> = ({
  audits,
  auditUsers,
}) => {
  return (
    <Card className="shadow-sm"> {/* Added shadow-sm */}
      <CardHeader>
        <CardTitle className="flex items-center">
          <History className="mr-2 h-5 w-5" /> Audit Trail
        </CardTitle>
        <CardDescription>History of changes for this payment request.</CardDescription>
      </CardHeader>
      <CardContent>
        {audits && audits.length > 0 ? (
          <div className="space-y-4">
            {audits.map((audit) => (
              <div key={audit.id} className="border-l-2 border-gray-200 pl-4">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(audit.changed_at), 'PPP p')} by <strong className="text-foreground">{auditUsers?.[audit.changed_by_user_id || ''] || audit.changed_by_user_id || 'System'}</strong>
                </p>
                <p className="text-base">{formatAuditDescription(audit.change_description)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No audit history available.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentRequestAuditTrailCard;