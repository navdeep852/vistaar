import React, { useState, useEffect } from 'react';
import {
  FileText,
  Truck,
  MapPin,
  Package,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  ArrowLeft,
  Building2,
  Bus,
  ShieldAlert,
} from 'lucide-react';
import {
  EwayBill,
  EwayBillDocumentType,
  EwayBillItem,
  Invoice,
  SubSupplyType,
  SupplyType,
  TransactionType,
  TransportMode,
  VehicleType,
} from '../../types';
import { EwayBillEligibilityEngine } from '../../services/ewayBillEligibilityEngine';
import { ewayBillApiService } from '../../services/ewayBillApiService';
import { ewayBillService, businessSettingsService, locationService } from '../../services/supabase';

interface CreateEwayBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
  onSuccess?: (ewb: EwayBill) => void;
}

export const CreateEwayBillModal: React.FC<CreateEwayBillModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Transaction & Document
  const [documentType, setDocumentType] = useState<EwayBillDocumentType>('INV');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplyType, setSupplyType] = useState<SupplyType>('OUTWARD');
  const [subSupplyType, setSubSupplyType] = useState<SubSupplyType>('SUPPLY');
  const [transactionType, setTransactionType] = useState<TransactionType>('REGULAR');

  // Step 2: Dispatch From (Origin)
  const [fromTradeName, setFromTradeName] = useState('');
  const [fromGstin, setFromGstin] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromState, setFromState] = useState('Uttar Pradesh');
  const [fromPincode, setFromPincode] = useState('');

  // Step 3: Destination / Delivery (Bill To & Ship To)
  const [toTradeName, setToTradeName] = useState('');
  const [toGstin, setToGstin] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [toState, setToState] = useState('');
  const [toPincode, setToPincode] = useState('');
  const [billToGstin, setBillToGstin] = useState('');
  const [shipToGstin, setShipToGstin] = useState('');

  // Step 4: Goods Line Items & Financial Summary
  const [items, setItems] = useState<Partial<EwayBillItem>[]>([]);
  const [totalTaxableValue, setTotalTaxableValue] = useState(0);
  const [cgstAmount, setCgstAmount] = useState(0);
  const [sgstAmount, setSgstAmount] = useState(0);
  const [igstAmount, setIgstAmount] = useState(0);
  const [cessAmount, setCessAmount] = useState(0);
  const [totalInvoiceValue, setTotalInvoiceValue] = useState(0);

  // Step 5: Transport & Vehicle Details
  const [transportMode, setTransportMode] = useState<TransportMode>('ROAD');
  const [transporterGstin, setTransporterGstin] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('REGULAR');
  const [transportDocumentNumber, setTransportDocumentNumber] = useState('');
  const [transportDocumentDate, setTransportDocumentDate] = useState('');
  const [approxDistanceKm, setApproxDistanceKm] = useState(100);

  // Pre-fill from Invoice and Business Settings
  useEffect(() => {
    if (isOpen) {
      const initData = async () => {
        // Load business settings for Dispatch From
        const { data: bSettings } = await businessSettingsService.getBusinessSettings();
        const { data: locations } = await locationService.getLocations();
        const defaultLoc = locations?.find((l) => l.isDefault) || locations?.[0];

        if (defaultLoc) {
          setFromTradeName(defaultLoc.tradeName || defaultLoc.locationName);
          setFromGstin(defaultLoc.gstin || bSettings?.gstin || '');
          setFromAddress(defaultLoc.address);
          setFromState(defaultLoc.state);
          setFromPincode(defaultLoc.pincode);
        } else if (bSettings) {
          setFromTradeName(bSettings.companyName || bSettings.legalName || 'Main Business');
          setFromGstin(bSettings.gstin || '');
          setFromAddress(bSettings.address || '');
          setFromState(bSettings.state || 'Uttar Pradesh');
          setFromPincode(bSettings.pincode || '');
        }

        if (invoice) {
          setDocumentNumber(invoice.invoiceNumber || '');
          setDocumentDate(invoice.date || new Date().toISOString().split('T')[0]);
          setToTradeName(invoice.customerName || '');
          setToGstin(invoice.customerGstin || '');
          setToAddress(invoice.customerAddress || '');
          setToState(invoice.customerAddress?.includes('State:') ? invoice.customerAddress.split('State:')[1].trim() : 'Uttar Pradesh');
          setToPincode('208001');

          setTotalTaxableValue(invoice.subtotal || 0);
          setTotalInvoiceValue(invoice.grandTotal || 0);

          // Split taxes
          const taxTot = invoice.taxTotal || 0;
          if (bSettings?.state && invoice.customerAddress && bSettings.state.toLowerCase() === 'uttar pradesh') {
            setCgstAmount(taxTot / 2);
            setSgstAmount(taxTot / 2);
            setIgstAmount(0);
          } else {
            setIgstAmount(taxTot);
            setCgstAmount(0);
            setSgstAmount(0);
          }

          // Map Items
          const mappedItems: Partial<EwayBillItem>[] = (invoice.items || []).map((it) => ({
            productName: it.productName,
            hsnCode: '8471', // Standard default HSN if unprovided
            quantity: it.quantity,
            unit: it.unit || 'Pcs',
            taxableValue: it.sellingPrice * it.quantity,
            cgstRate: it.taxPercent ? it.taxPercent / 2 : 0,
            cgstAmount: it.taxAmount ? it.taxAmount / 2 : 0,
            sgstRate: it.taxPercent ? it.taxPercent / 2 : 0,
            sgstAmount: it.taxAmount ? it.taxAmount / 2 : 0,
          }));

          setItems(mappedItems.length > 0 ? mappedItems : [{ productName: 'General Goods', hsnCode: '8471', quantity: 1, unit: 'Pcs', taxableValue: invoice.subtotal || 1000 }]);
        } else {
          setDocumentNumber(`INV-${Date.now().toString().slice(-6)}`);
          setItems([{ productName: 'Sample Product', hsnCode: '8471', quantity: 1, unit: 'Pcs', taxableValue: 55000 }]);
          setTotalTaxableValue(55000);
          setTotalInvoiceValue(64900);
          setCgstAmount(4950);
          setSgstAmount(4950);
        }

        setStep(1);
        setErrorMsg(null);
      };

      initData();
    }
  }, [isOpen, invoice]);

  // Recalculate estimated distance when PIN codes change
  useEffect(() => {
    if (fromPincode && toPincode && EwayBillEligibilityEngine.isValidPincode(fromPincode) && EwayBillEligibilityEngine.isValidPincode(toPincode)) {
      const estimated = EwayBillEligibilityEngine.estimateDistanceKm(fromPincode, toPincode);
      setApproxDistanceKm(estimated);
    }
  }, [fromPincode, toPincode]);

  if (!isOpen) return null;

  const currentPayload: Partial<EwayBill> = {
    invoiceId: invoice?.id,
    documentType,
    documentNumber,
    documentDate,
    supplyType,
    subSupplyType,
    transactionType,

    fromGstin,
    fromTradeName,
    fromAddress,
    fromState,
    fromPincode,

    toGstin,
    toTradeName,
    toAddress,
    toState,
    toPincode,
    billToGstin,
    shipToGstin,

    totalTaxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount,
    totalInvoiceValue,

    transportMode,
    transporterGstin,
    transporterName,
    vehicleNumber,
    vehicleType,
    transportDocumentNumber,
    transportDocumentDate,
    approxDistanceKm,

    items: items as any,
  };

  const validation = EwayBillEligibilityEngine.checkEligibility(currentPayload);

  const handleSaveDraft = async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await ewayBillService.createEwayBill(
      {
        ...currentPayload,
        status: 'DRAFT',
      },
      items
    );

    setLoading(false);
    if (error) {
      setErrorMsg(error);
    } else if (data) {
      if (onSuccess) onSuccess(data);
      onClose();
    }
  };

  const handleGenerateOfficialEwayBill = async () => {
    if (validation.blockingErrors.length > 0) {
      setErrorMsg(validation.blockingErrors[0]);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // Step 1: Call Government GSP API Provider
      const apiRes = await ewayBillApiService.generateEwayBill(currentPayload as EwayBill);

      if (!apiRes.success) {
        setErrorMsg(apiRes.error || 'Failed to generate E-Way Bill via Government NIC Gateway.');
        setLoading(false);
        return;
      }

      // Step 2: Persist Generated EWB with official metadata
      const { data, error } = await ewayBillService.createEwayBill(
        {
          ...currentPayload,
          ewayBillNumber: apiRes.ewayBillNumber,
          generatedAt: apiRes.generatedAt,
          validFrom: apiRes.validFrom,
          validUntil: apiRes.validUntil,
          governmentReference: apiRes.governmentReference,
          status: 'ACTIVE',
          lastApiStatus: 'SUCCESS',
        },
        items
      );

      setLoading(false);

      if (error) {
        setErrorMsg(error);
      } else if (data) {
        if (onSuccess) onSuccess(data);
        onClose();
      }
    } catch (e: any) {
      setLoading(false);
      setErrorMsg(e?.message || 'Error communicating with GSP E-Way Bill gateway.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                Generate E-Way Bill
                {invoice && (
                  <span className="px-2 py-0.5 text-xs font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md">
                    #{invoice.invoiceNumber}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                GST Goods Movement Compliance & Transport Certificate Wizard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Header */}
        <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs overflow-x-auto">
          {[
            { num: 1, label: 'Transaction', icon: FileText },
            { num: 2, label: 'Dispatch Origin', icon: MapPin },
            { num: 3, label: 'Destination', icon: Building2 },
            { num: 4, label: 'Goods & Tax', icon: Package },
            { num: 5, label: 'Transport', icon: Bus },
          ].map((s) => {
            const Icon = s.icon;
            const active = step === s.num;
            const completed = step > s.num;
            return (
              <button
                key={s.num}
                onClick={() => setStep(s.num as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : completed
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.num}. {s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Compliance Status Alert */}
          <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 flex items-start gap-3">
            <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${validation.required ? 'text-amber-500' : 'text-blue-500'}`} />
            <div className="text-xs flex-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                Compliance Status: {validation.reason}
              </p>
              {validation.warnings.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400 mt-1">
                  Note: {validation.warnings.join(' ')}
                </p>
              )}
            </div>
          </div>

          {/* STEP 1: Transaction Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                1. Transaction & Document Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Document Type *
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as EwayBillDocumentType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="INV">Tax Invoice</option>
                    <option value="BIL">Bill of Supply</option>
                    <option value="BOE">Bill of Entry</option>
                    <option value="OTH">Others</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Document Number *
                  </label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Document Date *
                  </label>
                  <input
                    type="date"
                    value={documentDate}
                    onChange={(e) => setDocumentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Supply Type *
                  </label>
                  <select
                    value={supplyType}
                    onChange={(e) => setSupplyType(e.target.value as SupplyType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="OUTWARD">Outward Supply</option>
                    <option value="INWARD">Inward Supply</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sub Supply Type *
                  </label>
                  <select
                    value={subSupplyType}
                    onChange={(e) => setSubSupplyType(e.target.value as SubSupplyType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="SUPPLY">Supply</option>
                    <option value="EXPORT">Export</option>
                    <option value="JOB_WORK">Job Work</option>
                    <option value="FOR_OWN_USE">For Own Use</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transaction Type *
                  </label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="REGULAR">Regular</option>
                    <option value="BILL_TO_SHIP_TO">Bill To - Ship To</option>
                    <option value="BILL_FROM_DISPATCH_FROM">Bill From - Dispatch From</option>
                    <option value="BOTH">Combination of Both</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Dispatch Origin */}
          {step === 2 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                2. Dispatch Origin (From)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch Trade Name *
                  </label>
                  <input
                    type="text"
                    value={fromTradeName}
                    onChange={(e) => setFromTradeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch GSTIN
                  </label>
                  <input
                    type="text"
                    value={fromGstin}
                    onChange={(e) => setFromGstin(e.target.value)}
                    placeholder="e.g. 09AABCV1234F1Z5"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch Address *
                  </label>
                  <input
                    type="text"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch State *
                  </label>
                  <input
                    type="text"
                    value={fromState}
                    onChange={(e) => setFromState(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch PIN Code *
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={fromPincode}
                    onChange={(e) => setFromPincode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Destination Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                3. Destination & Delivery (To)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Trade Name *
                  </label>
                  <input
                    type="text"
                    value={toTradeName}
                    onChange={(e) => setToTradeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient GSTIN
                  </label>
                  <input
                    type="text"
                    value={toGstin}
                    onChange={(e) => setToGstin(e.target.value)}
                    placeholder="e.g. 09AABCV9999F1Z9"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Delivery Address *
                  </label>
                  <input
                    type="text"
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Destination State *
                  </label>
                  <input
                    type="text"
                    value={toState}
                    onChange={(e) => setToState(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Destination PIN Code *
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={toPincode}
                    onChange={(e) => setToPincode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Goods & Line Items */}
          {step === 4 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                4. Goods & Tax Breakdown
              </h4>

              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
                  >
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Product Description *
                      </label>
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].productName = e.target.value;
                          setItems(updated);
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        HSN Code *
                      </label>
                      <input
                        type="text"
                        value={item.hsnCode}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].hsnCode = e.target.value;
                          setItems(updated);
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Qty & Unit
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[idx].quantity = Number(e.target.value);
                            setItems(updated);
                          }}
                          className="w-16 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                        />
                        <span className="text-slate-500">{item.unit || 'Pcs'}</span>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Taxable Value (₹) *
                      </label>
                      <input
                        type="number"
                        value={item.taxableValue}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].taxableValue = Number(e.target.value);
                          setItems(updated);
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-semibold"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Tax Summaries */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Total Taxable Value</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    ₹{totalTaxableValue.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">CGST / SGST</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    ₹{(cgstAmount + sgstAmount).toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">IGST</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    ₹{igstAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Invoice Value</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-base">
                    ₹{totalInvoiceValue.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Transportation & Vehicle Details */}
          {step === 5 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                5. Transportation & Vehicle Details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transport Mode *
                  </label>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="ROAD">Road Transport</option>
                    <option value="RAIL">Rail Transport</option>
                    <option value="AIR">Air Cargo</option>
                    <option value="SHIP">Ship / Waterways</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vehicle Number (Road)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UP32AB1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vehicle Cargo Type
                  </label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="REGULAR">Regular Cargo</option>
                    <option value="OVER_DIMENSIONAL_CARGO">Over Dimensional Cargo (ODC)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transporter ID / GSTIN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 29AABCV1234F1Z5"
                    value={transporterGstin}
                    onChange={(e) => setTransporterGstin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transporter Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VRL Logistics"
                    value={transporterName}
                    onChange={(e) => setTransporterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Approx Distance (Km) *
                  </label>
                  <input
                    type="number"
                    value={approxDistanceKm}
                    onChange={(e) => setApproxDistanceKm(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono font-bold"
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Save Draft
            </button>
          </div>

          <div className="flex items-center gap-3">
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as any)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/20"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerateOfficialEwayBill}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                {loading ? 'Generating with NIC Gateway...' : 'Generate Official E-Way Bill'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
