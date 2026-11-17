import React, { useState } from 'react';
import { InvoiceTemplateProps, InvoiceItemData } from '../types';
import { formatCurrency, formatDate, formatFullAddress, LogoComponent } from '../helpers';
import {
  extractStateInfo,
  determineGstRouting,
  numberToWordsIndian,
} from '../masterTemplateHelpers';

type CopyType = 'Original' | 'Duplicate' | 'Triplicate' | 'Extra OC';

export const MasterTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  business,
  customer,
  branding,
  theme,
  customization,
  isPrintMode = false,
}) => {
  const [selectedCopy, setSelectedCopy] = useState<CopyType>('Original');

  // VISTAAR Brand Palette Tokens
  const primaryColor = customization?.primaryColor || theme?.primaryColor || '#09090B';
  const emeraldAccent = customization?.accentColor || '#10B981';
  const currency = invoice.currency || '₹';

  // Section Toggles from Document Customization
  const showBankDetails = customization?.showBankDetails ?? true;
  const showSignature = customization?.showSignature ?? true;
  const showStamp = customization?.showStamp ?? true;
  const showTerms = customization?.showTerms ?? true;

  // Address Resolution
  const fullBusinessAddress = formatFullAddress(
    business.address,
    business.addressLine2,
    business.city,
    business.state,
    business.pincode
  );

  const fullCustomerAddress = formatFullAddress(
    customer?.address,
    undefined,
    customer?.city,
    customer?.state,
    customer?.pincode
  );

  // Statutory State Code & Routing Resolution
  const sellerStateInfo = extractStateInfo(business.state, business.gstin);
  const buyerStateInfo = extractStateInfo(customer?.state, customer?.gstin);
  const placeOfSupply = (invoice as any).placeOfSupply || customer?.state || business.state || '';
  const { isIntraState, isInterState } = determineGstRouting(
    sellerStateInfo,
    buyerStateInfo,
    placeOfSupply
  );

  // Meta & Transport Details
  const isReverseCharge = Boolean(
    (invoice as any).reverseCharge === true ||
    (invoice as any).reverseCharge === 'Y' ||
    (invoice as any).reverseCharge === 'Yes' ||
    (customization as any)?.reverseCharge === true
  );
  const transportMode = (invoice as any).transportMode || (invoice as any).transport_mode || 'By Road';
  const vehicleNumber = (invoice as any).vehicleNumber || (invoice as any).vehicle_number || (invoice as any).vehicleNo || '-';
  const transportDate = (invoice as any).transportDate ? formatDate((invoice as any).transportDate) : formatDate(invoice.date);

  // Consignee (Shipped to) Details (fallback to Receiver if not explicitly distinct)
  const consigneeName = (invoice as any).consigneeName || (invoice as any).shippingName || customer?.name || 'Same as Receiver';
  const consigneeAddress = (invoice as any).shippingAddress || fullCustomerAddress || '-';
  const consigneeGstin = (invoice as any).shippingGstin || customer?.gstin || 'URP';
  const consigneeStateInfo = extractStateInfo(
    (invoice as any).shippingState || customer?.state,
    (invoice as any).shippingGstin || customer?.gstin
  );

  // Additional Statutory Charges
  const freightTaxable = Number((invoice as any).freight || (invoice as any).shippingCharges || 0);
  const insuranceTaxable = Number((invoice as any).insurance || 0);
  const packingTaxable = Number((invoice as any).packingCharges || (invoice as any).packing || 0);

  // Items Tax Calculation Engine
  const rawItems: InvoiceItemData[] = invoice.items || [];
  const processedItems = rawItems.map((item, index) => {
    const qty = Number(item.quantity || 0);
    const rate = Number(item.sellingPrice || 0);
    const gross = Number((qty * rate).toFixed(2));
    const discount = Number(item.discountAmount || 0);
    const taxable = Math.max(0, Number((gross - discount).toFixed(2)));
    const taxRate = Number(item.taxPercent || 0);

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (taxRate > 0) {
      if (isIntraState) {
        cgstRate = taxRate / 2;
        sgstRate = taxRate / 2;
        cgstAmount = Number(((taxable * cgstRate) / 100).toFixed(2));
        sgstAmount = Number(((taxable * sgstRate) / 100).toFixed(2));
      } else {
        igstRate = taxRate;
        igstAmount = Number(((taxable * igstRate) / 100).toFixed(2));
      }
    }

    const itemTotal = Number((taxable + cgstAmount + sgstAmount + igstAmount).toFixed(2));
    const hsn = (item as any).hsnCode || (item as any).hsn || (item as any).sku || (item as any).partNumber || '-';
    const uom = item.unit || 'PCS';

    return {
      sNo: index + 1,
      description: item.productName || 'Item',
      hsn,
      uom,
      qty,
      rate,
      gross,
      discount,
      taxable,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      total: itemTotal,
    };
  });

  // Calculate Aggregates
  const totalQty = processedItems.reduce((acc, i) => acc + i.qty, 0);
  const totalGrossItems = processedItems.reduce((acc, i) => acc + i.gross, 0);
  const totalDiscount = processedItems.reduce((acc, i) => acc + i.discount, 0);
  const totalTaxableItems = processedItems.reduce((acc, i) => acc + i.taxable, 0);

  // Statutory charges calculations (taxed at 0 unless explicit or standard)
  const additionalTaxable = freightTaxable + insuranceTaxable + packingTaxable;
  const totalGross = Number((totalGrossItems + additionalTaxable).toFixed(2));
  const totalTaxable = Number((totalTaxableItems + additionalTaxable).toFixed(2));

  const totalCgst = Number(processedItems.reduce((acc, i) => acc + i.cgstAmount, 0).toFixed(2));
  const totalSgst = Number(processedItems.reduce((acc, i) => acc + i.sgstAmount, 0).toFixed(2));
  const totalIgst = Number(processedItems.reduce((acc, i) => acc + i.igstAmount, 0).toFixed(2));
  const totalTaxAmount = Number((totalCgst + totalSgst + totalIgst).toFixed(2));

  // Grand total reconciliation
  const calculatedGrandTotal = Number((totalTaxable + totalTaxAmount).toFixed(2));
  const finalGrandTotal = invoice.grandTotal > 0 ? invoice.grandTotal : calculatedGrandTotal;
  const gstOnReverseCharge = isReverseCharge ? totalTaxAmount : 0;

  // Words Conversion
  const amountInWords = numberToWordsIndian(finalGrandTotal);

  // Bank Info
  const bank = business.bankDetails || {};
  const hasBankData = Boolean(bank.bankName || bank.accountNo || bank.ifscCode);

  // Number of padding rows to match authoritative Excel tabular form (min 7 rows)
  const minRows = 7;
  const paddingRowsCount = Math.max(0, minRows - processedItems.length);

  return (
    <div className="w-full overflow-x-auto bg-slate-100/50 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
      {/* Landscape Print Container */}
      <div
        className="mx-auto bg-white text-[#111827] shadow-lg print:shadow-none border border-slate-300 print:border-none p-5 text-xs box-border"
        style={{
          width: '100%',
          minWidth: '1060px',
          maxWidth: '1200px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* ================= 1. DOCUMENT TOP HEADER & COPIES ================= */}
        <div className="border-2 border-slate-900 mb-0">
          {/* Top Title Banner */}
          <div className="bg-[#09090B] text-white py-1.5 px-4 flex justify-between items-center border-b-2 border-slate-900">
            <span className="font-extrabold tracking-wider uppercase text-[11px] text-[#10B981]">
              GST Tax Invoice Format
            </span>
            <span className="text-[10px] text-slate-300 font-medium">
              VISTAAR Business OS • Statutory Schedule
            </span>
          </div>

          {/* Company Identity & Copy Selection Grid */}
          <div className="grid grid-cols-12 p-3 gap-3 items-center border-b-2 border-slate-900 bg-white">
            {/* Logo */}
            <div className="col-span-2 flex items-center justify-center p-2 border border-slate-200 rounded bg-slate-50 min-h-[75px]">
              <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
            </div>

            {/* Company Info */}
            <div className="col-span-7 pl-2">
              <h1 className="text-xl font-black uppercase text-slate-900 tracking-tight leading-none mb-1">
                {business.legalName || business.businessName}
              </h1>
              {business.legalName && business.legalName !== business.businessName && (
                <p className="text-[11px] text-slate-500 font-semibold mb-1">
                  (Trade Name: {business.businessName})
                </p>
              )}
              <p className="text-[11px] text-slate-700 leading-snug">
                {fullBusinessAddress || 'Business Address Not Configured'}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-600 mt-1">
                {business.phone && (
                  <span>
                    <strong className="text-slate-800">Tel:</strong> {business.phone}
                  </span>
                )}
                {business.email && (
                  <span>
                    <strong className="text-slate-800">Email:</strong> {business.email}
                  </span>
                )}
              </div>
              <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold text-[11px]">
                <span className="text-emerald-800 mr-1 font-black">GSTIN:</span>
                <span>{business.gstin || 'N/A'}</span>
              </div>
            </div>

            {/* Copy Badges (Original, Duplicate, Triplicate, Extra OC) */}
            <div className="col-span-3 border-l border-slate-200 pl-3">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Copy Identification
              </span>
              <div className="grid grid-cols-1 gap-1">
                {(['Original', 'Duplicate', 'Triplicate', 'Extra OC'] as CopyType[]).map((copy) => {
                  const isSelected = selectedCopy === copy;
                  return (
                    <button
                      key={copy}
                      type="button"
                      onClick={() => setSelectedCopy(copy)}
                      className={`flex items-center justify-between px-2 py-1 rounded text-[10px] font-bold transition-all text-left border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{copy}</span>
                      <span className={`text-[9px] font-medium ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {copy === 'Original'
                          ? 'Recipient'
                          : copy === 'Duplicate'
                          ? 'Transporter'
                          : copy === 'Triplicate'
                          ? 'Supplier'
                          : 'Office'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tax Invoice Banner */}
          <div className="bg-slate-50 text-center py-2 border-b-2 border-slate-900">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 leading-none">
              Tax Invoice
            </h2>
            <p className="text-[10px] text-slate-600 font-medium italic mt-0.5">
              (See rule 7, for a tax invoice referred to in section 31)
            </p>
          </div>

          {/* ================= 2. INVOICE META & TRANSPORT GRID ================= */}
          <div className="grid grid-cols-2 border-b-2 border-slate-900 text-[11px]">
            {/* Left Meta Column */}
            <div className="border-r border-slate-300 divide-y divide-slate-200">
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Invoice No:</span>
                <span className="col-span-2 font-black text-slate-900">{invoice.invoiceNumber}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Invoice date:</span>
                <span className="col-span-2 font-bold text-slate-800">{formatDate(invoice.date)}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Reverse Charge (Y/N):</span>
                <span className="col-span-2 font-bold text-slate-800">{isReverseCharge ? 'Y' : 'N'}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">State:</span>
                <span className="col-span-2 flex justify-between pr-4 font-semibold text-slate-800">
                  <span>{sellerStateInfo.state || '-'}</span>
                  <span>
                    <strong className="text-slate-700 mr-1">Code:</strong>
                    <span className="font-bold">{sellerStateInfo.code}</span>
                  </span>
                </span>
              </div>
            </div>

            {/* Right Meta Column */}
            <div className="divide-y divide-slate-200">
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Transport Mode:</span>
                <span className="col-span-2 font-semibold text-slate-800">{transportMode}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Vehicle number:</span>
                <span className="col-span-2 font-semibold text-slate-800">{vehicleNumber}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Date :</span>
                <span className="col-span-2 font-semibold text-slate-800">{transportDate}</span>
              </div>
              <div className="grid grid-cols-3 p-1.5 px-3">
                <span className="font-bold text-slate-700">Place of Supply:</span>
                <span className="col-span-2 font-bold text-slate-900">{placeOfSupply || sellerStateInfo.state}</span>
              </div>
            </div>
          </div>

          {/* ================= 3. RECEIVER & CONSIGNEE SPLIT ================= */}
          <div className="grid grid-cols-2 border-b-2 border-slate-900 text-[11px]">
            {/* Receiver (Billed to) */}
            <div className="border-r border-slate-300">
              <div className="bg-slate-100 px-3 py-1 font-black text-slate-900 border-b border-slate-300 uppercase tracking-wide flex justify-between items-center">
                <span>Detail of Receiver (Billed to)</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">Buyer</span>
              </div>
              <div className="p-2 px-3 space-y-1">
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">Name:</span>
                  <span className="col-span-3 font-bold text-slate-900">{customer?.name || 'Cash Customer'}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">Address:</span>
                  <span className="col-span-3 text-slate-800 leading-tight">
                    {fullCustomerAddress || customer?.address || 'Counter Sale / Walk-in'}
                  </span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">GSTIN:</span>
                  <span className="col-span-3 font-mono font-bold text-slate-900">
                    {customer?.gstin || 'URP (Unregistered)'}
                  </span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">State:</span>
                  <span className="col-span-3 flex justify-between pr-4 font-semibold text-slate-800">
                    <span>{buyerStateInfo.state}</span>
                    <span>
                      <strong className="text-slate-600 mr-1">Code:</strong>
                      <span className="font-bold">{buyerStateInfo.code}</span>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Consignee (Shipped to) */}
            <div>
              <div className="bg-slate-100 px-3 py-1 font-black text-slate-900 border-b border-slate-300 uppercase tracking-wide flex justify-between items-center">
                <span>Detail of Consignee (Shipped to)</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">Delivery</span>
              </div>
              <div className="p-2 px-3 space-y-1">
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">Name:</span>
                  <span className="col-span-3 font-bold text-slate-900">{consigneeName}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">Address:</span>
                  <span className="col-span-3 text-slate-800 leading-tight">{consigneeAddress}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">GSTIN:</span>
                  <span className="col-span-3 font-mono font-bold text-slate-900">{consigneeGstin}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="font-bold text-slate-600">State:</span>
                  <span className="col-span-3 flex justify-between pr-4 font-semibold text-slate-800">
                    <span>{consigneeStateInfo.state}</span>
                    <span>
                      <strong className="text-slate-600 mr-1">Code:</strong>
                      <span className="font-bold">{consigneeStateInfo.code}</span>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 4. 16-COLUMN STATUTORY PRODUCT TABLE ================= */}
          <div className="w-full">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                {/* Level 1 Grouped Header */}
                <tr className="bg-[#0F172A] text-white border-b border-slate-400 font-bold">
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-center w-[36px]">S. No.</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-left min-w-[170px]">Product Description</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-center w-[65px]">HSN code</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-center w-[48px]">UOM</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-right w-[48px]">Qty</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-right w-[68px]">Rate</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-right w-[75px]">Amount</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-right w-[60px]">Discount</th>
                  <th rowSpan={2} className="border-r border-slate-600 p-1.5 text-right w-[80px]">Taxable Value</th>
                  <th colSpan={2} className="border-r border-slate-600 p-1 text-center bg-[#09090B] text-[#10B981]">CGST</th>
                  <th colSpan={2} className="border-r border-slate-600 p-1 text-center bg-[#09090B] text-[#10B981]">SGST</th>
                  <th colSpan={2} className="border-r border-slate-600 p-1 text-center bg-[#09090B] text-[#10B981]">IGST</th>
                  <th rowSpan={2} className="p-1.5 text-right w-[85px] bg-[#09090B] text-[#10B981]">Total</th>
                </tr>
                {/* Level 2 Tax Sub-Columns */}
                <tr className="bg-[#1E293B] text-white border-b-2 border-slate-900 font-semibold text-[9px]">
                  <th className="border-r border-slate-600 p-1 text-right w-[40px]">Rate</th>
                  <th className="border-r border-slate-600 p-1 text-right w-[62px]">Amount</th>
                  <th className="border-r border-slate-600 p-1 text-right w-[40px]">Rate</th>
                  <th className="border-r border-slate-600 p-1 text-right w-[62px]">Amount</th>
                  <th className="border-r border-slate-600 p-1 text-right w-[40px]">Rate</th>
                  <th className="border-r border-slate-600 p-1 text-right w-[62px]">Amount</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {/* Active Items */}
                {processedItems.map((item) => (
                  <tr key={item.sNo} className="hover:bg-slate-50/80 transition-colors">
                    <td className="border-r border-slate-300 p-1 text-center text-slate-700 font-medium">{item.sNo}</td>
                    <td className="border-r border-slate-300 p-1 text-left font-bold text-slate-900">{item.description}</td>
                    <td className="border-r border-slate-300 p-1 text-center font-mono text-slate-700">{item.hsn}</td>
                    <td className="border-r border-slate-300 p-1 text-center text-slate-700 uppercase">{item.uom}</td>
                    <td className="border-r border-slate-300 p-1 text-right font-semibold text-slate-800">{item.qty}</td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-800">{item.rate.toFixed(2)}</td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-800">{item.gross.toFixed(2)}</td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-700">
                      {item.discount > 0 ? item.discount.toFixed(2) : '-'}
                    </td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono font-bold text-slate-900">{item.taxable.toFixed(2)}</td>
                    {/* CGST */}
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-700">
                      {item.cgstRate > 0 ? `${item.cgstRate}%` : '-'}
                    </td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-800">
                      {item.cgstAmount > 0 ? item.cgstAmount.toFixed(2) : '-'}
                    </td>
                    {/* SGST */}
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-700">
                      {item.sgstRate > 0 ? `${item.sgstRate}%` : '-'}
                    </td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-800">
                      {item.sgstAmount > 0 ? item.sgstAmount.toFixed(2) : '-'}
                    </td>
                    {/* IGST */}
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-700">
                      {item.igstRate > 0 ? `${item.igstRate}%` : '-'}
                    </td>
                    <td className="border-r border-slate-300 p-1 text-right font-mono text-slate-800">
                      {item.igstAmount > 0 ? item.igstAmount.toFixed(2) : '-'}
                    </td>
                    {/* Line Total */}
                    <td className="p-1 text-right font-mono font-black text-slate-950 bg-slate-50/50">
                      {item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}

                {/* Statutory Padding Rows to Preserve Excel Visual Balance */}
                {Array.from({ length: paddingRowsCount }).map((_, idx) => (
                  <tr key={`pad-${idx}`} className="h-6">
                    <td className="border-r border-slate-300 p-1 text-center text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="border-r border-slate-300 p-1 text-transparent">-</td>
                    <td className="p-1 text-transparent">-</td>
                  </tr>
                ))}

                {/* Additional Statutory Charges Rows (Freight, Insurance, Packing) */}
                <tr className="bg-slate-50/60 font-medium text-slate-700 border-t border-slate-300">
                  <td colSpan={4} className="border-r border-slate-300 p-1 pl-3 font-semibold text-slate-800">Freight</td>
                  <td className="border-r border-slate-300 p-1 text-center">-</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{freightTaxable > 0 ? freightTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{freightTaxable > 0 ? freightTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="p-1 text-right font-mono font-semibold">{freightTaxable > 0 ? freightTaxable.toFixed(2) : '0'}</td>
                </tr>

                <tr className="bg-slate-50/60 font-medium text-slate-700">
                  <td colSpan={4} className="border-r border-slate-300 p-1 pl-3 font-semibold text-slate-800">Insurance</td>
                  <td className="border-r border-slate-300 p-1 text-center">-</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{insuranceTaxable > 0 ? insuranceTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{insuranceTaxable > 0 ? insuranceTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="p-1 text-right font-mono font-semibold">{insuranceTaxable > 0 ? insuranceTaxable.toFixed(2) : '0'}</td>
                </tr>

                <tr className="bg-slate-50/60 font-medium text-slate-700 border-b-2 border-slate-900">
                  <td colSpan={4} className="border-r border-slate-300 p-1 pl-3 font-semibold text-slate-800">Packing and Forwarding Charges</td>
                  <td className="border-r border-slate-300 p-1 text-center">-</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{packingTaxable > 0 ? packingTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">{packingTaxable > 0 ? packingTaxable.toFixed(2) : '0'}</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="border-r border-slate-300 p-1 text-right">-</td>
                  <td className="border-r border-slate-300 p-1 text-right font-mono">0</td>
                  <td className="p-1 text-right font-mono font-semibold">{packingTaxable > 0 ? packingTaxable.toFixed(2) : '0'}</td>
                </tr>

                {/* Authoritative Table Total Row */}
                <tr className="bg-emerald-50/70 border-b-2 border-slate-900 font-black text-slate-900">
                  <td colSpan={4} className="border-r border-slate-400 p-1.5 text-center uppercase tracking-wider text-[11px]">
                    Total
                  </td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-bold">{totalQty}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right">-</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalGross.toFixed(2)}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalDiscount.toFixed(2)}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalTaxable.toFixed(2)}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right">-</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalCgst.toFixed(2)}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right">-</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalSgst.toFixed(2)}</td>
                  <td className="border-r border-slate-400 p-1.5 text-right">-</td>
                  <td className="border-r border-slate-400 p-1.5 text-right font-mono">{totalIgst.toFixed(2)}</td>
                  <td className="p-1.5 text-right font-mono text-emerald-950 font-black text-[11px]">
                    {finalGrandTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ================= 5. TAX SUMMARY, BANK DETAILS & FOOTER ================= */}
          <div className="grid grid-cols-12 text-[11px]">
            {/* Left Column: Words, Bank Details, Terms */}
            <div className="col-span-7 border-r border-slate-300 divide-y divide-slate-200">
              {/* Total Invoice Amount in Words */}
              <div className="p-2.5 px-3 bg-slate-50/40">
                <span className="font-black text-slate-800 uppercase tracking-wide block mb-0.5 text-[10px]">
                  Total Invoice amount in words:
                </span>
                <p className="font-extrabold text-slate-900 italic text-[11px] leading-tight">
                  {amountInWords}
                </p>
              </div>

              {/* Bank Details */}
              {showBankDetails && (
                <div className="p-2.5 px-3 bg-white">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-3 bg-emerald-600 rounded-xs"></span>
                    <span className="font-black text-slate-900 uppercase tracking-wider text-[10px]">
                      Bank Details
                    </span>
                  </div>
                  {hasBankData ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div>
                        <span className="font-bold text-slate-600 mr-1.5">Bank Name:</span>
                        <span className="font-black text-slate-900">{bank.bankName || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-600 mr-1.5">Bank A/C:</span>
                        <span className="font-mono font-black text-slate-900">{bank.accountNo || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-600 mr-1.5">Bank IFSC:</span>
                        <span className="font-mono font-bold text-slate-800">{bank.ifscCode || 'N/A'}</span>
                      </div>
                      {bank.branch && (
                        <div>
                          <span className="font-bold text-slate-600 mr-1.5">Branch:</span>
                          <span className="font-medium text-slate-800">{bank.branch}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic text-[10px]">Bank details not configured in settings.</p>
                  )}
                </div>
              )}

              {/* Terms & Conditions */}
              {showTerms && (
                <div className="p-2.5 px-3 bg-slate-50/30">
                  <span className="font-bold text-slate-800 uppercase tracking-wide block mb-1 text-[10px]">
                    Terms & conditions:-
                  </span>
                  <div className="text-[10px] text-slate-600 space-y-0.5 leading-relaxed whitespace-pre-line font-medium">
                    {invoice.terms ||
                      (business as any).terms ||
                      '1. Goods once sold will not be taken back or exchanged.\n2. Interest @ 18% p.a. will be charged if payment is delayed beyond due date.\n3. Subject to local state jurisdiction only.'}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Financial Breakdown & Signatures */}
            <div className="col-span-5 divide-y divide-slate-200">
              {/* Tax Calculations Schedule */}
              <div className="divide-y divide-slate-100 text-[11px]">
                <div className="flex justify-between p-1.5 px-3 font-semibold text-slate-800">
                  <span>Total Amount before Tax:</span>
                  <span className="font-mono font-bold">{formatCurrency(totalTaxable, currency)}</span>
                </div>
                <div className="flex justify-between p-1 px-3 text-slate-700">
                  <span>Add: CGST</span>
                  <span className="font-mono">{totalCgst > 0 ? formatCurrency(totalCgst, currency) : '-'}</span>
                </div>
                <div className="flex justify-between p-1 px-3 text-slate-700">
                  <span>Add: SGST</span>
                  <span className="font-mono">{totalSgst > 0 ? formatCurrency(totalSgst, currency) : '-'}</span>
                </div>
                <div className="flex justify-between p-1 px-3 text-slate-700">
                  <span>Add: IGST</span>
                  <span className="font-mono">{totalIgst > 0 ? formatCurrency(totalIgst, currency) : '-'}</span>
                </div>
                <div className="flex justify-between p-1.5 px-3 font-bold text-slate-800 bg-slate-50/50">
                  <span>Total Tax Amount:</span>
                  <span className="font-mono">{formatCurrency(totalTaxAmount, currency)}</span>
                </div>
                {/* Grand Total */}
                <div className="flex justify-between p-2 px-3 font-black text-[12px] bg-[#09090B] text-white">
                  <span className="text-[#10B981]">Total Amount after Tax:</span>
                  <span className="font-mono text-[#10B981]">{formatCurrency(finalGrandTotal, currency)}</span>
                </div>
                {/* GST on Reverse Charge */}
                <div className="flex justify-between p-1 px-3 text-[10px] text-slate-600">
                  <span>GST on Reverse Charge:</span>
                  <span className="font-mono font-medium">
                    {isReverseCharge ? formatCurrency(gstOnReverseCharge, currency) : '0.00'}
                  </span>
                </div>
              </div>

              {/* Certification & Authorised Signatory */}
              <div className="p-3 text-center bg-white flex flex-col justify-between min-h-[110px]">
                <div>
                  <p className="text-[10px] text-slate-600 italic">
                    Certified that the particulars given above are true and correct
                  </p>
                  <p className="text-[11px] font-black uppercase text-slate-900 mt-0.5">
                    For {business.legalName || business.businessName}
                  </p>
                </div>

                {/* Signature / Stamp Visual Slot */}
                <div className="my-1 flex items-center justify-center gap-3 min-h-[40px]">
                  {showStamp && branding.stampUrl && (
                    <img
                      src={branding.stampUrl}
                      alt="Stamp"
                      className="max-h-12 max-w-[80px] object-contain opacity-90"
                      style={{ transform: `scale(${branding.stampScale || 1})` }}
                    />
                  )}
                  {showSignature && branding.signatureUrl && (
                    <img
                      src={branding.signatureUrl}
                      alt="Signature"
                      className="max-h-12 max-w-[120px] object-contain"
                      style={{ transform: `scale(${branding.signatureScale || 1})` }}
                    />
                  )}
                </div>

                <p className="text-[10px] font-bold text-slate-900 uppercase tracking-wider border-t border-slate-300 pt-1 mt-1">
                  Authorised Signatory
                </p>
              </div>
            </div>
          </div>

          {/* ================= 6. STATUTORY CIN & HEAD OFFICE FOOTER ================= */}
          <div className="border-t-2 border-slate-900 bg-slate-100/80 p-2 px-3 text-[10px] text-slate-700 flex flex-wrap justify-between items-center gap-2">
            <div>
              <strong className="text-slate-900 mr-1">Head Office :</strong>
              <span>{fullBusinessAddress || 'As per Registered Business Profile'}</span>
            </div>
            <div>
              <strong className="text-slate-900 mr-1">CIN NO :</strong>
              <span className="font-mono font-semibold">
                {(business as any).cin || (business.pan ? `PAN: ${business.pan}` : 'CIN ZZZZDEDDDDDDDDD')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
