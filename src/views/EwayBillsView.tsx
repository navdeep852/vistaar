import { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Printer,
  Eye,
  Clock,
  Ban,
  Building2,
  Bus,
  CheckCircle2,
  AlertTriangle,
  FileText,
  AlertCircle,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { EwayBill, EwayBillStatus, Transporter, Vehicle, BusinessLocation } from '../types';
import { ewayBillService } from '../services/supabase';
import { CreateEwayBillModal } from '../components/eway/CreateEwayBillModal';
import { EwayBillDetailsModal } from '../components/eway/EwayBillDetailsModal';
import { UpdateVehicleModal } from '../components/eway/UpdateVehicleModal';
import { ExtendValidityModal } from '../components/eway/ExtendValidityModal';
import { CancelEwayBillModal } from '../components/eway/CancelEwayBillModal';
import { EwayBillPrintModal } from '../components/eway/EwayBillPrintModal';
import { TransportersModal } from '../components/eway/TransportersModal';
import { VehiclesModal } from '../components/eway/VehiclesModal';
import { LocationsModal } from '../components/eway/LocationsModal';

export const EwayBillsView = () => {
  const [activeTab, setActiveTab] = useState<'ewb' | 'transporters' | 'vehicles' | 'locations'>('ewb');
  const [ewayBills, setEwayBills] = useState<EwayBill[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [transportModeFilter, setTransportModeFilter] = useState<string>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isUpdateVehicleModalOpen, setIsUpdateVehicleModalOpen] = useState(false);
  const [isExtendValidityModalOpen, setIsExtendValidityModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const [isTransportersModalOpen, setIsTransportersModalOpen] = useState(false);
  const [isVehiclesModalOpen, setIsVehiclesModalOpen] = useState(false);
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);

  const [selectedEwayBill, setSelectedEwayBill] = useState<EwayBill | null>(null);

  const loadEwayBills = async () => {
    setLoading(true);
    const { data } = await ewayBillService.getEwayBills({
      search,
      status: statusFilter,
      transportMode: transportModeFilter,
    });
    setEwayBills(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadEwayBills();
  }, [search, statusFilter, transportModeFilter]);

  // KPI Calculations
  const totalCount = ewayBills.length;
  const activeCount = ewayBills.filter((e) => e.status === 'ACTIVE').length;
  const expiringCount = ewayBills.filter((e) => e.status === 'EXPIRING_SOON').length;
  const expiredCount = ewayBills.filter((e) => e.status === 'EXPIRED').length;
  const cancelledCount = ewayBills.filter((e) => e.status === 'CANCELLED').length;
  const draftCount = ewayBills.filter((e) => e.status === 'DRAFT').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              E-Way Bills & Logistics Compliance
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              GST Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Indian GST Consignment Certificate Management, Transporters, Vehicles & Movement Auditing
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsTransportersModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <Truck className="w-4 h-4 text-blue-500" />
            Transporters Master
          </button>
          <button
            onClick={() => setIsVehiclesModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <Bus className="w-4 h-4 text-amber-500" />
            Vehicle Master
          </button>
          <button
            onClick={() => setIsLocationsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <Building2 className="w-4 h-4 text-purple-500" />
            Dispatch Points
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            Generate E-Way Bill
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Total EWBs</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono">{totalCount}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <span>Active & Valid</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 font-mono">{activeCount}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold">
            <span>Expiring Soon</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-2 font-mono">{expiringCount}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-semibold">
            <span>Expired</span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 font-mono">{expiredCount}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Cancelled</span>
            <Ban className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-500 dark:text-slate-400 mt-2 font-mono">{cancelledCount}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 text-xs font-semibold">
            <span>Drafts</span>
            <FileText className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2 font-mono">{draftCount}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Search & Filters */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search EWB No, Customer, Vehicle, Inv..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
              <Filter className="w-3.5 h-3.5" />
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="EXPIRING_SOON">Expiring Soon</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
              <span>Mode:</span>
              <select
                value={transportModeFilter}
                onChange={(e) => setTransportModeFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
              >
                <option value="ALL">All Modes</option>
                <option value="ROAD">Road</option>
                <option value="RAIL">Rail</option>
                <option value="AIR">Air</option>
                <option value="SHIP">Ship</option>
              </select>
            </div>

            <button
              onClick={loadEwayBills}
              className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* E-Way Bills Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading E-Way Bills...</div>
          ) : ewayBills.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">No E-Way Bills Found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Generate your first E-Way Bill from an Invoice or create one manually using the button above.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">E-Way Bill No / Document</th>
                  <th className="px-4 py-3">Recipient / Destination</th>
                  <th className="px-4 py-3 text-right font-mono">Value (₹)</th>
                  <th className="px-4 py-3">Transport & Vehicle</th>
                  <th className="px-4 py-3">Valid Until</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ewayBills.map((ewb) => {
                  const isActive = ewb.status === 'ACTIVE';
                  const isCancelled = ewb.status === 'CANCELLED';
                  const isExpired = ewb.status === 'EXPIRED';

                  return (
                    <tr
                      key={ewb.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-950/40 transition-colors"
                    >
                      {/* EWB No / Doc */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {ewb.ewayBillNumber ? `#${ewb.ewayBillNumber}` : 'Draft'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {ewb.documentType} #{ewb.documentNumber} ({ewb.documentDate})
                        </div>
                      </td>

                      {/* Recipient */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{ewb.toTradeName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ewb.toState} — <span className="font-mono">{ewb.toPincode}</span>
                        </div>
                      </td>

                      {/* Consignment Value */}
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ₹{ewb.totalInvoiceValue?.toLocaleString('en-IN')}
                      </td>

                      {/* Transport */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200 uppercase">
                          {ewb.vehicleNumber || 'No Vehicle'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {ewb.transportMode} • {ewb.approxDistanceKm} Km
                        </div>
                      </td>

                      {/* Valid Until */}
                      <td className="px-4 py-3.5">
                        {ewb.validUntil ? (
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {new Date(ewb.validUntil).toLocaleDateString('en-IN')}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {new Date(ewb.validUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : isCancelled
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : isExpired
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {ewb.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedEwayBill(ewb);
                              setIsDetailsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="View Full Compliance Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedEwayBill(ewb);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Print / PDF E-Way Bill"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {isActive && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedEwayBill(ewb);
                                  setIsUpdateVehicleModalOpen(true);
                                }}
                                className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Update Vehicle Number"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedEwayBill(ewb);
                                  setIsCancelModalOpen(true);
                                }}
                                className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Cancel E-Way Bill"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateEwayBillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => loadEwayBills()}
      />

      <EwayBillDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        ewayBill={selectedEwayBill}
        onPrint={(ewb) => {
          setSelectedEwayBill(ewb);
          setIsDetailsModalOpen(false);
          setIsPrintModalOpen(true);
        }}
        onUpdateVehicle={(ewb) => {
          setSelectedEwayBill(ewb);
          setIsDetailsModalOpen(false);
          setIsUpdateVehicleModalOpen(true);
        }}
        onExtendValidity={(ewb) => {
          setSelectedEwayBill(ewb);
          setIsDetailsModalOpen(false);
          setIsExtendValidityModalOpen(true);
        }}
        onCancel={(ewb) => {
          setSelectedEwayBill(ewb);
          setIsDetailsModalOpen(false);
          setIsCancelModalOpen(true);
        }}
      />

      <UpdateVehicleModal
        isOpen={isUpdateVehicleModalOpen}
        onClose={() => setIsUpdateVehicleModalOpen(false)}
        ewayBill={selectedEwayBill}
        onSuccess={() => loadEwayBills()}
      />

      <ExtendValidityModal
        isOpen={isExtendValidityModalOpen}
        onClose={() => setIsExtendValidityModalOpen(false)}
        ewayBill={selectedEwayBill}
        onSuccess={() => loadEwayBills()}
      />

      <CancelEwayBillModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        ewayBill={selectedEwayBill}
        onSuccess={() => loadEwayBills()}
      />

      <EwayBillPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        ewayBill={selectedEwayBill}
      />

      <TransportersModal
        isOpen={isTransportersModalOpen}
        onClose={() => setIsTransportersModalOpen(false)}
      />

      <VehiclesModal
        isOpen={isVehiclesModalOpen}
        onClose={() => setIsVehiclesModalOpen(false)}
      />

      <LocationsModal
        isOpen={isLocationsModalOpen}
        onClose={() => setIsLocationsModalOpen(false)}
      />
    </div>
  );
};
