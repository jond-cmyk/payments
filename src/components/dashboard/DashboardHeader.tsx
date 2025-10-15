"use client";

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlusCircle, MessageSquarePlus } from 'lucide-react'; // Import MessageSquarePlus

import { Button } from '@/components/ui/button';
import CountrySelector from '@/components/CountrySelector';
import CountryFlag from '@/components/CountryFlag';
import { useSession } from '@/integrations/supabase/SessionContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'; // Import Dialog components
import FeedbackForm from '@/components/feedback/FeedbackForm'; // Import FeedbackForm

interface DashboardHeaderProps {
  debouncedSearchTerm: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ debouncedSearchTerm }) => {
  const { userProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = React.useState(false); // State for feedback dialog

  const userRole = userProfile?.role || null;
  const isAllRequestsPage = location.pathname === '/admin/requests';

  const getTitle = () => {
    if (debouncedSearchTerm) {
      return `Search Results for "${debouncedSearchTerm}"`;
    }
    if (isAllRequestsPage) {
      return 'All Payment Requests';
    }
    return 'Summary of Payment Requests';
  };

  const handleFeedbackSubmitted = () => {
    setIsFeedbackDialogOpen(false); // Close dialog on submission
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <h1 className="text-3xl font-bold">{getTitle()}</h1>
      <div className="flex flex-col items-end space-y-4">
        {/* Country Display / Selector */}
        {!isAllRequestsPage && (
          <>
            {userRole === 'requester' && userProfile?.country && (
              <div className="flex items-center gap-2 text-lg font-semibold bg-dyad-blue text-dyad-blue-foreground rounded-md p-2 shadow-md w-full justify-center">
                <CountryFlag countryName={userProfile.country} />
                <span>{userProfile.country}</span>
              </div>
            )}

            {userRole === 'admin' && (
              <CountrySelector className="bg-dyad-blue text-dyad-blue-foreground rounded-md shadow-md w-full" triggerClassName="w-full" />
            )}
          </>
        )}
        <div className="flex gap-2 w-full"> {/* Group buttons */}
          {(userRole === 'requester' || userRole === 'admin') && (
            <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground flex-1" size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Request
            </Button>
          )}
          <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1" size="lg">
                <MessageSquarePlus className="mr-2 h-5 w-5" />
                Provide Anonymous Feedback
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Provide Anonymous Feedback</DialogTitle>
              </DialogHeader>
              <FeedbackForm onFeedbackSubmitted={handleFeedbackSubmitted} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;