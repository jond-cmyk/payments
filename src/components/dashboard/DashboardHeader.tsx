"use client";

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlusCircle, MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import CountrySelector from '@/components/CountrySelector';
import CountryFlag from '@/components/CountryFlag';
import { useSession } from '@/integrations/supabase/SessionContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import FeedbackForm from '@/components/feedback/FeedbackForm';
import { cn } from '@/lib/utils'; // Ensure cn is imported

interface DashboardHeaderProps {
  debouncedSearchTerm: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ debouncedSearchTerm }) => {
  const { userProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = React.useState(false);

  const userRole = userProfile?.role || null;
  const isAllRequestsPage = location.pathname === '/admin/requests';
  const isDashboardPage = location.pathname === '/dashboard';

  const getTitle = () => {
    if (debouncedSearchTerm) {
      return `Search Results for "${debouncedSearchTerm}"`;
    }
    if (isAllRequestsPage) {
      return 'All Payment Requests';
    }
    // Remove "Summary of Payment Requests" title from the main dashboard view
    if (isDashboardPage) {
      return '';
    }
    return '';
  };

  const mainTitle = getTitle();

  const handleFeedbackSubmitted = () => {
    setIsFeedbackDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Title (only if present, e.g., Search Results or All Requests) */}
      {mainTitle && <h1 className="text-3xl font-bold">{mainTitle}</h1>}
      
      {/* Row 2: Country Selector (Left) and Action Buttons (Right) */}
      <div className={cn(
        "flex w-full justify-between items-center gap-4",
        // If there is no main title, ensure this row has top margin for spacing
        !mainTitle && "mt-2" 
      )}>
        {/* Left Side: Country Selector / Display */}
        <div className="flex-shrink-0">
          {userRole === 'requester' && userProfile?.country && (
            <div className="flex items-center gap-2 text-lg font-semibold bg-dyad-blue text-dyad-blue-foreground rounded-md p-2 shadow-md">
              <CountryFlag countryName={userProfile.country} />
              <span>{userProfile.country}</span>
            </div>
          )}

          {userRole === 'admin' && (
            <CountrySelector className="w-full" triggerClassName="w-full" />
          )}
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {(userRole === 'requester' || userRole === 'admin') && (
            <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Request
            </Button>
          )}
          <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="lg">
                <MessageSquarePlus className="mr-2 h-5 w-5" />
                Feedback
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Provide Anonymous Feedback</DialogTitle>
                <DialogDescription>
                  Share your thoughts, suggestions, or report issues anonymously.
                </DialogDescription>
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