import React, { useState, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Download,
  Settings2,
  Table,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Supplier, ImportPreviewRow } from '../../types';
import { supplierCatalogueService } from '../../services/supabase/supplierCatalogueService';
import { showToast } from '../Toast';

interface UploadCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSuccess: () => void;
}

type Step = 'FILE_SELECT' | 'COLUMN_MAPPING' | 'PREVIEW' | 'COMPLETE';

const VISTAAR_TARGET_FIELDS = [
  { key: 'productName', label: 'Product Name', required: true },
  { key: 'supplierProductCode', label: 'Supplier Product Code / Item Code', required: false },
  { key: 'partNumber', label: 'Part Number', required: false },
  { key: 'purchasePrice', label: 'Purchase Price / Rate', required: false },
  { key: 'uom', label: 'Unit / UOM', required: false },
  { key: 'gstRate', label: 'GST Rate %', required: false },
  { key: 'hsnSac', label: 'HSN / SAC Code', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'description', label: 'Description / Specs', required: false },
  { key: 'mrp', label: 'MRP', required: false },
  { key: 'barcode', label: 'Barcode', required: false },
];

export const UploadCatalogueModal: React.FC<UploadCatalogueModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('FILE_SELECT');
  const [loading, setLoading] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Parsed File State
  const [uploadedFileRecordId, setUploadedFileRecordId] = useState<string | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Mapping State: File Header -> VISTAAR Target Field Key
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Preview & Results State
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [importResults, setImportResults] = useState<{
    importedCount: number;
    updatedCount: number;
    failedCount: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('FILE_SELECT');
      setSelectedFile(null);
      setUploadedFileRecordId(null);
      setFileHeaders([]);
      setRawRows([]);
      setMapping({});
      setPreviewRows([]);
      setImportResults(null);
      if (suppliers.length > 0) {
        setSupplierId(suppliers[0].id);
      }
    }
  }, [isOpen, suppliers]);

  if (!isOpen) return null;

  // ----------------------------------------------------
  // STEP 1: Handle File Selection & Parse
  // ----------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        showToast('Please upload a valid Excel (.xlsx, .xls) or CSV (.csv) file.', 'error');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleProceedToMapping = async () => {
    if (!supplierId) {
      showToast('Please select a supplier.', 'error');
      return;
    }
    if (!selectedFile) {
      showToast('Please select a file to upload.', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Upload original file to Supabase Storage
      const uploadRes = await supplierCatalogueService.uploadFile(supplierId, selectedFile);
      if (uploadRes.error || !uploadRes.data) {
        showToast(uploadRes.error || 'Failed to upload file.', 'error');
        setLoading(false);
        return;
      }
      setUploadedFileRecordId(uploadRes.data.id);

      // 2. Parse file headers & rows using SheetJS
      const parseRes = await supplierCatalogueService.parseFile(selectedFile);
      if (parseRes.error || parseRes.headers.length === 0) {
        showToast(parseRes.error || 'No data found in file.', 'error');
        setLoading(false);
        return;
      }

      setFileHeaders(parseRes.headers);
      setRawRows(parseRes.rows);

      // 3. Auto-suggest column mappings based on saved history or exact name match
      const savedMap = await supplierCatalogueService.getSavedMapping(supplierId);
      const initialMap: Record<string, string> = {};

      parseRes.headers.forEach((header) => {
        if (savedMap && savedMap[header]) {
          initialMap[header] = savedMap[header];
        } else {
          const lowerH = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (lowerH.includes('product') || lowerH.includes('itemname') || lowerH.includes('description')) {
            initialMap[header] = 'productName';
          } else if (lowerH.includes('part') || lowerH.includes('partno')) {
            initialMap[header] = 'partNumber';
          } else if (lowerH.includes('code') || lowerH.includes('itemcode') || lowerH.includes('sku')) {
            initialMap[header] = 'supplierProductCode';
          } else if (lowerH.includes('price') || lowerH.includes('rate') || lowerH.includes('cost')) {
            initialMap[header] = 'purchasePrice';
          } else if (lowerH.includes('uom') || lowerH.includes('unit')) {
            initialMap[header] = 'uom';
          } else if (lowerH.includes('gst') || lowerH.includes('tax')) {
            initialMap[header] = 'gstRate';
          } else if (lowerH.includes('hsn') || lowerH.includes('sac')) {
            initialMap[header] = 'hsnSac';
          } else if (lowerH.includes('brand')) {
            initialMap[header] = 'brand';
          } else if (lowerH.includes('mrp')) {
            initialMap[header] = 'mrp';
          } else if (lowerH.includes('barcode')) {
            initialMap[header] = 'barcode';
          } else {
            initialMap[header] = 'IGNORE';
          }
        }
      });

      setMapping(initialMap);
      setStep('COLUMN_MAPPING');
    } catch (err: any) {
      showToast(err?.message || 'Error processing file.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // STEP 2: Handle Column Mapping & Generate Preview
  // ----------------------------------------------------
  const handleMapField = (header: string, fieldKey: string) => {
    setMapping((prev) => ({ ...prev, [header]: fieldKey }));
  };

  const handleProceedToPreview = async () => {
    // Check if Product Name is mapped
    const hasProductName = Object.values(mapping).includes('productName');
    if (!hasProductName) {
      showToast('Column Mapping Error: You MUST map at least one column to "Product Name".', 'error');
      return;
    }

    setLoading(true);
    try {
      // Save mapping preference for this supplier
      await supplierCatalogueService.saveMapping(supplierId, mapping);

      // Generate preview & validation
      const previewRes = await supplierCatalogueService.prepareImportPreview(supplierId, rawRows, mapping);
      setPreviewRows(previewRes.previewRows);
      setTotalRows(previewRes.totalRows);
      setValidCount(previewRes.validCount);
      setWarningCount(previewRes.warningCount);
      setErrorCount(previewRes.errorCount);

      setStep('PREVIEW');
    } catch (err: any) {
      showToast(err?.message || 'Failed to prepare preview.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // STEP 3: Execute Import
  // ----------------------------------------------------
  const handleExecuteImport = async () => {
    if (!uploadedFileRecordId) return;

    const validToImport = previewRows.filter((r) => r.status !== 'ERROR');
    if (validToImport.length === 0) {
      showToast('No valid rows available to import.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await supplierCatalogueService.importCatalogueData(uploadedFileRecordId, supplierId, validToImport);

      if (!res.success) {
        showToast(res.error || 'Failed to import catalogue data.', 'error');
        setLoading(false);
        return;
      }

      setImportResults({
        importedCount: res.importedCount,
        updatedCount: res.updatedCount,
        failedCount: res.failedCount,
      });

      showToast(`Import completed! ${res.importedCount} new items, ${res.updatedCount} updated.`, 'success');
      setStep('COMPLETE');
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || 'Error executing import.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // Export Error Report
  // ----------------------------------------------------
  const handleDownloadErrorReport = () => {
    const errorRows = previewRows.filter((r) => r.status === 'ERROR' || r.status === 'WARNING');
    if (errorRows.length === 0) return;

    const csvContent =
      'Row,Product Name,Status,Error Message\n' +
      errorRows.map((r) => `"${r.rowNumber}","${r.productName || ''}","${r.status}","${r.errorMessage || ''}"`).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Import_Errors_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl overflow-hidden transition-colors max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Import Supplier Catalogue
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload price list (.xlsx, .csv) & map columns to update supplier products.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${step === 'FILE_SELECT' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white dark:text-slate-950 flex items-center justify-center text-[10px]">1</span>
            <span>Select File</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-700" />
          <div className={`flex items-center gap-2 ${step === 'COLUMN_MAPPING' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white dark:text-slate-950 flex items-center justify-center text-[10px]">2</span>
            <span>Map Columns</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-700" />
          <div className={`flex items-center gap-2 ${step === 'PREVIEW' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white dark:text-slate-950 flex items-center justify-center text-[10px]">3</span>
            <span>Preview & Validate</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-700" />
          <div className={`flex items-center gap-2 ${step === 'COMPLETE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white dark:text-slate-950 flex items-center justify-center text-[10px]">4</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* STEP 1: FILE SELECT */}
          {step === 'FILE_SELECT' && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Supplier <span className="text-rose-500">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} {sup.phone ? `(${sup.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Upload Stock / Price List File <span className="text-rose-500">*</span>
                </label>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-950/40 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {selectedFile ? selectedFile.name : 'Click or Drag & Drop File Here'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Supported formats: Microsoft Excel (.xlsx, .xls), CSV (.csv)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'COLUMN_MAPPING' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Settings2 className="w-4 h-4 shrink-0" />
                <span>
                  Map file column headers to VISTAAR product attributes. <strong>Product Name</strong> is mandatory.
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      <th className="p-3">Uploaded File Column</th>
                      <th className="p-3">Sample Value (Row 1)</th>
                      <th className="p-3">Maps To VISTAAR Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {fileHeaders.map((header) => {
                      const sampleVal = rawRows[0] ? String(rawRows[0][header] ?? '') : '';
                      const selectedFieldKey = mapping[header] || 'IGNORE';

                      return (
                        <tr key={header} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-slate-900 dark:text-white font-mono">{header}</td>
                          <td className="p-3 text-slate-500 dark:text-slate-400 truncate max-w-xs font-mono">
                            {sampleVal || <span className="italic opacity-50">Empty</span>}
                          </td>
                          <td className="p-3">
                            <select
                              value={selectedFieldKey}
                              onChange={(e) => handleMapField(header, e.target.value)}
                              className={`w-full px-3 py-1.5 bg-white dark:bg-slate-900 border ${
                                selectedFieldKey === 'productName'
                                  ? 'border-blue-500 ring-1 ring-blue-500 font-bold text-blue-600 dark:text-blue-400'
                                  : selectedFieldKey !== 'IGNORE'
                                  ? 'border-emerald-500 font-bold text-emerald-600 dark:text-emerald-400'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
                              } rounded-lg text-xs focus:outline-none`}
                            >
                              <option value="IGNORE">-- Ignore Column --</option>
                              {VISTAAR_TARGET_FIELDS.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label} {f.required ? '*' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & VALIDATION */}
          {step === 'PREVIEW' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Rows</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{totalRows}</p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Valid Rows</p>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{validCount}</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Warnings</p>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">{warningCount}</p>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Errors</p>
                  <p className="text-lg font-black text-rose-700 dark:text-rose-300">{errorCount}</p>
                </div>
              </div>

              {errorCount > 0 && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      Found <strong>{errorCount} error rows</strong>. Rows with errors will be skipped during import.
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadErrorReport}
                    className="px-2.5 py-1 bg-white dark:bg-rose-900 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:bg-rose-100"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Error Report</span>
                  </button>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      <th className="p-3 w-12 text-center">Row</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Part No / Code</th>
                      <th className="p-3 text-right">Price</th>
                      <th className="p-3 text-right">GST %</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {previewRows.slice(0, 50).map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 text-center font-mono font-bold text-slate-400">{r.rowNumber}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          {r.productName || <span className="text-rose-500 italic">Empty Name</span>}
                        </td>
                        <td className="p-3 text-slate-500 font-mono">
                          {r.partNumber || r.supplierProductCode || '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {r.purchasePrice !== undefined ? `₹${r.purchasePrice.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono">{r.gstRate !== undefined ? `${r.gstRate}%` : '-'}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              r.action === 'NEW'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : r.action === 'UPDATE'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                : r.action === 'MATCH'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {r.action === 'UPDATE' ? 'Price Update' : r.action === 'MATCH' ? 'Linked Product Match' : r.action}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              r.status === 'VALID'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : r.status === 'WARNING'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETE */}
          {step === 'COMPLETE' && importResults && (
            <div className="py-8 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Catalogue Import Complete!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The supplier stock list has been processed and stored in your VISTAAR catalogue database.
              </p>

              <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl border border-blue-200 dark:border-blue-800">
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400">New Items</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{importResults.importedCount}</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/50 rounded-xl border border-purple-200 dark:border-purple-800">
                  <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400">Updated Prices</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{importResults.updatedCount}</p>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 rounded-xl border border-rose-200 dark:border-rose-800">
                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Skipped/Failed</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">{importResults.failedCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          {step === 'FILE_SELECT' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !selectedFile}
                onClick={handleProceedToMapping}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Upload & Parse File</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'COLUMN_MAPPING' && (
            <>
              <button
                type="button"
                onClick={() => setStep('FILE_SELECT')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleProceedToPreview}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Generate Import Preview</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'PREVIEW' && (
            <>
              <button
                type="button"
                onClick={() => setStep('COLUMN_MAPPING')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Edit Mapping</span>
              </button>
              <button
                type="button"
                disabled={loading || validCount === 0}
                onClick={handleExecuteImport}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Import ({validCount} Valid Rows)</span>
              </button>
            </>
          )}

          {step === 'COMPLETE' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
