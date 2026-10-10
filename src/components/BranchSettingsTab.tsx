import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Building,
  Plus,
  Edit2,
  Check,
  Shield,
  Users,
  Store,
  Warehouse,
  Factory,
  Briefcase,
  AlertCircle,
  Star,
  Power,
  RefreshCw,
  Search,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRightLeft,
} from 'lucide-react';
import { Branch, BranchType, UserAccount } from '../types';
import { branchService } from '../services/supabase/branchService';
import { useBranch } from '../context/BranchContext';
import { showToast } from './Toast';
import { Modal } from './Modal';
import { auditLogService } from '../services/supabase/auditLogService';

interface BranchSettingsTabProps {
  employees?: UserAccount[];
}

export const BranchSettingsTab: React.FC<BranchSettingsTabProps> = ({ employees = [] }) => {
  const { currentBranch, switchBranch, refreshBranches, isOwner } = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [branchPassword, setBranchPassword] = useState('');
  const [confirmBranchPassword, setConfirmBranchPassword] = useState('');
  const [showBranchPassword, setShowBranchPassword] = useState(false);
  const [formData, setFormData] = useState({
    branchCode: '',
    branchName: '',
    branchType: 'Store' as BranchType,
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    phone: '',
    email: '',
    gstin: '',
    stateCode: '',
    isMainBranch: false,
  });

  // Branch Password Management Modal state (OWNER ONLY)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedBranchForPassword, setSelectedBranchForPassword] = useState<Branch | null>(null);
  const [newBranchPassword, setNewBranchPassword] = useState('');
  const [confirmNewBranchPassword, setConfirmNewBranchPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Employee Assignment & Transfer Modal state (OWNER ONLY)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedEmployeeForTransfer, setSelectedEmployeeForTransfer] = useState<UserAccount | null>(null);
  const [targetBranchIdForTransfer, setTargetBranchIdForTransfer] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const res = await branchService.getBranches({ activeOnly: false });
      if (res.data) {
        setBranches(res.data);
      }
    } catch (err: any) {
      showToast('Failed to load branches: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const openAddModal = () => {
    setEditingBranch(null);
    setBranchPassword('');
    setConfirmBranchPassword('');
    setShowBranchPassword(false);
    setFormData({
      branchCode: '',
      branchName: '',
      branchType: 'Store',
      address: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
      phone: '',
      email: '',
      gstin: '',
      stateCode: '',
      isMainBranch: branches.length === 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setFormData({
      branchCode: b.branchCode,
      branchName: b.branchName,
      branchType: b.branchType || 'Store',
      address: b.address || '',
      city: b.city || '',
      state: b.state || '',
      pincode: b.pincode || '',
      country: b.country || 'India',
      phone: b.phone || '',
      email: b.email || '',
      gstin: b.gstin || '',
      stateCode: b.stateCode || '',
      isMainBranch: Boolean(b.isMainBranch),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branchCode.trim()) {
      showToast('Branch code is required (e.g. DEL, WH-01)', 'error');
      return;
    }
    if (!formData.branchName.trim()) {
      showToast('Branch name is required', 'error');
      return;
    }

    if (!editingBranch) {
      if (!branchPassword.trim()) {
        showToast('Branch access password is required', 'error');
        return;
      }
      if (branchPassword.length < 4) {
        showToast('Branch access password must be at least 4 characters', 'error');
        return;
      }
      if (branchPassword !== confirmBranchPassword) {
        showToast('Branch access passwords do not match', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (editingBranch) {
        const res = await branchService.updateBranch(editingBranch.id, {
          ...formData,
          branchCode: formData.branchCode.toUpperCase().trim(),
        });
        if (res.success) {
          showToast(`Branch '${formData.branchName}' updated successfully!`, 'success');
          setIsModalOpen(false);
          await loadBranches();
          await refreshBranches();
          auditLogService.logSecurityEvent('BRANCH_UPDATED', `Updated branch ${formData.branchName} (${formData.branchCode})`, 'SUCCESS');
        } else {
          showToast(res.error || 'Failed to update branch', 'error');
        }
      } else {
        const res = await branchService.createBranch({
          ...formData,
          branchCode: formData.branchCode.toUpperCase().trim(),
        }, branchPassword);
        if (res.success) {
          showToast(`Branch '${formData.branchName}' created successfully with independent access password!`, 'success');
          setIsModalOpen(false);
          setBranchPassword('');
          setConfirmBranchPassword('');
          await loadBranches();
          await refreshBranches();
          auditLogService.logSecurityEvent('BRANCH_CREATED', `Created branch ${formData.branchName} (${formData.branchCode})`, 'SUCCESS');
        } else {
          showToast(res.error || 'Failed to create branch', 'error');
        }
      }
    } catch (err: any) {
      showToast('Error saving branch: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranchPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchForPassword) return;
    if (!newBranchPassword.trim()) {
      showToast('New branch access password is required', 'error');
      return;
    }
    if (newBranchPassword.length < 4) {
      showToast('Branch access password must be at least 4 characters', 'error');
      return;
    }
    if (newBranchPassword !== confirmNewBranchPassword) {
      showToast('Branch passwords do not match', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await branchService.setBranchPassword(selectedBranchForPassword.id, newBranchPassword);
      if (res.success) {
        showToast(`Access password updated for '${selectedBranchForPassword.branchName}'.`, 'success');
        setIsPasswordModalOpen(false);
        setNewBranchPassword('');
        setConfirmNewBranchPassword('');
        await loadBranches();
        await refreshBranches();
      } else {
        showToast(res.error || 'Failed to update branch password', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleTransferEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForTransfer || !targetBranchIdForTransfer) {
      showToast('Please select a target branch for transfer', 'error');
      return;
    }

    setSavingTransfer(true);
    try {
      const res = await branchService.transferEmployeeBranch(selectedEmployeeForTransfer.id, targetBranchIdForTransfer);
      if (res.success) {
        showToast(`Successfully transferred ${selectedEmployeeForTransfer.name} to target branch`, 'success');
        setIsTransferModalOpen(false);
        await loadBranches();
        await refreshBranches();
      } else {
        showToast(res.error || 'Failed to transfer employee', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleToggleStatus = async (branch: Branch) => {
    if (branch.isMainBranch && branch.status === 'Active') {
      showToast('Cannot deactivate the Primary Main Branch.', 'error');
      return;
    }

    const newStatus = branch.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await branchService.updateBranch(branch.id, { status: newStatus });
      if (res.success) {
        showToast(`Branch marked as ${newStatus}`, 'success');
        await loadBranches();
        await refreshBranches();
      } else {
        showToast(res.error || 'Failed to update status', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const handleSetMain = async (branch: Branch) => {
    if (branch.isMainBranch) return;
    try {
      const res = await branchService.updateBranch(branch.id, { isMainBranch: true, status: 'Active' });
      if (res.success) {
        showToast(`'${branch.branchName}' is now the Primary Main Branch`, 'success');
        await loadBranches();
        await refreshBranches();
      } else {
        showToast(res.error || 'Failed to set main branch', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    }
  };



  const getTypeIcon = (type: BranchType) => {
    switch (type) {
      case 'Warehouse':
        return <Warehouse className="w-4 h-4 text-amber-500" />;
      case 'Factory':
        return <Factory className="w-4 h-4 text-purple-500" />;
      case 'Office':
        return <Briefcase className="w-4 h-4 text-indigo-500" />;
      case 'Store':
      default:
        return <Store className="w-4 h-4 text-blue-500" />;
    }
  };

  const filteredBranches = branches.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      b.branchName.toLowerCase().includes(q) ||
      b.branchCode.toLowerCase().includes(q) ||
      (b.city && b.city.toLowerCase().includes(q)) ||
      (b.state && b.state.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Top Banner & Action */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Multi-Branch & Location Management
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Configure independent stores, offices, warehouses, and tax locations. Control inventory segregation, branch-aware billing, and staff access permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={loadBranches}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Refresh Locations"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Branch / Location</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Total Locations
          </span>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 block">
            {branches.length}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Active Stores & Hubs
          </span>
          <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
            {branches.filter((b) => b.status === 'Active').length}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            Warehouses
          </span>
          <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">
            {branches.filter((b) => b.branchType === 'Warehouse').length}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
            Currently Operating In
          </span>
          <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-2 block truncate">
            {currentBranch ? `${currentBranch.branchName} (${currentBranch.branchCode})` : 'All Branches (HQ)'}
          </span>
        </div>
      </div>

      {/* Locations Directory Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Operating Branches & Warehouses ({filteredBranches.length})
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Historical records remain intact even if a location is deactivated.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-3.5">Branch Code</th>
                <th className="p-3.5">Branch Details</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Location & Contact</th>
                <th className="p-3.5">Tax / GSTIN</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredBranches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 dark:text-slate-500">
                    No branches found matching your search.
                  </td>
                </tr>
              ) : (
                filteredBranches.map((branch) => {
                  const isCurrent = currentBranch?.id === branch.id;
                  return (
                    <tr
                      key={branch.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        isCurrent ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="p-3.5 font-mono font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60">
                          {branch.branchCode}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {branch.branchName}
                          </span>
                          {branch.isMainBranch && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                              <Star className="w-2.5 h-2.5 fill-current" /> HQ / Main
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white">
                              Active Context
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-0.5">
                          Created {new Date(branch.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          {getTypeIcon(branch.branchType)}
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {branch.branchType}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-300">
                        <div>
                          {branch.city || branch.state ? (
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {[branch.city, branch.state].filter(Boolean).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                        {branch.phone && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                            {branch.phone}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">
                        {branch.gstin || <span className="text-slate-400">—</span>}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            branch.status === 'Active'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {branch.status}
                        </span>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(branch)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                            title="Edit Branch"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBranchForPassword(branch);
                                setNewBranchPassword('');
                                setConfirmNewBranchPassword('');
                                setIsPasswordModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 transition-colors"
                              title="Manage Branch Access Password (Owner Only)"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!branch.isMainBranch && (
                            <button
                              type="button"
                              onClick={() => handleSetMain(branch)}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                              title="Make Primary HQ"
                            >
                              Set Main
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={branch.isMainBranch && branch.status === 'Active'}
                            onClick={() => handleToggleStatus(branch)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              branch.status === 'Active'
                                ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30'
                                : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                            title={branch.status === 'Active' ? 'Deactivate Location' : 'Activate Location'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Branch Assignment & Transfer Card */}
      {employees.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card p-6 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
              Staff Location Assignments & Transfers
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Every employee ID is permanently associated with an authorized operating branch. Employees cannot switch branches. Only the Business Owner can transfer an employee to another branch.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {employees.map((emp) => {
              const assignedId = emp.branchId || emp.defaultBranchId;
              const assignedBranch = branches.find((b) => b.id === assignedId);
              return (
                <div
                  key={emp.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30 hover:border-blue-300 dark:hover:border-blue-700 transition-colors gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {emp.name}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 font-bold">
                        {emp.employeeId || 'ID Pending'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                      {emp.role.toUpperCase()} • {emp.email || emp.phone || 'No Contact'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">
                        Operating Branch
                      </span>
                      {emp.role === 'owner' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                          All Locations (Owner)
                        </span>
                      ) : assignedBranch ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          {assignedBranch.branchName} 🔒
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          ⚠ Assignment Required
                        </span>
                      )}
                    </div>

                    {emp.role !== 'owner' && isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployeeForTransfer(emp);
                          setTargetBranchIdForTransfer(assignedId || branches[0]?.id || '');
                          setIsTransferModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 cursor-pointer flex items-center gap-1"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        <span>Transfer</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !saving && setIsModalOpen(false)}
        title={editingBranch ? `Edit Branch: ${editingBranch.branchName}` : 'Add New Branch / Location'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Branch Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. DEL, LKO, WH-01"
                value={formData.branchCode}
                onChange={(e) => setFormData({ ...formData, branchCode: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono uppercase focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Short unique identifier for billing codes</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Branch Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Delhi Central Store"
                value={formData.branchName}
                onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Location Type
              </label>
              <select
                value={formData.branchType}
                onChange={(e) => setFormData({ ...formData, branchType: e.target.value as BranchType })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Store">Store / Retail Outlet</option>
                <option value="Warehouse">Warehouse / Depot</option>
                <option value="Office">Corporate / Regional Office</option>
                <option value="Factory">Manufacturing / Factory</option>
                <option value="Other">Other Facility</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Branch GSTIN
              </label>
              <input
                type="text"
                placeholder="GSTIN (if location-specific)"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono uppercase focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Street Address
            </label>
            <input
              type="text"
              placeholder="Shop/Building No, Street, Landmark"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">City</label>
              <input
                type="text"
                placeholder="e.g. New Delhi"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">State</label>
              <input
                type="text"
                placeholder="e.g. Delhi"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pincode</label>
              <input
                type="text"
                placeholder="e.g. 110001"
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">State Code</label>
              <input
                type="text"
                placeholder="e.g. 07"
                value={formData.stateCode}
                onChange={(e) => setFormData({ ...formData, stateCode: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
              <input
                type="text"
                placeholder="Branch phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                placeholder="branch@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {!editingBranch && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                  Branch Access Security Password <span className="text-rose-500">*</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Each branch has an independent credential required when switching into it. This is completely separate from your VISTAAR account login password.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Branch Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showBranchPassword ? 'text' : 'password'}
                      required
                      placeholder="Min. 4 characters"
                      value={branchPassword}
                      onChange={(e) => setBranchPassword(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBranchPassword(!showBranchPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showBranchPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Confirm Branch Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type={showBranchPassword ? 'text' : 'password'}
                    required
                    placeholder="Repeat branch password"
                    value={confirmBranchPassword}
                    onChange={(e) => setConfirmBranchPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isMainBranch}
                onChange={(e) => setFormData({ ...formData, isMainBranch: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Set as Primary / Main Headquarters Branch
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
            >
              {saving ? 'Saving...' : editingBranch ? 'Update Location' : 'Create Location'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Change / Reset Branch Password Modal (OWNER ONLY) */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => !savingPassword && setIsPasswordModalOpen(false)}
        title={selectedBranchForPassword ? `Security: ${selectedBranchForPassword.branchName}` : 'Branch Security'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveBranchPassword} className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Independent Branch Access Credential</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Only the Business Owner can update this branch's access password. Changing this branch password does not affect any other branch and does not change your VISTAAR login password.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                New Branch Access Password *
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Min. 4 characters"
                  value={newBranchPassword}
                  onChange={(e) => setNewBranchPassword(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Branch Password *
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                placeholder="Repeat new password"
                value={confirmNewBranchPassword}
                onChange={(e) => setConfirmNewBranchPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={savingPassword}
              onClick={() => setIsPasswordModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPassword}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
            >
              {savingPassword ? 'Updating...' : 'Update Branch Password'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Employee Branch Transfer Modal (OWNER ONLY) */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => !savingTransfer && setIsTransferModalOpen(false)}
        title={selectedEmployeeForTransfer ? `Transfer: ${selectedEmployeeForTransfer.name}` : 'Transfer Employee Branch'}
        maxWidth="md"
      >
        <form onSubmit={handleTransferEmployee} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-bold text-xs">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              <span>Permanent Operating Branch Transfer</span>
            </div>
            <p className="text-[11px] text-blue-700 dark:text-blue-400">
              Transferring will immediately switch this employee's active operating branch. Access to the old branch will be revoked instantly.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select New Operating Branch *
            </label>
            <select
              value={targetBranchIdForTransfer}
              onChange={(e) => setTargetBranchIdForTransfer(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branchName} ({b.branchCode}) — {b.branchType}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={savingTransfer}
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingTransfer}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
            >
              {savingTransfer ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
