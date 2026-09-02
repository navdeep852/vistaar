import React, { useState, useEffect } from 'react';
import {
  Building,
  Save,
  Upload,
  Trash2,
  CheckCircle,
  Eye,
  CreditCard,
  FileText,
  Palette,
  Sparkles,
  RotateCcw,
  Sliders,
  Check,
  Users,
  ShieldCheck,
  KeyRound,
  Copy,
  CheckCircle2,
  Lock,
  Laptop,
  Activity,
  UserPlus,
  AlertTriangle,
  Camera,
  User,
} from 'lucide-react';
import { businessSettingsService } from '../services/supabase';
import { supabaseAuthService as auth } from '../services/supabaseAuth';
import { store } from '../services/store';
import { showToast } from '../components/Toast';
import { DocumentRenderer } from '../components/DocumentRenderer';
import { DOCUMENT_FONTS, FontFamily } from '../types/template';
import { ThemeToggle } from '../components/ThemeToggle';
import { validatePassword } from '../lib/passwordPolicy';
import { Modal } from '../components/Modal';
import { UserAccount, UserRole, EmployeeStatus } from '../types';
import { PasswordRequirementsWidget } from './LoginView';
import { PasswordInput } from '../components/PasswordInput';
import { UserAvatar } from '../components/UserAvatar';
import { ImageCropModal } from '../components/ImageCropModal';
import { getUserInitials } from '../lib/utils';
import { PhoneInput } from '../components/PhoneInput';
import { validateIndianPhoneNumber, isValidIndianPhoneNumber, normalizeIndianPhoneNumber, formatIndianPhoneNumber } from '../lib/phoneUtils';

export const SettingsView: React.FC = () => {
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const [formData, setFormData] = useState<any>({
    legal_name: '',
    businessName: '',
    phone: '',
    alternate_phone: '',
    alternatePhone: '',
    email: '',
    gstin: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    business_type: 'Private Limited',
    businessType: 'Private Limited',
    owner_name: '',
    ownerName: '',
    reg_number: '',
    regNumber: '',
    logo_url: '',
    logoUrl: '',
    logo_scale: 1,
    logoScale: 1,
    logo_alignment: 'left',
    logoAlignment: 'left',
    signature_url: '',
    signatureUrl: '',
    signature_scale: 1,
    signatureScale: 1,
    signature_alignment: 'right',
    signatureAlignment: 'right',
    stamp_url: '',
    stampUrl: '',
    stamp_scale: 1,
    stampScale: 1,
    stamp_alignment: 'right',
    stampAlignment: 'right',
    bank_details: {
      bankName: '',
      accountHolder: '',
      accountNo: '',
      ifscCode: '',
      branch: '',
      upiId: '',
    },
    bankDetails: {
      bankName: '',
      accountHolder: '',
      accountNo: '',
      ifscCode: '',
      branch: '',
      upiId: '',
    },
    show_bank_on_invoice: true,
    showBankDetailsOnInvoice: true,
    show_bank_on_quotation: true,
    showBankDetailsOnQuotation: true,
    currency: '₹',
    default_tax_mode: 'Exclusive',
    defaultTaxMode: 'Exclusive',
    invoice_prefix: 'INV-',
    invoicePrefix: 'INV-',
    quotation_prefix: 'QT-',
    quotationPrefix: 'QT-',
    default_payment_terms: 'Net 15',
    defaultPaymentTerms: 'Net 15',
    default_quotation_validity: '15 Days',
    defaultQuotationValidity: '15 Days',
    default_font: 'Inter',
    defaultFont: 'Inter',
    default_orientation: 'portrait',
    defaultOrientation: 'portrait',
    default_invoice_terms: '',
    defaultInvoiceTerms: '',
    default_quotation_terms: '',
    defaultQuotationTerms: '',
    terms_and_conditions: '',
    termsAndConditions: '',
  });
  const [activeSubTab, setActiveSubTab] = useState<
    'profile' | 'info' | 'branding' | 'bank' | 'defaults' | 'employees' | 'security' | 'terms' | 'preview'
  >('profile');

  // Personal Profile State
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileDept, setProfileDept] = useState('');
  const [profileDesig, setProfileDesig] = useState('');

  const [phoneError, setPhoneError] = useState('');
  const [alternatePhoneError, setAlternatePhoneError] = useState('');
  const [profilePhoneError, setProfilePhoneError] = useState('');

  // Profile Photo Upload / Crop / Remove Modal States
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedRawImage, setSelectedRawImage] = useState<string | null>(null);
  const [removePhotoModalOpen, setRemovePhotoModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Employee State
  const [employees, setEmployees] = useState<UserAccount[]>([]);
  const [addEmpModalOpen, setAddEmpModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('Sales & Billing');
  const [newEmpDesig, setNewEmpDesig] = useState('Billing Associate');
  const [newEmpRole, setNewEmpRole] = useState<UserRole>('employee');

  // Created Employee Credentials Dialog State
  const [createdEmpCreds, setCreatedEmpCreds] = useState<{ empId: string; tempPass: string; name: string } | null>(null);

  // Security / Change Password State
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');

  // Active Sessions & Login Activity State
  const [activeSessions, setActiveSessions] = useState(auth.getActiveSessions());
  const [loginLogs, setLoginLogs] = useState(auth.getLoginActivity());

  const loadSettings = async () => {
    const { data, success } = await businessSettingsService.getSettings();
    if (success && data) {
      const legalName = data.legal_name ?? data.businessName ?? '';
      const altPhone = data.alternate_phone ?? data.alternatePhone ?? '';
      const bType = data.business_type ?? data.businessType ?? 'Private Limited';
      const oName = data.owner_name ?? data.ownerName ?? '';
      const rNum = data.reg_number ?? data.regNumber ?? '';
      const lUrl = data.logo_url ?? data.logoUrl ?? '';
      const lScale = data.logo_scale ?? data.logoScale ?? 1;
      const lAlign = data.logo_alignment ?? data.logoAlignment ?? 'left';
      const sUrl = data.signature_url ?? data.signatureUrl ?? '';
      const sScale = data.signature_scale ?? data.signatureScale ?? 1;
      const stUrl = data.stamp_url ?? data.stampUrl ?? '';
      const stScale = data.stamp_scale ?? data.stampScale ?? 1;
      const bDetails = data.bank_details ?? data.bankDetails ?? {
        bankName: '',
        accountHolder: '',
        accountNo: '',
        ifscCode: '',
        branch: '',
        upiId: '',
      };
      const showBankInv = data.show_bank_on_invoice ?? data.showBankDetailsOnInvoice ?? true;
      const showBankQuot = data.show_bank_on_quotation ?? data.showBankDetailsOnQuotation ?? true;
      const taxMode = data.default_tax_mode ?? data.defaultTaxMode ?? 'Exclusive';
      const invPrefix = data.invoice_prefix ?? data.invoicePrefix ?? 'INV-';
      const quotPrefix = data.quotation_prefix ?? data.quotationPrefix ?? 'QT-';
      const payTerms = data.default_payment_terms ?? data.defaultPaymentTerms ?? 'Net 15';
      const quotValid = data.default_quotation_validity ?? data.defaultQuotationValidity ?? '15 Days';
      const font = data.default_font ?? data.defaultFont ?? 'Inter';
      const orient = data.default_orientation ?? data.defaultOrientation ?? 'portrait';
      const invTerms = data.default_invoice_terms ?? data.defaultInvoiceTerms ?? data.terms_and_conditions ?? data.termsAndConditions ?? '';
      const quotTerms = data.default_quotation_terms ?? data.defaultQuotationTerms ?? '';
      const termsCond = data.terms_and_conditions ?? data.termsAndConditions ?? data.default_invoice_terms ?? data.defaultInvoiceTerms ?? '';

      const normalized = {
        ...data,
        legal_name: legalName,
        businessName: legalName,
        legalName: legalName,
        phone: data.phone ?? '',
        email: data.email ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        pincode: data.pincode ?? '',
        gstin: data.gstin ?? '',
        pan: data.pan ?? '',
        website: data.website ?? '',
        alternate_phone: altPhone,
        alternatePhone: altPhone,
        business_type: bType,
        businessType: bType,
        owner_name: oName,
        ownerName: oName,
        reg_number: rNum,
        regNumber: rNum,
        logo_url: lUrl,
        logoUrl: lUrl,
        logo_scale: lScale,
        logoScale: lScale,
        logo_alignment: lAlign,
        logoAlignment: lAlign,
        signature_url: sUrl,
        signatureUrl: sUrl,
        signature_scale: sScale,
        signatureScale: sScale,
        stamp_url: stUrl,
        stampUrl: stUrl,
        stamp_scale: stScale,
        stampScale: stScale,
        bank_details: bDetails,
        bankDetails: bDetails,
        show_bank_on_invoice: showBankInv,
        showBankDetailsOnInvoice: showBankInv,
        show_bank_on_quotation: showBankQuot,
        showBankDetailsOnQuotation: showBankQuot,
        default_tax_mode: taxMode,
        defaultTaxMode: taxMode,
        invoice_prefix: invPrefix,
        invoicePrefix: invPrefix,
        quotation_prefix: quotPrefix,
        quotationPrefix: quotPrefix,
        default_payment_terms: payTerms,
        defaultPaymentTerms: payTerms,
        default_quotation_validity: quotValid,
        defaultQuotationValidity: quotValid,
        default_font: font,
        defaultFont: font,
        default_orientation: orient,
        defaultOrientation: orient,
        default_invoice_terms: invTerms,
        defaultInvoiceTerms: invTerms,
        default_quotation_terms: quotTerms,
        defaultQuotationTerms: quotTerms,
        terms_and_conditions: termsCond,
        termsAndConditions: termsCond,
      };

      setFormData(normalized);
      store.updateSettings(normalized);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initData = async () => {
      const usr = auth.getUser();
      setCurrentUser(usr);
      if (usr) {
        setProfileName(usr.name || '');
        setProfilePhone(usr.phone || '');
        setProfileDept(usr.department || '');
        setProfileDesig(usr.designation || '');
      }
      const emps = await auth.loadEmployees();
      if (isMounted) {
        setEmployees(emps);
        setActiveSessions(auth.getActiveSessions());
        setLoginLogs(auth.getLoginActivity());
      }
      await loadSettings();
    };

    initData();

    // Subscribe ONLY to auth user/session changes (do NOT re-run loadSettings during editing)
    const unsubscribe = auth.subscribe(() => {
      if (!isMounted) return;
      const usr = auth.getUser();
      setCurrentUser(usr);
      setActiveSessions(auth.getActiveSessions());
      setLoginLogs(auth.getLoginActivity());
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let hasErr = false;

    if (formData.phone && !isValidIndianPhoneNumber(formData.phone, false)) {
      setPhoneError('Enter a valid 10-digit mobile number starting with 6–9.');
      hasErr = true;
    } else {
      setPhoneError('');
    }

    const altPhone = formData.alternate_phone ?? formData.alternatePhone ?? '';
    if (altPhone && !isValidIndianPhoneNumber(altPhone, false)) {
      setAlternatePhoneError('Enter a valid 10-digit mobile number starting with 6–9.');
      hasErr = true;
    } else {
      setAlternatePhoneError('');
    }

    if (hasErr) {
      if (formData.phone && !isValidIndianPhoneNumber(formData.phone, false)) {
        document.getElementById('settings-phone')?.focus();
      } else {
        document.getElementById('settings-alt-phone')?.focus();
      }
      return;
    }
    const cleanFormData = {
      ...formData,
      legal_name: formData.legal_name ?? formData.businessName ?? '',
      phone: formData.phone ? normalizeIndianPhoneNumber(formData.phone) : '',
      alternate_phone: altPhone ? normalizeIndianPhoneNumber(altPhone) : '',
    };

    const res = await businessSettingsService.updateSettings(cleanFormData);
    if (res.success) {
      await loadSettings();
      store.updateSettings(cleanFormData);
      showToast('Business Profile & Document Branding saved successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to save settings.', 'error');
    }
  };

  // Asset Upload with Format & Size Validation (<5MB)
  const handleAssetUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'logo' | 'signature' | 'stamp'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be under 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (type === 'logo') {
        setFormData((prev: any) => ({ ...prev, logo_url: url, logoUrl: url }));
      } else if (type === 'signature') {
        setFormData((prev: any) => ({ ...prev, signature_url: url, signatureUrl: url }));
      } else if (type === 'stamp') {
        setFormData((prev: any) => ({ ...prev, stamp_url: url, stampUrl: url }));
      }
      showToast(`${type.toUpperCase()} uploaded successfully! Remember to save settings.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAsset = (type: 'logo' | 'signature' | 'stamp') => {
    if (type === 'logo') setFormData((prev: any) => ({ ...prev, logo_url: '', logoUrl: '' }));
    if (type === 'signature') setFormData((prev: any) => ({ ...prev, signature_url: '', signatureUrl: '' }));
    if (type === 'stamp') setFormData((prev: any) => ({ ...prev, stamp_url: '', stampUrl: '' }));
    showToast(`Removed business ${type}.`, 'info');
  };

  // Profile Photo Upload Handler with Format & Size Validation (< 5MB)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MIME type & file format
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      showToast('Invalid image format. Please upload a JPG, PNG, or WebP image.', 'error');
      return;
    }

    // Validate File Size (< 5 MB)
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      showToast(`Image file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 5 MB.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSelectedRawImage(dataUrl);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleCropComplete = async (croppedDataUrl: string) => {
    setIsUploadingPhoto(true);
    const res = await auth.updateProfilePhoto(croppedDataUrl);
    setIsUploadingPhoto(false);

    if (res.success) {
      showToast('Profile photo updated successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to update profile photo.', 'error');
    }
  };

  const handleConfirmRemovePhoto = async () => {
    const res = await auth.removeProfilePhoto();
    setRemovePhotoModalOpen(false);

    if (res.success) {
      showToast('Profile photo removed. Default initials avatar restored.', 'info');
    } else {
      showToast(res.error || 'Failed to remove profile photo.', 'error');
    }
  };

  const handleSavePersonalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profilePhone && !isValidIndianPhoneNumber(profilePhone, false)) {
      setProfilePhoneError('Enter a valid 10-digit mobile number starting with 6–9.');
      document.getElementById('profile-phone')?.focus();
      return;
    } else {
      setProfilePhoneError('');
    }
    const cleanPhone = profilePhone ? normalizeIndianPhoneNumber(profilePhone) : '';
    const res = await auth.updateUserProfile({
      name: profileName,
      phone: cleanPhone,
      department: profileDept,
      designation: profileDesig,
    });

    if (res.success) {
      showToast('Personal Profile updated successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to update profile.', 'error');
    }
  };

  // Add Employee Handler
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmpPhone && !isValidIndianPhoneNumber(newEmpPhone, false)) {
      showToast('Please enter a valid 10-digit Indian phone number for the employee.', 'error');
      return;
    }
    const cleanPhone = newEmpPhone ? normalizeIndianPhoneNumber(newEmpPhone) : '';
    const res = await auth.createEmployee({
      name: newEmpName,
      email: newEmpEmail,
      phone: cleanPhone,
      department: newEmpDept,
      designation: newEmpDesig,
      role: newEmpRole,
    });

    if (res.success && res.empId && res.tempPass) {
      setCreatedEmpCreds({
        empId: res.empId,
        tempPass: res.tempPass,
        name: newEmpName,
      });
      setAddEmpModalOpen(false);
      setNewEmpName('');
      setNewEmpEmail('');
      setNewEmpPhone('');
      showToast(`Employee ${res.empId} created successfully!`, 'success');
    } else {
      showToast(res.error || 'Failed to create employee.', 'error');
    }
  };

  // Change Password Handler
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await auth.changePassword(newPass, confirmNewPass);
    if (res.success) {
      showToast('Password updated successfully!', 'success');
      setCurrentPass('');
      setNewPass('');
      setConfirmNewPass('');
    } else {
      showToast(res.error || 'Failed to change password.', 'error');
    }
  };

  // Toggle Employee Status Handler (Active vs Suspended)
  const handleToggleStatus = async (emp: UserAccount) => {
    const nextStatus: EmployeeStatus = emp.status === 'Active' ? 'Suspended' : 'Active';
    const res = await auth.updateEmployeeStatus(emp.id, nextStatus);
    if (res.success) {
      showToast(`Employee ${emp.employeeId} status updated to ${nextStatus}.`, 'info');
    } else {
      showToast(res.error || 'Failed to update employee status.', 'error');
    }
  };

  // Revoke Other Sessions Handler
  const handleRevokeOtherSessions = async () => {
    const res = await auth.revokeOtherSessions();
    if (res.success) {
      showToast(`Logged out from other active device sessions.`, 'success');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-extrabold tracking-tight">Business Profile & Document Branding</h2>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Configure your workspace details, visual theme, logo, signature, stamp, bank details, and default terms ONCE.
          </p>
        </div>

        <button
          onClick={() => handleSave()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all self-stretch sm:self-auto justify-center"
        >
          <Save className="w-4 h-4" />
          <span>Save Profile</span>
        </button>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'profile', label: '1. Personal Profile', icon: User },
          { id: 'info', label: '2. Business Info', icon: Building },
          { id: 'branding', label: '3. Logo & Signature', icon: Palette },
          { id: 'bank', label: '4. Bank & Payment', icon: CreditCard },
          { id: 'defaults', label: '5. Theme & Defaults', icon: Sliders },
          { id: 'employees', label: '6. Employees & Team', icon: Users },
          { id: 'security', label: '7. Security & Password', icon: ShieldCheck },
          { id: 'terms', label: '8. Default Terms', icon: FileText },
          { id: 'preview', label: '9. Document Preview', icon: Eye },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors border ${
                activeSubTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. PERSONAL PROFILE TAB */}
        {activeSubTab === 'profile' && (
          <div className="space-y-6 animate-fade-in pb-4">
            {/* Profile Photo Section at Top */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span>Personal Profile Photo</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Upload and crop your profile avatar. Appears across headers, sidebars, and activity records.
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                  {currentUser?.employeeId || 'VST-00001'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
                <div className="relative group">
                  <UserAvatar name={currentUser?.name} avatarUrl={currentUser?.avatarUrl} size="2xl" />
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 bg-slate-950/60 rounded-full flex items-center justify-center text-white">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-center sm:text-left flex-1">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{currentUser?.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{currentUser?.email}</p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 mt-1.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase">
                        {currentUser?.role || 'Owner'}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        ID: {currentUser?.employeeId}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
                    <label className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition-all">
                      <Camera className="w-4 h-4" />
                      <span>Change Photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handlePhotoSelect}
                      />
                    </label>

                    {currentUser?.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setRemovePhotoModalOpen(true)}
                        className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove Photo</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Details Form */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Personal Information</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Your personal user account identity details</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Email Address (Account ID)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={currentUser?.email || ''}
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PhoneInput
                  id="profile-phone"
                  label="Phone Number"
                  value={profilePhone}
                  onChange={(val) => {
                    setProfilePhone(val);
                    if (profilePhoneError) setProfilePhoneError('');
                  }}
                  error={profilePhoneError}
                  placeholder="9876543210"
                />

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={profileDept}
                    onChange={(e) => setProfileDept(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={profileDesig}
                    onChange={(e) => setProfileDesig(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSavePersonalProfile}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  Save Personal Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. BUSINESS INFORMATION TAB */}
        {activeSubTab === 'info' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 animate-fade-in transition-colors">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">General Business Details</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Official business information printed on document headers</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Business / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.legal_name ?? ''}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value, businessName: e.target.value, legalName: e.target.value })}
                  placeholder="e.g. VISTAAR Business Solutions"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Legal Registered Name
                </label>
                <input
                  type="text"
                  value={formData.legal_name ?? ''}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value, businessName: e.target.value, legalName: e.target.value })}
                  placeholder="e.g. VISTAAR Tech Pvt Ltd"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Business Type
                </label>
                <select
                  value={formData.business_type ?? 'Private Limited'}
                  onChange={(e) => setFormData({ ...formData, business_type: e.target.value, businessType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="Sole Proprietorship">Sole Proprietorship</option>
                  <option value="Partnership">Partnership</option>
                  <option value="LLP">Limited Liability Partnership (LLP)</option>
                  <option value="Private Limited">Private Limited (Pvt Ltd)</option>
                  <option value="Public Limited">Public Limited</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Owner / Contact Person
                </label>
                <input
                  type="text"
                  value={formData.owner_name ?? ''}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value, ownerName: e.target.value })}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <PhoneInput
                id="settings-phone"
                label="Phone Number *"
                required
                value={formData.phone ?? ''}
                onChange={(val) => {
                  setFormData({ ...formData, phone: val });
                  if (phoneError) setPhoneError('');
                }}
                error={phoneError}
                placeholder="9876543210"
              />

              <PhoneInput
                id="settings-alt-phone"
                label="Alternate Phone / WhatsApp"
                value={formData.alternate_phone ?? ''}
                onChange={(val) => {
                  setFormData({ ...formData, alternate_phone: val, alternatePhone: val });
                  if (alternatePhoneError) setAlternatePhoneError('');
                }}
                error={alternatePhoneError}
                placeholder="9876543210"
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email ?? ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@vistaar.in"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  value={formData.website ?? ''}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://vistaar.app"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  GSTIN Number *
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin ?? ''}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  placeholder="27AAAAA0000A1Z5"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={formData.pan ?? ''}
                  onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                  placeholder="ABCDE1234F"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Business Reg No. (CIN/UDYAM)
                </label>
                <input
                  type="text"
                  value={formData.reg_number ?? ''}
                  onChange={(e) => setFormData({ ...formData, reg_number: e.target.value, regNumber: e.target.value })}
                  placeholder="UDYAM-MH-01-001234"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.address ?? ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Plot 42, Tech Park Sector 5"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">City *</label>
                <input
                  type="text"
                  required
                  value={formData.city ?? ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">State *</label>
                <input
                  type="text"
                  required
                  value={formData.state ?? ''}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">PIN Code *</label>
                <input
                  type="text"
                  required
                  value={formData.pincode ?? ''}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. LOGO, SIGNATURE & STAMP BRANDING ASSETS TAB */}
        {activeSubTab === 'branding' && (
          <div className="space-y-6 animate-fade-in">
            {/* A. COMPANY LOGO */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Company Logo</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Uploaded ONCE at workspace level. Automatically embedded in all new Quotations and Invoices.
                  </p>
                </div>
                {formData.logoUrl ? (
                  <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Active Saved Logo</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-full">
                    No Logo Uploaded
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center flex flex-col items-center justify-center min-h-[140px]">
                  {formData.logoUrl ? (
                    <div className="space-y-3 w-full">
                      <img
                        src={formData.logoUrl}
                        alt="Company Logo"
                        className="max-h-24 mx-auto object-contain"
                        style={{ transform: `scale(${formData.logoScale || 1})` }}
                      />
                      <div className="flex justify-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-700">
                          <span>Replace</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleAssetUpload(e, 'logo')}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset('logo')}
                          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-2 py-4">
                      <Upload className="w-8 h-8 text-blue-500 mx-auto" />
                      <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">Upload Company Logo</span>
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">PNG, JPG, WEBP, SVG (&lt; 5MB)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleAssetUpload(e, 'logo')}
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-8 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Logo Placement / Alignment</label>
                    <div className="flex gap-2">
                      {['left', 'center', 'right'].map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setFormData({ ...formData, logoAlignment: align as any })}
                          className={`flex-1 py-2 text-xs font-bold capitalize rounded-xl border transition-colors ${
                            (formData.logoAlignment || 'left') === align
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {align}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <span>Logo Scale Size</span>
                      <span>{Math.round((formData.logoScale || 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={formData.logoScale || 1}
                      onChange={(e) => setFormData({ ...formData, logoScale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* B. AUTHORIZED SIGNATURE */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Authorized Signature</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Uploaded ONCE at workspace level. Renders above Authorized Signatory line.
                  </p>
                </div>
                {formData.signatureUrl ? (
                  <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Active Saved Signature</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-full">
                    No Signature Uploaded
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center flex flex-col items-center justify-center min-h-[140px]">
                  {formData.signatureUrl ? (
                    <div className="space-y-3 w-full">
                      <img
                        src={formData.signatureUrl}
                        alt="Signature"
                        className="max-h-20 mx-auto object-contain"
                        style={{ transform: `scale(${formData.signatureScale || 1})` }}
                      />
                      <div className="flex justify-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-700">
                          <span>Replace</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleAssetUpload(e, 'signature')}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset('signature')}
                          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-2 py-4">
                      <Upload className="w-8 h-8 text-blue-500 mx-auto" />
                      <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">Upload Signature Image</span>
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">PNG / JPG with transparent bg</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleAssetUpload(e, 'signature')}
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-8 space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <span>Signature Scale Size</span>
                      <span>{Math.round((formData.signatureScale || 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={formData.signatureScale || 1}
                      onChange={(e) => setFormData({ ...formData, signatureScale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* C. OFFICIAL STAMP / SEAL */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Official Stamp / Business Seal</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Uploaded ONCE at workspace level. Embedded next to signatory on official documents.
                  </p>
                </div>
                {formData.stampUrl ? (
                  <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Active Saved Stamp</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-full">
                    No Stamp Uploaded
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center flex flex-col items-center justify-center min-h-[140px]">
                  {formData.stampUrl ? (
                    <div className="space-y-3 w-full">
                      <img
                        src={formData.stampUrl}
                        alt="Official Stamp"
                        className="max-h-20 mx-auto object-contain"
                        style={{ transform: `scale(${formData.stampScale || 1})` }}
                      />
                      <div className="flex justify-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-700">
                          <span>Replace</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleAssetUpload(e, 'stamp')}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset('stamp')}
                          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-2 py-4">
                      <Upload className="w-8 h-8 text-blue-500 mx-auto" />
                      <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">Upload Seal / Stamp Image</span>
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">PNG / JPG (&lt; 5MB)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleAssetUpload(e, 'stamp')}
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-8 space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <span>Stamp Scale Size</span>
                      <span>{Math.round((formData.stampScale || 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={formData.stampScale || 1}
                      onChange={(e) => setFormData({ ...formData, stampScale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. BANK DETAILS TAB */}
        {activeSubTab === 'bank' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 animate-fade-in transition-colors">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Bank & Payment Collection Details</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure bank account details for receiving customer payments</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankDetails.bankName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, bankName: e.target.value },
                    })
                  }
                  placeholder="e.g. HDFC Bank Ltd."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={formData.bankDetails.accountHolder || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, accountHolder: e.target.value },
                    })
                  }
                  placeholder="e.g. VISTAAR Technologies Pvt Ltd"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Account Number</label>
                <input
                  type="text"
                  value={formData.bankDetails.accountNo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, accountNo: e.target.value },
                    })
                  }
                  placeholder="50200012345678"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">IFSC Code</label>
                <input
                  type="text"
                  value={formData.bankDetails.ifscCode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, ifscCode: e.target.value },
                    })
                  }
                  placeholder="HDFC0000240"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Branch Name</label>
                <input
                  type="text"
                  value={formData.bankDetails.branch}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, branch: e.target.value },
                    })
                  }
                  placeholder="Powai Branch, Mumbai"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">UPI ID (GPay / PhonePe / Paytm)</label>
                <input
                  type="text"
                  value={formData.bankDetails.upiId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, upiId: e.target.value },
                    })
                  }
                  placeholder="vistaar@hdfcbank"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.showBankDetailsOnInvoice ?? true}
                  onChange={(e) => setFormData({ ...formData, showBankDetailsOnInvoice: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Show Bank Details on Invoices by default</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.showBankDetailsOnQuotation ?? true}
                  onChange={(e) => setFormData({ ...formData, showBankDetailsOnQuotation: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Show Bank Details on Quotations by default</span>
              </label>
            </div>
          </div>
        )}

        {/* 4. DOCUMENT DEFAULTS TAB */}
        {activeSubTab === 'defaults' && (
          <div className="space-y-6 animate-fade-in">
            {/* Visual Theme Selection Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Application Visual Theme</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Switch between Light and Dark SaaS mode across the entire VISTAAR application.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded-full uppercase">
                  {(localStorage.getItem('vistaar_theme') || 'light').toUpperCase()} Mode Active
                </span>
              </div>
              <div className="pt-1">
                <ThemeToggle variant="segmented" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Default Document Settings</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure default prefixes, currency, fonts, and page rules</p>
                </div>
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Currency Symbol</label>
                <select
                  value={formData.currency ?? '₹'}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value="₹">₹ INR (Indian Rupee)</option>
                  <option value="$">$ USD (US Dollar)</option>
                  <option value="€">€ EUR (Euro)</option>
                  <option value="£">£ GBP (Pound)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Default Tax Mode</label>
                <select
                  value={formData.default_tax_mode ?? formData.defaultTaxMode ?? 'Exclusive'}
                  onChange={(e) => setFormData({ ...formData, default_tax_mode: e.target.value, defaultTaxMode: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="Exclusive">Tax Exclusive (Subtotal + GST)</option>
                  <option value="Inclusive">Tax Inclusive (Prices include GST)</option>
                  <option value="No Tax">No Tax / Tax Exempt</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Invoice Prefix</label>
                <input
                  type="text"
                  value={formData.invoice_prefix ?? formData.invoicePrefix ?? ''}
                  onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value, invoicePrefix: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Quotation Prefix</label>
                <input
                  type="text"
                  value={formData.quotation_prefix ?? formData.quotationPrefix ?? ''}
                  onChange={(e) => setFormData({ ...formData, quotation_prefix: e.target.value, quotationPrefix: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Default Payment Terms</label>
                <select
                  value={formData.default_payment_terms ?? formData.defaultPaymentTerms ?? 'Net 15'}
                  onChange={(e) => setFormData({ ...formData, default_payment_terms: e.target.value, defaultPaymentTerms: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="Immediate">Immediate / Due on Receipt</option>
                  <option value="Net 7">Net 7 Days</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Default Quotation Validity</label>
                <select
                  value={formData.default_quotation_validity ?? formData.defaultQuotationValidity ?? '15 Days'}
                  onChange={(e) => setFormData({ ...formData, default_quotation_validity: e.target.value, defaultQuotationValidity: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="7 Days">7 Days</option>
                  <option value="15 Days">15 Days</option>
                  <option value="30 Days">30 Days</option>
                  <option value="60 Days">60 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Default Document Font</label>
                <select
                  value={formData.default_font ?? formData.defaultFont ?? 'Inter'}
                  onChange={(e) => setFormData({ ...formData, default_font: e.target.value, defaultFont: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {DOCUMENT_FONTS.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: `'${font}', sans-serif` }}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Default Page Orientation</label>
                <select
                  value={formData.default_orientation ?? formData.defaultOrientation ?? 'portrait'}
                  onChange={(e) => setFormData({ ...formData, default_orientation: e.target.value, defaultOrientation: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value="portrait">Portrait (210 × 297 mm)</option>
                  <option value="landscape">Landscape (297 × 210 mm)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* 5. EMPLOYEES & TEAM MANAGEMENT TAB */}
        {activeSubTab === 'employees' && (
          <div className="space-y-5 animate-fade-in pb-4">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Employee & Team Management</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Manage company employees, roles, automatic Employee IDs, and security access states.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAddEmpModalOpen(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Add Employee</span>
              </button>
            </div>

            {/* Employee Table Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Company Directory ({employees.length} Members)
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Unique Employee IDs automatically assigned
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="p-3.5">Employee ID</th>
                      <th className="p-3.5">Name & Email</th>
                      <th className="p-3.5">Phone</th>
                      <th className="p-3.5">Department</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3.5 font-mono font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {emp.employeeId}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-900 dark:text-slate-100 block">{emp.name}</span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{emp.email}</span>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                          {emp.phone ? formatIndianPhoneNumber(emp.phone) : '—'}
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block">{emp.department || 'General'}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{emp.designation || 'Staff'}</span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                              emp.role === 'owner'
                                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60'
                                : emp.role === 'admin'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {emp.role}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                              emp.status === 'Active'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : emp.status === 'Suspended'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {emp.role !== 'owner' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(emp)}
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                emp.status === 'Active'
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/60'
                                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-900/60'
                              }`}
                            >
                              {emp.status === 'Active' ? 'Suspend' : 'Reactivate'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium italic">Owner Access</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 6. SECURITY & PASSWORD MANAGEMENT TAB */}
        {activeSubTab === 'security' && (
          <div className="space-y-6 animate-fade-in pb-4">
            {/* Change Password Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Change Workspace Password</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Verify current password and create a new 12-character secure password.
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangePasswordSubmit} className="space-y-4 max-w-xl">
                <PasswordInput
                  label="Current Password"
                  required
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />

                <PasswordInput
                  label="New Password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Create new 12-character password"
                  autoComplete="new-password"
                />

                <PasswordRequirementsWidget password={newPass} />

                <PasswordInput
                  label="Confirm New Password"
                  required
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Update Password
                </button>
              </form>
            </div>

            {/* Active Sessions Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Active Device Sessions ({activeSessions.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Devices currently authenticated with your account
                  </p>
                </div>

                {activeSessions.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRevokeOtherSessions}
                    className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 font-bold text-xs rounded-xl hover:bg-rose-100"
                  >
                    Log Out Other Devices
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {activeSessions.map((sess, idx) => (
                  <div
                    key={sess.sessionId}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <Laptop className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{sess.deviceInfo}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">
                          Session ID: {sess.sessionId}
                        </span>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      {idx === 0 ? 'Current Session' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Login Activity Audit Log */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Recent Login Activity</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Audit trail of recent authentication attempts for security verification
                </p>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {loginLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                    No activity records logged yet.
                  </p>
                ) : (
                  loginLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {log.emailOrEmployeeId}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">
                          {new Date(log.timestamp).toLocaleString()} • {log.device}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 7. DEFAULT TERMS & CONDITIONS TAB */}
        {activeSubTab === 'terms' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 animate-fade-in transition-colors">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Default Terms & Conditions</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Standard legal and payment terms pre-filled on new documents</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Default Invoice Terms & Conditions
                </label>
                <textarea
                  rows={4}
                  value={formData.default_invoice_terms ?? formData.defaultInvoiceTerms ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_invoice_terms: e.target.value,
                      defaultInvoiceTerms: e.target.value,
                      terms_and_conditions: e.target.value,
                      termsAndConditions: e.target.value,
                    })
                  }
                  className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Default Quotation Terms & Conditions
                </label>
                <textarea
                  rows={4}
                  value={formData.default_quotation_terms ?? formData.defaultQuotationTerms ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_quotation_terms: e.target.value,
                      defaultQuotationTerms: e.target.value,
                    })
                  }
                  className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {/* 6. LIVE DOCUMENT SAMPLE PREVIEW TAB */}
        {activeSubTab === 'preview' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-slate-900 dark:bg-slate-950 text-white p-4 rounded-2xl flex items-center justify-between shadow-md border border-slate-800">
              <span className="text-xs font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Live Workspace Business Profile Document Sample Preview</span>
              </span>
              <span className="text-[10px] text-slate-400">Updates live as you edit business settings</span>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl overflow-x-auto border border-slate-200 dark:border-slate-800 transition-colors">
              <DocumentRenderer
                templateId={formData.defaultInvoiceTemplate || 'inv-modern-blue'}
                documentType="invoice"
                documentNumber="INV-2026-SAMPLE"
                date={new Date().toISOString().split('T')[0]}
                dueDateOrValidUntil={new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]}
                businessName={formData.businessName}
                phone={formData.phone}
                email={formData.email}
                address={formData.address}
                city={formData.city}
                state={formData.state}
                pincode={formData.pincode}
                gstin={formData.gstin}
                pan={formData.pan}
                bankDetails={formData.bankDetails}
                customerName="Acme Enterprises Pvt Ltd"
                customerPhone="+91 98222 33344"
                customerEmail="billing@acme.com"
                customerAddress="Building 4, Commerce Zone, Mumbai"
                customerGstin="27XYZAB9999C1Z9"
                items={[
                  {
                    id: '1',
                    productName: 'Professional Business Consulting & Setup',
                    quantity: 1,
                    sellingPrice: 15000,
                    buyPrice: 0,
                    discountAmount: 1000,
                    taxPercent: 18,
                    taxAmount: 2520,
                    total: 16520,
                    unit: 'Services',
                  },
                  {
                    id: '2',
                    productName: 'Hardware Terminal Workstation Batch',
                    quantity: 2,
                    sellingPrice: 12000,
                    buyPrice: 0,
                    discountAmount: 0,
                    taxPercent: 18,
                    taxAmount: 4320,
                    total: 28320,
                    unit: 'Pcs',
                  },
                ]}
                subtotal={39000}
                discountTotal={1000}
                taxTotal={6840}
                grandTotal={44840}
                paidAmount={10000}
                balanceAmount={34840}
                currency={formData.currency}
                notes="Sample live document preview using saved business profile and logo."
                terms={formData.defaultInvoiceTerms || formData.termsAndConditions}
                branding={{
                  logoUrl: formData.logoUrl,
                  logoAlignment: formData.logoAlignment || 'left',
                  logoScale: formData.logoScale || 1,
                  signatureUrl: formData.signatureUrl,
                  signatureScale: formData.signatureScale || 1,
                  stampUrl: formData.stampUrl,
                  stampScale: formData.stampScale || 1,
                }}
                customization={{
                  fontFamily: (formData.defaultFont as FontFamily) || 'Inter',
                  headingFont: (formData.defaultFont as FontFamily) || 'Inter',
                  bodyFont: (formData.defaultFont as FontFamily) || 'Inter',
                  fontScale: 'standard',
                  primaryColor: formData.brandColor || '#2563eb',
                  secondaryColor: '#3b82f6',
                  accentColor: '#3b82f6',
                  textColor: '#0f172a',
                  showGstin: true,
                  showPan: true,
                  showHsnSac: true,
                  showBankDetails: formData.showBankDetailsOnInvoice ?? true,
                  showUpi: true,
                  showSignature: true,
                  showStamp: true,
                  showTerms: true,
                  showNotes: true,
                  showDueDate: true,
                  businessAlignment: 'left',
                  titleAlignment: 'right',
                  orientation: formData.defaultOrientation || 'portrait',
                }}
              />
            </div>
          </div>
        )}

        {/* Save Bar */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Business Profile & Branding</span>
          </button>
        </div>
      </form>

      {/* ==================== ADD EMPLOYEE MODAL ==================== */}
      <Modal
        isOpen={addEmpModalOpen}
        onClose={() => setAddEmpModalOpen(false)}
        title="👤 Register New Employee & Generate Credentials"
        maxWidth="md"
      >
        <form onSubmit={handleAddEmployeeSubmit} className="space-y-4 text-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 rounded-xl space-y-1">
            <span className="font-bold block">Automatic Employee ID & Credentials</span>
            <p className="text-[11px]">
              VISTAAR will automatically assign a unique Employee ID (e.g. VST-00027) and generate a secure temporary password. The employee will be forced to set their permanent password on first login.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase">
              Full Employee Name *
            </label>
            <input
              type="text"
              required
              value={newEmpName}
              onChange={(e) => setNewEmpName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase">
                Work Email Address *
              </label>
              <input
                type="email"
                required
                value={newEmpEmail}
                onChange={(e) => setNewEmpEmail(e.target.value)}
                placeholder="ramesh@company.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
              />
            </div>

            <PhoneInput
              label="Phone Number *"
              required
              value={newEmpPhone}
              onChange={setNewEmpPhone}
              placeholder="9876543210"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase">
                Department
              </label>
              <input
                type="text"
                value={newEmpDept}
                onChange={(e) => setNewEmpDept(e.target.value)}
                placeholder="Sales / Accounts"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase">
                Designation
              </label>
              <input
                type="text"
                value={newEmpDesig}
                onChange={(e) => setNewEmpDesig(e.target.value)}
                placeholder="Billing Officer"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase">
                Role Permission *
              </label>
              <select
                value={newEmpRole}
                onChange={(e) => setNewEmpRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-bold"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="employee">Employee / Staff</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAddEmpModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md"
            >
              Create Employee & Issue ID
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== CREATED EMPLOYEE CREDENTIALS DIALOG ==================== */}
      {createdEmpCreds && (
        <Modal
          isOpen={!!createdEmpCreds}
          onClose={() => setCreatedEmpCreds(null)}
          title="🎉 Employee Created & Credentials Issued"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-emerald-900 dark:text-emerald-200 space-y-1">
              <span className="font-extrabold text-sm block">Account Ready for {createdEmpCreds.name}</span>
              <p className="text-xs">
                Provide the credentials below to the employee. They will log in using their Employee ID and this temporary password, then set their permanent password.
              </p>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-bold">Assigned Employee ID:</span>
                <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                  {createdEmpCreds.empId}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-bold">Temporary Password:</span>
                <div className="flex items-center gap-2 font-mono font-bold text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <span>{createdEmpCreds.tempPass}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`Employee ID: ${createdEmpCreds.empId}\nTemporary Password: ${createdEmpCreds.tempPass}`);
                      showToast('Credentials copied to clipboard!', 'success');
                    }}
                    className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/80 rounded transition-colors text-amber-700 dark:text-amber-300"
                    title="Copy Credentials"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedEmpCreds(null)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md"
              >
                Done / Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== CROP & POSITIONING IMAGE MODAL ==================== */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => setCropModalOpen(false)}
        imageSrc={selectedRawImage}
        onCropComplete={handleCropComplete}
      />

      {/* ==================== REMOVE PROFILE PHOTO CONFIRMATION MODAL ==================== */}
      <Modal
        isOpen={removePhotoModalOpen}
        onClose={() => setRemovePhotoModalOpen(false)}
        title="⚠️ Remove Profile Photo"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Remove your profile photo? Your avatar will reset to your default initials badge (e.g.{' '}
            <strong className="font-extrabold text-blue-600 dark:text-blue-400">
              {getUserInitials(currentUser?.name)}
            </strong>
            ). This will not affect any user account details or business records.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setRemovePhotoModalOpen(false)}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemovePhoto}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
            >
              Remove Photo
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

