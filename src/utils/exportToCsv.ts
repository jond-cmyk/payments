"use client";

import { format, parseISO } from 'date-fns';
import { showSuccess, showError } from './toast';

function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  let stringValue = String(value);
  // If the value contains a comma, double quote, or newline, enclose it in double quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Escape double quotes by doubling them
    stringValue = stringValue.replace(/"/g, '""');
    return `"${stringValue}"`;
  }
  return stringValue;
}

export function exportToCsv<T extends Record<string, any>>(data: T[], filename: string) {
  if (!data || data.length === 0) {
    showError("No data to export.");
    return;
  }

  try {
    const headers = Object.keys(data[0]);

    // Format headers for readability (e.g., 'payment_date' -> 'Payment Date')
    const formattedHeaders = headers.map(header =>
      header
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
    );

    const csvRows = [];
    csvRows.push(formattedHeaders.map(escapeCsvValue).join(',')); // Add header row

    for (const row of data) {
      const values = headers.map(header => {
        let value = row[header];
        // Check if the value is a string that looks like an ISO date
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value)) {
          try {
            value = format(parseISO(value), 'yyyy-MM-dd HH:mm:ss'); // Parse and format ISO date strings
          } catch (e) {
            // If parsing fails, keep original string value
            console.warn(`Failed to parse date string for CSV export: ${value}`);
          }
        } else if (typeof value === 'boolean') {
          value = value ? 'Yes' : 'No'; // Format booleans
        } else if (Array.isArray(value)) {
          value = value.join('; '); // Join array values
        }
        return escapeCsvValue(value);
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showSuccess(`${data.length} records exported to ${filename}`);
  } catch (error: any) {
    console.error("Error exporting to CSV:", error);
    showError(`Failed to export data: ${error.message || "Unknown error"}`);
  }
}