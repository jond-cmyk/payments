"use client";

import React from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useLocation } from 'react-router-dom'; // Import useLocation
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PaymentRequest, Profile } from '@/types/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { PlusCircle } from 'lucide-react';

const Dashboard = () => {
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();
  const location = useLocation(); // Get current location
  const [userRole, setUserRole] = React.useState<Profile['role'] | null>(null);

  console.log("Dashboard: Component is rendering! Current path:", location.pathname); // Log when Dashboard renders

  // Fetch user role
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) {
        console.error("Error fetching user profile:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  React.useEffect(() => {
    if (profileData) {
      setUserRole(profileData.role);
      console.log("Dashboard: User role fetched:", profileData.role);
    }
  }, [profileData]);

  // Fetch payment requests based on role
  const { data: paymentRequests, isLoading: isRequestsLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequests', user?.id, userRole],
    queryFn: async () => {
      if (!user?.id || !userRole) return [];

      let query = supabase.from('payment_requests').select('*');

      if (userRole === 'requester') {
        query = query.eq('requester_id', user.id);
      }
      // Admins see all requests, no additional filter needed

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!userRole,
  });

  if (isLoading || isProfileLoading || isRequestsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (profileError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading user profile: {profileError.message}</div>;
  }

  if (requestsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading requests: {requestsError.message}</div>;
  }

  const getStatusBadge = (status: PaymentRequest['status']) => {
    let displayText = status.charAt(0).toUpperCase() + status.slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'setup_awaiting_approval':
        displayText = 'Payment Setup';
        className = 'bg-blue-500 text-blue-50';
        break;
      case 'approved':
        displayText = 'Payment Complete';
        className = 'bg-green-500 text-green-50';
        break;
      case 'declined':
        className = 'bg-red-500 text-red-50';
        break;
      case 'queried':
        className = 'bg-orange-500 text-orange-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={className}>{displayText}</Badge>;
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {userRole === 'admin' ? 'All Payment Requests' : 'My Payment Requests'}
        </h1>
        {/* Temporary display of user role for debugging */}
        <p className="text-sm text-gray-500">Current Role: {userRole || 'Not available'}</p>

        {userRole === 'requester' && (
          <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Request
          </Button>
        )}
      </div>

      {paymentRequests && paymentRequests.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>SKU Number</TableHead>
                <TableHead>Payment Required</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{request.supplier_name}</TableCell>
                  <TableCell>{request.sku_number}</TableCell>
                  <TableCell>{format(new Date(request.date_payment_required), 'PPP')}</TableCell>
                  <TableCell>
                    {getStatusBadge(request.status)}
                  </TableCell>
                  <TableCell>{format(new Date(request.created_at), 'PPP')}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/request/${request.id}`}>View Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-center text-muted-foreground mt-8">
          {userRole === 'requester' ? 'You have not created any payment requests yet.' : 'No payment requests found.'}
        </p>
      )}
    </div>
  );
};

export default Dashboard;