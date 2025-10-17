"use client";

import React from 'react';

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

  // Define all patterns we care about, including the ones to filter out
  const patterns = [
    {
      name: 'statusChange',
      regex: /Status changed from \\"([^"]+)\\" to \\"([^"]+)\\"\.?/g,
      formatter: (match: RegExpExecArray) => (
        <React.Fragment key={`status-change-${match.index}`}>
          Status changed from <strong>{cleanAndCapitalizeStatus(match[1])}</strong> to <strong>{cleanAndCapitalizeStatus(match[2])}</strong>.
        </React.Fragment>
      ),
      filter: false,
    },
    {
      name: 'newStatusCreation',
      regex: /New (Standing Order|Direct Debit|transaction) created with status: \\"([^"]+)\\"\.?/g,
      formatter: (match: RegExpExecArray) => (
        <React.Fragment key={`new-status-creation-${match.index}`}>
          New {match[1]} created with status: <strong>{cleanAndCapitalizeStatus(match[2])}</strong>.
        </React.Fragment>
      ),
      filter: false,
    },
    {
      name: 'simpleCreation',
      regex: /New (Standing Order|Direct Debit|transaction) created./g,
      formatter: (match: RegExpExecArray) => (
        <React.Fragment key={`simple-creation-${match.index}`}>
          New {match[1]} created.
        </React.Fragment>
      ),
      filter: false,
    },
    {
      name: 'paymentSetupDateChange',
      regex: /Payment Setup Date changed from \\"[^"]+\\" to \\"[^"]+\\"\.?/g,
      formatter: (match: RegExpExecArray) => null, // Filter this out
      filter: true,
    },
    {
      name: 'paymentApprovedDateChange',
      regex: /Payment Approved Date changed from \\"[^"]+\\" to \\"[^"]+\\"\.?/g,
      formatter: (match: RegExpExecArray) => null, // Filter this out
      filter: true,
    },
    { // NEW: Handle generic update message for Standing Orders
      name: 'standingOrderGenericUpdate',
      regex: /Standing Order updated \(description was unexpectedly null\)\.?/g,
      formatter: (match: RegExpExecArray) => (
        <React.Fragment key={`so-generic-update-${match.index}`}>
          Standing Order updated (no specific field changes detected).
        </React.Fragment>
      ),
      filter: false,
    },
    { // NEW: Handle generic update message for Transactions
      name: 'transactionGenericUpdate',
      regex: /Transaction updated \(description was unexpectedly null\)\.?/g,
      formatter: (match: RegExpExecArray) => (
        <React.Fragment key={`tr-generic-update-${match.index}`}>
          Transaction updated (no specific field changes detected).
        </React.Fragment>
      ),
      filter: false,
    },
  ];

  const allMatches: {
    index: number;
    length: number;
    formatted: React.ReactNode | null;
    originalText: string;
  }[] = [];

  for (const pattern of patterns) {
    let match;
    pattern.regex.lastIndex = 0; // Reset for each pattern
    while ((match = pattern.regex.exec(description)) !== null) {
      if (!pattern.filter) { // Only add if not meant to be filtered
        allMatches.push({
          index: match.index,
          length: match[0].length,
          formatted: pattern.formatter(match),
          originalText: match[0],
        });
      }
    }
  }

  // Sort all matches by their starting index
  allMatches.sort((a, b) => a.index - b.index);

  let currentIndex = 0;
  for (const matchInfo of allMatches) {
    // Add text before the current match
    if (matchInfo.index > currentIndex) {
      const precedingText = description.substring(currentIndex, matchInfo.index).replace(/\\"/g, '"').replace(/\\/g, '');
      if (precedingText.trim().length > 0) { // Only add if there's meaningful text
        formattedParts.push(precedingText);
      }
    }

    // Add the formatted match
    if (matchInfo.formatted !== null) {
      formattedParts.push(matchInfo.formatted);
    }
    
    currentIndex = matchInfo.index + matchInfo.length;
  }

  // Add any remaining text after the last match
  if (currentIndex < description.length) {
    const remainingText = description.substring(currentIndex).replace(/\\"/g, '"').replace(/\\/g, '');
    if (remainingText.trim().length > 0) { // Only add if there's meaningful text
      formattedParts.push(remainingText);
    }
  }

  // Filter out any nulls that might have been added by formatter returning null
  const finalParts = formattedParts.filter(part => part !== null);

  // If after all processing, there are no parts to display, return null
  if (finalParts.length === 0) {
    return null;
  }

  return <>{finalParts}</>;
};