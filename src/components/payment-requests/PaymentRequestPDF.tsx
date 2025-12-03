import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { PaymentRequest } from '@/types/supabase';
import { format } from 'date-fns';

// Register a standard font (Helvetica is built-in, but defining styles helps organization)
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#333',
    lineHeight: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#00728F', // Dyad Blue
    paddingBottom: 10,
  },
  logo: {
    width: 120,
    height: 'auto',
  },
  headerText: {
    textAlign: 'right',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00728F',
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#F9FAFB', // Gray-50
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00728F',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  col: {
    flex: 1,
  },
  label: {
    fontSize: 9,
    color: '#6B7280', // Gray-500
    fontWeight: 'bold',
    marginBottom: 1,
  },
  value: {
    fontSize: 10,
    color: '#111827', // Gray-900
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    alignSelf: 'flex-start',
    fontSize: 9,
  },
  table: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#00728F',
    color: '#FFF',
    padding: 6,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    padding: 6,
  },
  tableCell: {
    flex: 1,
  },
  amountCell: {
    flex: 1,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 6,
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
});

interface PaymentRequestPDFProps {
  request: PaymentRequest;
  requesterName?: string;
}

const formatCurrency = (amount: number, currency: string) => {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PaymentRequestPDF: React.FC<PaymentRequestPDFProps> = ({ request, requesterName }) => {
  const isUK = request.country === 'United Kingdom';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* Using the logo URL from the codebase */}
          <Image 
            src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" 
            style={styles.logo} 
          />
          <View style={styles.headerText}>
            <Text style={styles.title}>Payment Request</Text>
            <Text style={styles.subTitle}>#{request.id.substring(0, 8).toUpperCase()}</Text>
            <Text style={styles.subTitle}>Generated: {format(new Date(), 'PPP')}</Text>
          </View>
        </View>

        {/* Overview Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>{request.status.replace(/_/g, ' ').toUpperCase()}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Date Required</Text>
              <Text style={styles.value}>{format(new Date(request.date_payment_required), 'PPP')}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Requester</Text>
              <Text style={styles.value}>{requesterName || request.requester_id}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Urgent</Text>
              <Text style={styles.value}>{request.is_urgent ? 'YES' : 'No'}</Text>
            </View>
          </View>
        </View>

        {/* Supplier & Property Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Supplier & Property</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Supplier Name</Text>
              <Text style={styles.value}>{request.supplier_name}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Country</Text>
              <Text style={styles.value}>{request.country}</Text>
            </View>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <View style={styles.col}>
              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>{request.supplier_address || 'N/A'}</Text>
            </View>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <View style={styles.col}>
              <Text style={styles.label}>SKU Number</Text>
              <Text style={styles.value}>{request.not_sku_related ? 'N/A (Not SKU Related)' : request.sku_number}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Lease ID</Text>
              <Text style={styles.value}>{request.lease_id || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Financial Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financials</Text>
          
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableCell}>Category</Text>
              <Text style={styles.amountCell}>Amount ({request.currency})</Text>
            </View>
            
            {request.categories && request.categories.length > 0 ? (
              request.categories.map((cat, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{cat.category}</Text>
                  <Text style={styles.amountCell}>{cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </View>
              ))
            ) : (
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>No categories</Text>
                <Text style={styles.amountCell}>-</Text>
              </View>
            )}
            
            <View style={styles.totalRow}>
              <Text style={styles.tableCell}>Total Amount</Text>
              <Text style={styles.amountCell}>{formatCurrency(request.total_amount, request.currency || '')}</Text>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Notes / Reason for Payment</Text>
            <Text style={styles.value}>{request.reason_for_payment || 'N/A'}</Text>
          </View>
        </View>

        {/* Bank Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bank Details</Text>
          <View style={styles.row}>
            {isUK ? (
              <>
                <View style={styles.col}>
                  <Text style={styles.label}>Account Name</Text>
                  <Text style={styles.value}>{request.bank_account_name || 'N/A'}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Sort Code</Text>
                  <Text style={styles.value}>{request.sort_code || 'N/A'}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Account Number</Text>
                  <Text style={styles.value}>{request.account_number || 'N/A'}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.col}>
                  <Text style={styles.label}>IBAN</Text>
                  <Text style={styles.value}>{request.iban_number || 'N/A'}</Text>
                </View>
                {request.bank_account_name && (
                  <View style={styles.col}>
                    <Text style={styles.label}>Account Name</Text>
                    <Text style={styles.value}>{request.bank_account_name}</Text>
                  </View>
                )}
              </>
            )}
          </View>
          <View style={[styles.row, { marginTop: 4 }]}>
             <View style={styles.col}>
               <Text style={styles.label}>Details Verified?</Text>
               <Text style={styles.value}>{request.bank_details_verified ? 'Yes' : 'No'}</Text>
             </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          KH Payments System | {request.country} | Request ID: {request.id}
        </Text>
      </Page>
    </Document>
  );
};

export default PaymentRequestPDF;