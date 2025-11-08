"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DepositReturnAdvise } from '@/types/supabase';
import { format } from 'date-fns';
import { DollarSign, CheckCircle, ListChecks } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';
import { categoryOptions } from '@/lib/constants';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import CountryFlag from '@/components/CountryFlag';

// Define an enriched type for the query result
type EnrichedDepositReturnAdvise = Omit<DepositReturnAdvise, 'advised_by'> & {
  advised_by: { first_name: string | null; last_name: string | null; } | null;
};

const AdminDepositReturns = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAdvise, setSelectedAdvise] = React.useState<EnrichedDepositReturnAdvise | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  const { data: advisements, isLoading: isAdvisementsLoading, error: advisementsError } = useQuery<EnrichedDepositReturnAdvise[]>({
    queryKey: ['allDepositReturnAdvises'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data, error } = await supabase
        .from('deposit_return_advise')
        .select('*, advised_by:profiles(first_name, last_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EnrichedDepositReturnAdvise[];
    },
    enabled: isAdmin,
  });

  const markAsProcessedMutation = useMutation({
    mutationFn: async (adviseId: string) => {
      const { error } = await supabase
        .from('deposit_return_advise')
        .update({ status: 'processed' })
        .eq('id', adviseId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDepositReturnAdvises'] });
      showSuccess("Advisement marked as processed!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update status.");
    },
  });

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  if (advisementsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading advisements: {advisementsError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Deposit Return Advisements - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <ListChecks className="mr-2 h-6 w-6" /> Deposit Return Advisements
          </CardTitle>
          <CardDescription>
            Review and process deposit return advisements submitted by users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdvisementsLoading ? (
            <p>Loading advisements...</p>
          ) : advisements && advisements.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Advised At</TableHead>
                    <TableHead>Advised By</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Expected Refund</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advisements.map((advise) => (
                    <TableRow key={advise.id}>
                      <TableCell>{format(new Date(advise.created_at), 'PPP p')}</TableCell>
                      <TableCell>{advise.advised_by?.first_name || 'Unknown'} {advise.advised_by?.last_name || ''}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CountryFlag countryName={advise.country} />
                          <span>{advise.country}</span>
                        </div>
                      </TableCell>
                      <TableCell>{advise.sku}</TableCell>
                      <TableCell>{formatAmount(advise.expected_refund)} {advise.currency}</TableCell>
                      <TableCell>
                        <Badge variant={advise.status === 'processed' ? 'default' : 'secondary'}>
                          {advise.status.charAt(0).toUpperCase() + advise.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedAdvise(advise)}>
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No deposit return advisements found.</p>
          )}
        </CardContent>
      </Card>

      {selectedAdvise && (
        <Dialog open={!!selectedAdvise} onOpenChange={() => setSelectedAdvise(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Advisement Details for SKU: {selectedAdvise.sku}</DialogTitle>
              <DialogDescription>
                Advised by {selectedAdvise.advised_by?.first_name || 'Unknown'} on {format(new Date(selectedAdvise.created_at), 'PPP')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm font-medium text-blue-700">Total Deposit Held</p>
                <p className="text-xl font-bold text-blue-900">{formatAmount(selectedAdvise.total_deposit)} {selectedAdvise.currency}</p>
              </div>
              {selectedAdvise.deductions && selectedAdvise.deductions.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Deductions:</h4>
                  <div className="space-y-2">
                    {selectedAdvise.deductions.map((deduction: any, index: number) => (
                      <div key={index} className="flex justify-between p-2 bg-gray-50 rounded">
                        <span>{categoryOptions.find(c => c.value === deduction.category)?.label || deduction.category}</span>
                        <span className="font-medium">{formatAmount(deduction.amount)} {selectedAdvise.currency}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-700">Expected Refund</p>
                <p className="text-2xl font-bold text-green-900">{formatAmount(selectedAdvise.expected_refund)} {selectedAdvise.currency}</p>
              </div>
              {selectedAdvise.notes && (
                <div>
                  <h4 className="font-semibold">Notes:</h4>
                  <p className="text-sm text-muted-foreground p-2 bg-gray-50 rounded">{selectedAdvise.notes}</p>
                </div>
              )}
              {selectedAdvise.status !== 'processed' && (
                <Button
                  onClick={() => markAsProcessedMutation.mutate(selectedAdvise.id)}
                  disabled={markAsProcessedMutation.isPending}
                  className="w-full"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Processed
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AdminDepositReturns;