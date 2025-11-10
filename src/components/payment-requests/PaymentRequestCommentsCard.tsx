"use client";

import React from 'react';
import { format } from 'date-fns';
import { MessageSquareText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User } from '@supabase/supabase-js';
import { formatAuditDescription } from '@/utils/formatters'; // Import the new formatter

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PaymentRequestAudit, PaymentRequest } from '@/types/supabase'; // Import PaymentRequest

// Zod schema for adding a new comment
const commentFormSchema = z.object({
  new_comment: z.string().min(1, "Comment cannot be empty."),
});

interface PaymentRequestCommentsCardProps {
  paymentRequestId: string;
  comments: PaymentRequestAudit[] | undefined;
  auditUsers: Record<string, string> | undefined;
  isAdmin: boolean;
  request: PaymentRequest; // New prop
  currentUser: User | null;
  onAddComment: (commentText: string) => Promise<void>;
  isAddingComment: boolean;
}

const PaymentRequestCommentsCard: React.FC<PaymentRequestCommentsCardProps> = ({
  paymentRequestId,
  comments,
  auditUsers,
  isAdmin,
  request, // Destructure new prop
  currentUser,
  onAddComment,
  isAddingComment,
}) => {
  const form = useForm<z.infer<typeof commentFormSchema>>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: {
      new_comment: "",
    },
  });

  const handleCommentSubmit = async (values: z.infer<typeof commentFormSchema>) => {
    await onAddComment(values.new_comment);
    form.reset(); // Clear the input after submission
  };

  // Determine if the comment box should be visible for any authenticated user
  const showCommentBox = !!currentUser;

  return (
    <Card className="mb-8 shadow-sm"> {/* Added shadow-sm */}
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquareText className="mr-2 h-5 w-5" /> Comments
        </CardTitle>
        <CardDescription>Discussions and notes related to this payment request.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-6">
          {comments && comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className="border-l-2 border-gray-200 pl-4">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(comment.changed_at), 'PPP p')} by {auditUsers?.[comment.changed_by_user_id || ''] || comment.changed_by_user_id || 'System'}
                </p>
                <p className="text-base">{formatAuditDescription(comment.change_description)}</p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No comments yet.</p>
          )}
        </div>

        {showCommentBox && ( // Only show comment box based on new condition
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCommentSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="new_comment"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Add a new comment..."
                        className="min-h-[80px]"
                        disabled={isAddingComment}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isAddingComment} className="shadow-sm"> {/* Added shadow-sm */}
                {isAddingComment ? "Adding Comment..." : "Add Comment"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentRequestCommentsCard;