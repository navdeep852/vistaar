import React, { useState } from 'react';
import { InvoiceTemplateProps, InvoiceItemData } from '../types';
import { formatCurrency, formatDate, formatFullAddress, LogoComponent } from '../helpers';
import {
  extractStateInfo,
  determineGstRouting,
  numberToWordsIndian,
  CopyType,
  COPY_BADGE_CONFIG,
  ProcessedItem,
  chunkMasterTemplateItems,
} from '../masterTemplateHelpers';

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
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100%' | '75%' | '50%'>('fit');

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
  const processedItems: ProcessedItem[] = rawItems.map((item, index) => {
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

  // Statutory charges calculations
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

  // Discrete Page Chunking
  const pageChunks = chunkMasterTemplateItems(processedItems);
  const copyBadge = COPY_BADGE_CONFIG[selectedCopy] || COPY_BADGE_CONFIG.Original;

  // Compute Zoom Scale
  const zoomScale = zoomLevel === '75%' ? 0.75 : zoomLevel === '50%' ? 0.5 : zoomLevel === '100%' ? 1 : null;

  return (
    <div className="w-full bg-slate-100/60 dark:bg-slate-900/60 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible flex flex-col items-center">
      {/* Dynamic Print Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: 297mm 210mm landscape;
            margin: 6mm 8mm;
          }
          html, body {
            width: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .master-template-page {
            page-break-after: always;
            break-after: page;
            width: 281mm !important;
            min-height: 198mm !important;
            max-width: none !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
          }
          .master-template-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          .master-preview-toolbar {
            display: none !important;
          }
        }
      `}</style>

      {/* ================= PREVIEW TOOLBAR (EXTERNAL TO PRINTABLE AREA) ================= */}
      {!isPrintMode && (
        <div className="master-preview-toolbar w-full max-w-[1123px] mb-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 px-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Copy Identification Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="master-copy-select" className="font-bold text-slate-700 dark:text-slate-200">
              Copy Identification:
            </label>
            <select
              id="master-copy-select"
              value={selectedCopy}
              onChange={(e) => setSelectedCopy(e.target.value as CopyType)}
              className="font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="Original">Original (For Recipient)</option>
              <option value="Duplicate">Duplicate (For Transporter)</option>
              <option value="Triplicate">Triplicate (For Supplier)</option>
              <option value="Extra OC">Extra OC (Office Copy)</option>
            </select>
          </div>

          {/* Center: Page Information Badge */}
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
              A4 Landscape (297 × 210 mm)
            </span>
            <span>
              {pageChunks.length === 1 ? '1 Page' : `${pageChunks.length} Pages`}
            </span>
          </div>

          {/* Right: Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">Zoom:</span>
            {(['fit', '100%', '75%', '50%'] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={`px-2 py-1 font-bold rounded-lg text-[11px] border transition-colors ${
                  zoomLevel === z
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {z === 'fit' ? 'Auto' : z}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Responsive Scroll/Scale Wrapper */}
      <div className="w-full overflow-x-auto flex flex-col items-center gap-6 pb-6 print:p-0 print:m-0 print:gap-0 print:overflow-visible">
        {pageChunks.map((chunk) => (
          <div
            key={`page-${chunk.pageNumber}`}
            className="master-template-page bg-white text-[#111827] shadow-xl print:shadow-none border border-slate-300 print:border-none p-5 text-xs box-border flex flex-col justify-between"
            style={{
              width: '1123px',
              minHeight: '794px',
              transform: zoomScale ? `scale(${zoomScale})` : undefined,
              transformOrigin: 'top center',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {/* Inner Bordered Document Body */}
            <div className="border-2 border-slate-900 flex-1 flex flex-col justify-between">
              <div>
                {/* ================= PAGE HEADER ================= */}
                {chunk.isFirstPage ? (
                  <>
                    {/* Top Statutory Title Banner */}
                    <div className="bg-[#09090B] text-white py-1.5 px-4 flex justify-between items-center border-b-2 border-slate-900">
                      <span className="font-extrabold tracking-wider uppercase text-[11px] text-[#10B981]">
                        GST Tax Invoice Format
                      </span>
                      <span className="text-[10px] text-slate-300 font-medium">
                        VISTAAR Business OS • Statutory Schedule
                      </span>
                    </div>

                    {/* Company Identity & Statutory Copy Badge Grid */}
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

                      {/* Clean Statutory Copy Badge (Strictly Text/Vector - No interactive controls) */}
                      <div className="col-span-3 border-l-2 border-slate-900 pl-3 flex flex-col justify-center items-center">
                        <div className="w-full border-2 border-slate-900 rounded bg-slate-50 p-2 text-center">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 block">
                            {copyBadge.title}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-600 italic block mt-0.5">
                            {copyBadge.subtitle}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tax Invoice Banner */}
                    <div className="bg-slate-50 text-center py-1.5 border-b-2 border-slate-900">
                      <h2 className="text-base font-black uppercase tracking-wider text-slate-900 leading-none">
                        Tax Invoice
                      </h2>
                      <p className="text-[9.5px] text-slate-600 font-medium italic mt-0.5">
                        (See rule 7, for a tax invoice referred to in section 31)
                      </p>
                    </div>

                    {/* Invoice Meta & Transport Grid */}
                    <div className="grid grid-cols-2 border-b-2 border-slate-900 text-[10.5px]">
                      {/* Left Meta Column */}
                      <div className="border-r border-slate-300 divide-y divide-slate-200">
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Invoice No:</span>
                          <span className="col-span-2 font-black text-slate-900">{invoice.invoiceNumber}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Invoice date:</span>
                          <span className="col-span-2 font-bold text-slate-800">{formatDate(invoice.date)}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Reverse Charge (Y/N):</span>
                          <span className="col-span-2 font-bold text-slate-800">{isReverseCharge ? 'Y' : 'N'}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
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
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Transport Mode:</span>
                          <span className="col-span-2 font-semibold text-slate-800">{transportMode}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Vehicle number:</span>
                          <span className="col-span-2 font-semibold text-slate-800">{vehicleNumber}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Date:</span>
                          <span className="col-span-2 font-semibold text-slate-800">{transportDate}</span>
                        </div>
                        <div className="grid grid-cols-3 p-1 px-3">
                          <span className="font-bold text-slate-700">Place of Supply:</span>
                          <span className="col-span-2 font-bold text-slate-900">{placeOfSupply || sellerStateInfo.state}</span>
                        </div>
                      </div>
                    </div>

                    {/* Receiver & Consignee Split */}
                    <div className="grid grid-cols-2 border-b-2 border-slate-900 text-[10.5px]">
                      {/* Receiver (Billed to) */}
                      <div className="border-r border-slate-300">
                        <div className="bg-slate-100 px-3 py-0.5 font-black text-slate-900 border-b border-slate-300 uppercase tracking-wide flex justify-between items-center text-[10px]">
                          <span>Detail of Receiver (Billed to)</span>
                          <span className="px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-bold text-[8.5px]">Buyer</span>
                        </div>
                        <div className="p-1.5 px-3 space-y-0.5">
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
                        <div className="bg-slate-100 px-3 py-0.5 font-black text-slate-900 border-b border-slate-300 uppercase tracking-wide flex justify-between items-center text-[10px]">
                          <span>Detail of Consignee (Shipped to)</span>
                          <span className="px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-bold text-[8.5px]">Delivery</span>
                        </div>
                        <div className="p-1.5 px-3 space-y-0.5">
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
                  </>
                ) : (
                  /* Continuation Page Header (Page 2+) */
                  <div className="bg-white border-b-2 border-slate-900 p-2.5 px-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm uppercase text-slate-900">
                          {business.legalName || business.businessName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 font-mono font-bold">
                          GSTIN: {business.gstin || 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-600 mt-0.5">
                        <span><strong>Invoice No:</strong> {invoice.invoiceNumber}</span>
                        <span><strong>Date:</strong> {formatDate(invoice.date)}</span>
                        <span><strong>Place of Supply:</strong> {placeOfSupply || sellerStateInfo.state}</span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="border border-slate-900 rounded bg-slate-50 px-2 py-1 text-center">
                        <span className="text-[9px] font-black uppercase text-slate-900 block leading-tight">
                          {copyBadge.title}
                        </span>
                        <span className="text-[8px] font-semibold text-slate-500 italic block">
                          {copyBadge.subtitle}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded bg-[#09090B] text-[#10B981] font-black text-[10px] uppercase tracking-wider">
                        Continuation Sheet • Page {chunk.pageNumber} of {chunk.totalPages}
                      </span>
                    </div>
                  </div>
                )}

                {/* ================= 16-COLUMN STATUTORY TABLE ================= */}
                <div className="w-full">
                  <table
                    className="w-full border-collapse text-[9.5px]"
                    style={{ tableLayout: 'fixed', width: '100%' }}
                  >
                    {/* Fixed 16-Column Proportions (Exact 100.0% Sum) */}
                    <colgroup>
                      <col style={{ width: '3.5%' }} />
                      <col style={{ width: '21.0%' }} />
                      <col style={{ width: '6.5%' }} />
                      <col style={{ width: '4.5%' }} />
                      <col style={{ width: '4.5%' }} />
                      <col style={{ width: '6.0%' }} />
                      <col style={{ width: '7.0%' }} />
                      <col style={{ width: '5.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '4.0%' }} />
                      <col style={{ width: '5.0%' }} />
                      <col style={{ width: '4.0%' }} />
                      <col style={{ width: '5.0%' }} />
                      <col style={{ width: '4.0%' }} />
                      <col style={{ width: '5.0%' }} />
                      <col style={{ width: '7.0%' }} />
                    </colgroup>

                    <thead>
                      {/* Level 1 Grouped Header */}
                      <tr className="bg-[#0F172A] text-white border-b border-slate-400 font-bold leading-tight">
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-center">S. No.</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-left">Product Description</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-center">HSN code</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-center">UOM</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-right">Qty</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-right">Rate</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-right">Amount</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-right">Discount</th>
                        <th rowSpan={2} className="border-r border-slate-600 p-1 text-right">Taxable Value</th>
                        <th colSpan={2} className="border-r border-slate-600 p-0.5 text-center bg-[#09090B] text-[#10B981]">CGST</th>
                        <th colSpan={2} className="border-r border-slate-600 p-0.5 text-center bg-[#09090B] text-[#10B981]">SGST</th>
                        <th colSpan={2} className="border-r border-slate-600 p-0.5 text-center bg-[#09090B] text-[#10B981]">IGST</th>
                        <th rowSpan={2} className="p-1 text-right bg-[#09090B] text-[#10B981]">Total</th>
                      </tr>
                      {/* Level 2 Sub-Columns */}
                      <tr className="bg-[#1E293B] text-white border-b-2 border-slate-900 font-semibold text-[8.5px]">
                        <th className="border-r border-slate-600 p-0.5 text-right">Rate</th>
                        <th className="border-r border-slate-600 p-0.5 text-right">Amount</th>
                        <th className="border-r border-slate-600 p-0.5 text-right">Rate</th>
                        <th className="border-r border-slate-600 p-0.5 text-right">Amount</th>
                        <th className="border-r border-slate-600 p-0.5 text-right">Rate</th>
                        <th className="border-r border-slate-600 p-0.5 text-right">Amount</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {/* Page Items */}
                      {chunk.items.map((item) => (
                        <tr key={item.sNo} className="hover:bg-slate-50/80 transition-colors">
                          <td className="border-r border-slate-300 p-1 text-center text-slate-700 font-medium">{item.sNo}</td>
                          <td className="border-r border-slate-300 p-1 text-left font-bold text-slate-900 break-words leading-tight">{item.description}</td>
                          <td className="border-r border-slate-300 p-1 text-center font-mono text-slate-700 break-words">{item.hsn}</td>
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

                      {/* Padding Rows on Final Page (To preserve clean tabular structure) */}
                      {chunk.isLastPage &&
                        Array.from({ length: chunk.paddingRowsCount }).map((_, idx) => (
                          <tr key={`pad-${idx}`} className="h-5">
                            <td className="border-r border-slate-300 p-0.5 text-center text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="border-r border-slate-300 p-0.5 text-transparent">-</td>
                            <td className="p-0.5 text-transparent">-</td>
                          </tr>
                        ))}

                      {/* Continuation Notice Row (If multi-page and not last page) */}
                      {!chunk.isLastPage && (
                        <tr className="bg-slate-50 border-t-2 border-slate-900 font-bold text-slate-700 italic text-center">
                          <td colSpan={16} className="p-2 text-center text-[10px]">
                            --- Continued on Next Page (Page {chunk.pageNumber + 1} of {chunk.totalPages}) ---
                          </td>
                        </tr>
                      )}

                      {/* Final Page Statutory Additions & Grand Totals */}
                      {chunk.isLastPage && (
                        <>
                          {/* Freight */}
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

                          {/* Insurance */}
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

                          {/* Packing Charges */}
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

                          {/* Grand Authoritative Table Total Row */}
                          <tr className="bg-emerald-50/70 border-b-2 border-slate-900 font-black text-slate-900">
                            <td colSpan={4} className="border-r border-slate-400 p-1.5 text-center uppercase tracking-wider text-[10.5px]">
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
                            <td className="p-1.5 text-right font-mono text-emerald-950 font-black text-[10.5px]">
                              {finalGrandTotal.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ================= FINAL PAGE SUMMARY & SIGNATURE ================= */}
                {chunk.isLastPage && (
                  <div className="grid grid-cols-12 text-[10.5px]">
                    {/* Left Column: Words, Bank Details, Terms */}
                    <div className="col-span-7 border-r border-slate-300 divide-y divide-slate-200">
                      {/* Total Invoice Amount in Words */}
                      <div className="p-2 px-3 bg-slate-50/40">
                        <span className="font-black text-slate-800 uppercase tracking-wide block mb-0.5 text-[9.5px]">
                          Total Invoice amount in words:
                        </span>
                        <p className="font-extrabold text-slate-900 italic text-[10.5px] leading-tight">
                          {amountInWords}
                        </p>
                      </div>

                      {/* Bank Details */}
                      {showBankDetails && (
                        <div className="p-2 px-3 bg-white">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-1.5 h-3 bg-emerald-600 rounded-xs"></span>
                            <span className="font-black text-slate-900 uppercase tracking-wider text-[9.5px]">
                              Bank Details
                            </span>
                          </div>
                          {hasBankData ? (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px]">
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
                            <p className="text-slate-500 italic text-[9.5px]">Bank details not configured in settings.</p>
                          )}
                        </div>
                      )}

                      {/* Terms & Conditions */}
                      {showTerms && (
                        <div className="p-2 px-3 bg-slate-50/30">
                          <span className="font-bold text-slate-800 uppercase tracking-wide block mb-0.5 text-[9.5px]">
                            Terms & conditions:-
                          </span>
                          <div className="text-[9.5px] text-slate-600 space-y-0.5 leading-relaxed whitespace-pre-line font-medium">
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
                      <div className="divide-y divide-slate-100 text-[10.5px]">
                        <div className="flex justify-between p-1 px-3 font-semibold text-slate-800">
                          <span>Total Amount before Tax:</span>
                          <span className="font-mono font-bold">{formatCurrency(totalTaxable, currency)}</span>
                        </div>
                        <div className="flex justify-between p-0.5 px-3 text-slate-700">
                          <span>Add: CGST</span>
                          <span className="font-mono">{totalCgst > 0 ? formatCurrency(totalCgst, currency) : '-'}</span>
                        </div>
                        <div className="flex justify-between p-0.5 px-3 text-slate-700">
                          <span>Add: SGST</span>
                          <span className="font-mono">{totalSgst > 0 ? formatCurrency(totalSgst, currency) : '-'}</span>
                        </div>
                        <div className="flex justify-between p-0.5 px-3 text-slate-700">
                          <span>Add: IGST</span>
                          <span className="font-mono">{totalIgst > 0 ? formatCurrency(totalIgst, currency) : '-'}</span>
                        </div>
                        <div className="flex justify-between p-1 px-3 font-bold text-slate-800 bg-slate-50/50">
                          <span>Total Tax Amount:</span>
                          <span className="font-mono">{formatCurrency(totalTaxAmount, currency)}</span>
                        </div>
                        {/* Grand Total */}
                        <div className="flex justify-between p-1.5 px-3 font-black text-[11.5px] bg-[#09090B] text-white">
                          <span className="text-[#10B981]">Total Amount after Tax:</span>
                          <span className="font-mono text-[#10B981]">{formatCurrency(finalGrandTotal, currency)}</span>
                        </div>
                        {/* GST on Reverse Charge */}
                        <div className="flex justify-between p-0.5 px-3 text-[9.5px] text-slate-600">
                          <span>GST on Reverse Charge:</span>
                          <span className="font-mono font-medium">
                            {isReverseCharge ? formatCurrency(gstOnReverseCharge, currency) : '0.00'}
                          </span>
                        </div>
                      </div>

                      {/* Certification & Authorised Signatory */}
                      <div className="p-2 text-center bg-white flex flex-col justify-between min-h-[95px]">
                        <div>
                          <p className="text-[9.5px] text-slate-600 italic">
                            Certified that the particulars given above are true and correct
                          </p>
                          <p className="text-[10.5px] font-black uppercase text-slate-900 mt-0.5">
                            For {business.legalName || business.businessName}
                          </p>
                        </div>

                        {/* Signature / Stamp Visual Slot */}
                        <div className="my-1 flex items-center justify-center gap-3 min-h-[36px]">
                          {showStamp && branding.stampUrl && (
                            <img
                              src={branding.stampUrl}
                              alt="Stamp"
                              className="max-h-10 max-w-[70px] object-contain opacity-90"
                              style={{ transform: `scale(${branding.stampScale || 1})` }}
                            />
                          )}
                          {showSignature && branding.signatureUrl && (
                            <img
                              src={branding.signatureUrl}
                              alt="Signature"
                              className="max-h-10 max-w-[110px] object-contain"
                              style={{ transform: `scale(${branding.signatureScale || 1})` }}
                            />
                          )}
                        </div>

                        <p className="text-[9.5px] font-bold text-slate-900 uppercase tracking-wider border-t border-slate-300 pt-0.5 mt-0.5">
                          Authorised Signatory
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ================= STATUTORY CIN & FOOTER (ON ALL PAGES) ================= */}
              <div className="border-t-2 border-slate-900 bg-slate-100/80 p-1.5 px-3 text-[9.5px] text-slate-700 flex flex-wrap justify-between items-center gap-2">
                <div>
                  <strong className="text-slate-900 mr-1">Head Office:</strong>
                  <span>{fullBusinessAddress || 'As per Registered Business Profile'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <strong className="text-slate-900 mr-1">CIN NO:</strong>
                    <span className="font-mono font-semibold">
                      {(business as any).cin || (business.pan ? `PAN: ${business.pan}` : 'CIN ZZZZDEDDDDDDDDD')}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded text-[9px]">
                    Page {chunk.pageNumber} of {chunk.totalPages}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
