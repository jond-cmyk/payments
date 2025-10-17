import React from 'react'; // Added React import

/**
 * Cleans up a raw status string by removing backslashes and quotes,
 * replacing underscores with spaces, and capitalizing the first letter of each word.
 * @param status The raw status string (e.g., '\"setup_awaiting_approval\"').
 * @returns A cleaned and capitalized string (e.g., 'Setup Awaiting Approval').
 */
export const cleanAndCapitalizeStatus = (status: string): string => {
  if (!status) return '';
  return status
    .replace(/\\"/g, '') // Remove escaped quotes \"
    .replace(/\\/g, '')  // Remove any other backslashes
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Formats an audit description string, identifying and bolding status changes,
 * and cleaning up other text.
 * @param description The raw audit change description from the database.
 * @returns A ReactNode that can be rendered, with statuses bolded.
 */
export const formatAuditDescription = (description: string): React.ReactNode => {
  if (!description) return '';

  // Handle comments first, as they are a distinct type of entry
  const commentMatch = description.match(/^Comment: (.*)/);
  if (commentMatch) {
    return commentMatch[1]; // Return just the comment text
  }

  let formattedParts: (string | React.ReactNode)[] = [];
  let currentIndex = 0;

  // Regex to find status changes: "Status changed from \"OLD\" to \"NEW\"."
  // Updated regex to correctly match literal backslash-quote sequence (\\")
  const statusChangeRegex = /Status changed from \\"([^"]+)\\" to \\"([^"]+)\\"\.?/g;
  // Regex to find new item creation with status: "New X created with status: \"STATUS\"."
  // Updated regex to correctly match literal backslash-quote sequence (\\")
  const newStatusCreationRegex = /New (Standing Order|Direct Debit|transaction) created with status: \\"([^"]+)\\"\.?/g;
  // Regex to find simple creation messages: "New X created."
  const simpleCreationRegex = /New (Standing Order|Direct Debit|transaction) created./g;

  // Process status changes
  let match;
  while ((match = statusChangeRegex.exec(description)) !== null) {
    if (match.index > currentIndex) {
      formattedParts.push(description.substring(currentIndex, match.index).replace(/\\"/g, '"').replace(/\\/g, ''));
    }
    const oldStatus = cleanAndCapitalizeStatus(match[1]);
    const newStatus = cleanAndCapitalizeStatus(match[2]);
    formattedParts.push(
      <React.Fragment key={`status-change-${match.index}`}>
        Status changed from <strong>{oldStatus}</strong> to <strong>{newStatus}</strong>.
      </React.Fragment>
    );
    currentIndex = match.index + match[0].length;
  }

  // Process new status creations
  newStatusCreationRegex.lastIndex = 0; // Reset regex for new pass
  while ((match = newStatusCreationRegex.exec(description)) !== null) {
    if (match.index > currentIndex) {
      formattedParts.push(description.substring(currentIndex, match.index).replace(/\\"/g, '"').replace(/\\/g, ''));
    }
    const itemType = match[1];
    const status = cleanAndCapitalizeStatus(match[2]);
    formattedParts.push(
      <React.Fragment key={`new-status-creation-${match.index}`}>
        New {itemType} created with status: <strong>{status}</strong>.
      </React.Fragment>
    );
    currentIndex = match.index + match[0].length;
  }

  // Process simple creation messages
  simpleCreationRegex.lastIndex = 0; // Reset regex for new pass
  while ((match = simpleCreationRegex.exec(description)) !== null) {
    if (match.index > currentIndex) {
      formattedParts.push(description.substring(currentIndex, match.index).replace(/\\"/g, '"').replace(/\\/g, ''));
    }
    const itemType = match[1];
    formattedParts.push(
      <React.Fragment key={`simple-creation-${match.index}`}>
        New {itemType} created.
      </React.Fragment>
    );
    currentIndex = match.index + match[0].length;
  }

  // Add any remaining text after processing all patterns
  if (currentIndex < description.length) {
    formattedParts.push(description.substring(currentIndex).replace(/\\"/g, '"').replace(/\\/g, ''));
  }

  // If no specific patterns were found, just clean up the whole string
  if (formattedParts.length === 0 && description.length > 0) {
    return description.replace(/\\"/g, '"').replace(/\\/g, '');
  }

  return <>{formattedParts}</>;
};