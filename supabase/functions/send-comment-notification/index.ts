// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { Resend } from 'https://esm.sh/resend@1.1.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[send-comment-notification] Edge Function invoked.');

  try {
    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const payload = await req.json();
    const { record: newCommentAudit } = payload;

    console.log('[send-comment-notification] Received payload:', JSON.stringify(payload));

    // Ensure it's actually a comment and not another audit type
    if (!newCommentAudit || !newCommentAudit.change_description?.startsWith('Comment: ')) {
      console.log('[send-comment-notification] Not a comment audit, skipping notification.');
      return new Response(JSON.stringify({ message: 'Not a comment audit, skipping.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const commentText = newCommentAudit.change_description.replace('Comment: ', '');
    const commenterId = newCommentAudit.changed_by_user_id;

    let entityId: string;
    let entityType: 'payment_request' | 'standing_order' | 'direct_debit';
    let entityTable: 'payment_requests' | 'standing_orders' | 'direct_debits';
    let entityLinkPrefix: '/request/' | '/standing-order/' | '/direct-debit/';
    let entityNameField: 'supplier_name' | 'payee';
    let entitySkuField: 'sku_number' | 'sku';
    let requesterId: string;
    let country: string;
    let entityName: string;
    let entitySku: string | null;

    if (newCommentAudit.payment_request_id) {
        entityId = newCommentAudit.payment_request_id;
        entityType = 'payment_request';
        entityTable = 'payment_requests';
        entityLinkPrefix = '/request/';
        entityNameField = 'supplier_name';
        entitySkuField = 'sku_number';
    } else if (newCommentAudit.standing_order_id) {
        entityId = newCommentAudit.standing_order_id;
        entityType = 'standing_order';
        entityTable = 'standing_orders';
        entityLinkPrefix = '/standing-order/';
        entityNameField = 'payee';
        entitySkuField = 'sku';
    } else if (newCommentAudit.direct_debit_id) {
        entityId = newCommentAudit.direct_debit_id;
        entityType = 'direct_debit';
        entityTable = 'direct_debits';
        entityLinkPrefix = '/direct-debit/';
        entityNameField = 'payee';
        entitySkuField = 'sku';
    } else {
        const errorMessage = 'Missing entity ID (payment_request_id, standing_order_id, or direct_debit_id) in payload.';
        console.error('[send-comment-notification] Edge Function Error (400):', errorMessage);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (!entityId || !commenterId || !commentText) {
      const errorMessage = 'Missing required data (entityId, commenterId, or commentText) in payload.';
      console.error('[send-comment-notification] Edge Function Error (400):', errorMessage, 'Payload:', JSON.stringify(payload));
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch entity details (request, standing order, or direct debit)
    const { data: entity, error: entityError } = await supabaseClient
      .from(entityTable)
      .select(`${entityNameField}, ${entitySkuField}, requester_id, country, id`)
      .eq('id', entityId)
      .single();

    if (entityError || !entity) {
      console.error(`Error fetching ${entityType} details:`, entityError?.message || 'Entity not found');
      return new Response(JSON.stringify({ error: `${entityType} not found or error fetching: ${entityError?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Assign fetched details
    requesterId = entity.requester_id;
    country = entity.country;
    entityName = entity[entityNameField];
    entitySku = entity[entitySkuField];


    // Fetch commenter's name
    const { data: commenterProfile, error: commenterProfileError } = await supabaseClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', commenterId)
      .single();

    const commenterName = commenterProfileError || !commenterProfile
      ? 'A user'
      : `${commenterProfile.first_name || ''} ${commenterProfile.last_name || ''}`.trim() || 'A user';

    // Fetch all admin user IDs and their emails
    const { data: adminProfiles, error: adminProfilesError } = await supabaseClient
      .from('profile_with_email')
      .select('id, user_email');

    if (adminProfilesError) {
      console.error('Error fetching admin profiles:', adminProfilesError);
      // Continue without admin notifications if there's an error
    }

    const notificationRecipients: { id: string; email: string | undefined }[] = [];
    const emailRecipients: string[] = [];

    // Add requester as a recipient if they are not the commenter
    if (requesterId !== commenterId) {
      const { data: requesterEmailData, error: requesterEmailError } = await supabaseClient
        .from('profile_with_email')
        .select('user_email')
        .eq('id', requesterId)
        .single();
      
      if (requesterEmailError || !requesterEmailData?.user_email) {
        console.warn(`Could not fetch email for requester ${requesterId}: ${requesterEmailError?.message}`);
      } else {
        notificationRecipients.push({ id: requesterId, email: requesterEmailData.user_email });
        emailRecipients.push(requesterEmailData.user_email);
      }
    }

    // Add admins as recipients if they are not the commenter
    adminProfiles?.forEach(admin => {
      if (admin.id !== commenterId) {
        notificationRecipients.push({ id: admin.id, email: admin.user_email });
        if (admin.user_email) {
          emailRecipients.push(admin.user_email);
        }
      }
    });

    if (notificationRecipients.length === 0 && emailRecipients.length === 0) {
      console.log('No valid recipients for comment notifications.');
      return new Response(JSON.stringify({ message: 'No recipients for comment notifications.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert in-app notifications
    const notificationTitle = `New Comment on ${entityType.replace(/_/g, ' ').charAt(0).toUpperCase() + entityType.replace(/_/g, ' ').slice(1)} #${entityId.substring(0, 8)}`;
    const notificationMessage = `${commenterName} commented on ${entityType.replace(/_/g, ' ')} for ${entityName} (SKU: ${entitySku || 'N/A'}): "${commentText}"`;
    const notificationLink = `${entityLinkPrefix}${entityId}`;

    for (const recipient of notificationRecipients) {
      const { error: notificationError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: recipient.id,
          title: notificationTitle,
          message: notificationMessage,
          link: notificationLink,
          is_read: false,
          type: 'comment', // Use a specific 'comment' type
        });
      if (notificationError) {
        console.error(`Error inserting notification for user ${recipient.id}:`, notificationError);
      }
    }

    // Send email notifications via Resend
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey && emailRecipients.length > 0) {
      const resend = new Resend(resendApiKey);
      // @ts-ignore
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8080';
      const senderEmail = `jon.d@khpayments.com`;

      const entityDisplay = entityType.replace(/_/g, ' ').charAt(0).toUpperCase() + entityType.replace(/_/g, ' ').slice(1);
      const emailSubject = `New Comment on ${entityDisplay}: ${entityName} (SKU: ${entitySku || 'N/A'})`;
      const emailHtmlContent = `
        <p>Hello,</p>
        <p><strong>${commenterName}</strong> has added a new comment to ${entityType.replace(/_/g, ' ')} <strong>#${entityId.substring(0, 8)}</strong>:</p>
        <p style="background-color: #f0f0f0; padding: 10px; border-left: 3px solid #00718f;">
          <em>"${commentText}"</em>
        </p>
        <p>You can view the ${entityType.replace(/_/g, ' ')} and respond to the comment here: <a href="${appUrl}${entityLinkPrefix}${entityId}">View ${entityDisplay}</a></p>
        <p>Thank you,</p>
        <p>Your Payment Team</p>
      `;

      const { data: resendData, error: resendError } = await resend.emails.send({
        from: senderEmail,
        to: emailRecipients,
        subject: emailSubject,
        html: emailHtmlContent,
      });

      if (resendError) {
        console.error('Error sending comment email via Resend:', resendError);
      } else {
        console.log('Comment email sent successfully via Resend:', resendData);
      }
    } else if (!resendApiKey) {
      console.warn('RESEND_API_KEY is not set. Skipping email notifications for comments.');
    } else {
      console.log('No email recipients for comment notification.');
    }

    console.log('Comment notifications processed successfully.');

    return new Response(JSON.stringify({ message: 'Comment notifications processed successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});