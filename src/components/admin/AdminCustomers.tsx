import React, { useState, useEffect, useMemo } from 'react';
import { Customer, PointLedgerEntry, RewardItem, StoreSettings, PointRedemption } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Award,
  History,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  TrendingUp,
  TrendingDown,
  Gift,
  RefreshCw,
  ShoppingBag,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface AdminCustomersProps {
  settings: StoreSettings | null;
  adminUser: { uid: string; name?: string; email?: string } | null;
}

export const AdminCustomers: React.FC<AdminCustomersProps> = ({ settings, adminUser }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<PointLedgerEntry[]>([]);
  const [redemptions, setRedemptions] = useState<PointRedemption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState<number>(10);
  const [adjustType, setAdjustType] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const [isRedeemDiscountOpen, setIsRedeemDiscountOpen] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState<number>(50);
  const [redeemDiscountLoading, setRedeemDiscountLoading] = useState(false);

  const [isRedeemProductOpen, setIsRedeemProductOpen] = useState(false);
  const [selectedRewardId, setSelectedRewardId] = useState<string>('');
  const [redeemProductLoading, setRedeemProductLoading] = useState(false);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formInitialPoints, setFormInitialPoints] = useState(0);
  const [formSaving, setFormSaving] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    try {
      const rewardList = await FirestoreService.getRewards();
      setRewards(rewardList);
    } catch (err: any) {
      console.error('Error loading rewards:', err);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to customers in real-time
    const unsubscribe = FirestoreService.subscribeCustomers((custList) => {
      setCustomers(custList);
      setLoading(false);
      // Keep selectedCustomer synced if opened
      if (selectedCustomer) {
        const updated = custList.find((c) => c.id === selectedCustomer.id);
        if (updated) {
          setSelectedCustomer(updated);
        }
      }
    });

    return () => unsubscribe();
  }, [selectedCustomer?.id]);

  // Real-time subscription for customer's point ledger history
  useEffect(() => {
    if (!isHistoryOpen || !selectedCustomer) return;

    setHistoryLoading(true);
    FirestoreService.getPointRedemptions(selectedCustomer.id, 50)
      .then((reds) => setRedemptions(reds))
      .catch((err) => console.error('Error fetching redemptions:', err));

    const unsubLedger = FirestoreService.subscribeCustomerPointLedger(selectedCustomer.id, (entries) => {
      setLedgerEntries(entries);
      setHistoryLoading(false);
    });

    return () => unsubLedger();
  }, [isHistoryOpen, selectedCustomer?.id]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.whatsapp.includes(searchQuery.replace(/[^0-9]/g, ''));
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, searchQuery, statusFilter]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormAddress('');
    setFormNotes('');
    setFormInitialPoints(0);
    setIsAddEditOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.whatsapp);
    setFormAddress(c.address || '');
    setFormNotes(c.notes || '');
    setIsAddEditOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPhone.trim()) {
      alert('Nomor WhatsApp wajib diisi.');
      return;
    }

    setFormSaving(true);
    setActionFeedback(null);

    try {
      await FirestoreService.saveCustomer({
        id: editingCustomer?.id,
        name: formName.trim() || 'Pelanggan HUMA',
        whatsapp: formPhone.trim(),
        address: formAddress.trim(),
        notes: formNotes.trim(),
        pointsBalance: editingCustomer ? editingCustomer.pointsBalance : formInitialPoints,
        totalPointsEarned: editingCustomer ? editingCustomer.totalPointsEarned : formInitialPoints,
      });

      await loadData();
      setIsAddEditOpen(false);
      setActionFeedback({
        type: 'success',
        message: editingCustomer ? 'Data pelanggan berhasil diperbarui.' : 'Pelanggan baru berhasil ditambahkan.',
      });
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      alert(err?.message || 'Gagal menyimpan data pelanggan.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleOpenHistory = (c: Customer) => {
    setSelectedCustomer(c);
    setIsHistoryOpen(true);
  };

  const handleOpenAdjust = (c: Customer) => {
    setSelectedCustomer(c);
    setAdjustAmount(10);
    setAdjustType('ADD');
    setAdjustReason('');
    setIsAdjustOpen(true);
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!adjustReason.trim()) {
      alert('Alasan penyesuaian poin wajib diisi.');
      return;
    }

    const finalAmount = adjustType === 'ADD' ? Math.abs(adjustAmount) : -Math.abs(adjustAmount);
    setAdjustLoading(true);

    try {
      await FirestoreService.manualAdjustPoints({
        customerId: selectedCustomer.id,
        amount: finalAmount,
        reason: adjustReason.trim(),
        adminId: adminUser?.uid || 'ADMIN',
        adminName: adminUser?.name || adminUser?.email || 'Admin HUMA',
      });

      await loadData();
      setIsAdjustOpen(false);
      setActionFeedback({
        type: 'success',
        message: `Saldo poin untuk ${selectedCustomer.name} berhasil disesuaikan (${finalAmount > 0 ? '+' : ''}${finalAmount} poin).`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Gagal menyesuaikan saldo poin.');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleOpenRedeemDiscount = (c: Customer) => {
    setSelectedCustomer(c);
    setRedeemPoints(Math.min(c.pointsBalance, 50));
    setIsRedeemDiscountOpen(true);
  };

  const handleExecuteRedeemDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const rate = settings?.pointsRedeemRate || 100;
    const discountVal = redeemPoints * rate;

    setRedeemDiscountLoading(true);
    try {
      await FirestoreService.redeemPointsDiscount({
        customerId: selectedCustomer.id,
        pointsToRedeem: redeemPoints,
        discountValue: discountVal,
        adminId: adminUser?.uid || 'ADMIN',
        adminName: adminUser?.name || adminUser?.email || 'Admin Kasir',
      });

      await loadData();
      setIsRedeemDiscountOpen(false);
      setActionFeedback({
        type: 'success',
        message: `Berhasil menukarkan ${redeemPoints} poin menjadi diskon belanja Rp ${discountVal.toLocaleString('id-ID')}!`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Gagal menukarkan poin.');
    } finally {
      setRedeemDiscountLoading(false);
    }
  };

  const handleOpenRedeemProduct = (c: Customer) => {
    setSelectedCustomer(c);
    const activeRewards = rewards.filter((r) => r.isActive);
    if (activeRewards.length > 0) {
      setSelectedRewardId(activeRewards[0].id);
    }
    setIsRedeemProductOpen(true);
  };

  const handleExecuteRedeemProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedRewardId) return;

    const reward = rewards.find((r) => r.id === selectedRewardId);
    if (!reward) return;

    if (selectedCustomer.pointsBalance < reward.pointsCost) {
      alert(`Poin pelanggan tidak mencukupi (${selectedCustomer.pointsBalance} / ${reward.pointsCost} poin).`);
      return;
    }

    setRedeemProductLoading(true);
    try {
      await FirestoreService.redeemPointsProduct({
        customerId: selectedCustomer.id,
        rewardId: selectedRewardId,
        adminId: adminUser?.uid || 'ADMIN',
        adminName: adminUser?.name || adminUser?.email || 'Admin Kasir',
      });

      await loadData();
      setIsRedeemProductOpen(false);
      setActionFeedback({
        type: 'success',
        message: `Berhasil menukarkan ${reward.pointsCost} poin untuk hadiah "${reward.name}"!`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Gagal menukarkan reward produk.');
    } finally {
      setRedeemProductLoading(false);
    }
  };

  const handleToggleCustomerStatus = async (c: Customer) => {
    const nextStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'INACTIVE'
        ? `Non-aktifkan pelanggan "${c.name}"? Pelanggan tidak dapat menukarkan poin saat non-aktif.`
        : `Aktifkan kembali pelanggan "${c.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await FirestoreService.saveCustomer({ id: c.id, status: nextStatus });
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Gagal mengubah status pelanggan.');
    }
  };

  return (
    <div className="space-y-5 max-w-6xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
              Database Pelanggan & Loyalitas Poin
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
              Admin-Only Visibility
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Kelola profil pelanggan tetap, saldo poin reward, histori mutasi poin, dan penukaran hadiah
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-all shadow-xs"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="clay-button-primary py-2.5 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Pelanggan</span>
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2 text-xs font-bold animate-in fade-in ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="clay-card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama atau no WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl bg-gray-50 border border-gray-200 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-white text-[#2E1A47] shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Semua ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'ACTIVE'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Aktif ({customers.filter((c) => c.status === 'ACTIVE').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'INACTIVE'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Non-Aktif ({customers.filter((c) => c.status === 'INACTIVE').length})
          </button>
        </div>
      </div>

      {/* Customer List / Table */}
      {loading ? (
        <div className="clay-card p-12 text-center text-gray-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF4500]" />
          <p className="text-xs">Memuat data pelanggan & poin...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="clay-card p-12 text-center text-gray-400 space-y-2">
          <Users className="w-10 h-10 mx-auto text-gray-300 stroke-[1.5]" />
          <p className="font-bold text-sm text-gray-600">Tidak ada pelanggan ditemukan</p>
          <p className="text-xs text-gray-400">
            {searchQuery
              ? 'Coba kata kunci pencarian yang lain.'
              : 'Pelanggan baru akan otomatis tercatat saat melakukan transaksi atau dapat ditambahkan secara manual.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredCustomers.map((c) => (
            <div
              key={c.id}
              className={`clay-card p-4 sm:p-5 transition-all border ${
                c.status === 'INACTIVE' ? 'opacity-70 bg-gray-50/50' : 'hover:shadow-md'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Identity */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-extrabold text-sm text-[#2E1A47]">
                      {c.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {c.status === 'ACTIVE' ? 'Aktif' : 'Non-Aktif'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <a
                      href={`https://wa.me/${c.whatsapp.replace(/^0/, '62')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{c.whatsapp}</span>
                    </a>

                    {c.address && (
                      <span className="flex items-center gap-1 text-gray-500 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        <span>{c.address}</span>
                      </span>
                    )}

                    {c.notes && (
                      <span className="flex items-center gap-1 text-gray-400 italic">
                        <FileText className="w-3.5 h-3.5" />
                        <span>"{c.notes}"</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics / Points Balance */}
                <div className="flex flex-wrap items-center gap-3 py-2 lg:py-0 border-y lg:border-none border-gray-100">
                  <div className="bg-amber-50 px-3 py-2 rounded-2xl border border-amber-200 min-w-[120px]">
                    <span className="text-[10px] text-amber-800 font-bold block uppercase tracking-wider">
                      Saldo Poin
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Award className="w-4 h-4 text-amber-600" />
                      <span className="font-heading font-black text-base text-amber-900">
                        {c.pointsBalance.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-amber-700 font-semibold">poin</span>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-3 py-2 rounded-2xl border border-gray-200 min-w-[130px]">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase tracking-wider">
                      Total Belanja
                    </span>
                    <span className="font-heading font-extrabold text-xs text-gray-800 block mt-0.5">
                      Rp {(c.totalSpent || 0).toLocaleString('id-ID')}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {c.totalOrders || 0} pesanan selesai
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenHistory(c)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1 transition-all"
                    title="Histori Poin & Transaksi"
                  >
                    <History className="w-3.5 h-3.5 text-gray-600" />
                    <span className="hidden sm:inline">Histori</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAdjust(c)}
                    className="p-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1 transition-all"
                    title="Penyesuaian Poin Manual"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span className="hidden sm:inline">Sesuaikan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenRedeemDiscount(c)}
                    disabled={c.status === 'INACTIVE' || c.pointsBalance <= 0}
                    className="p-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40"
                    title="Tukar Poin Diskon"
                  >
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="hidden sm:inline">Diskon</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenRedeemProduct(c)}
                    disabled={c.status === 'INACTIVE' || c.pointsBalance <= 0}
                    className="p-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40"
                    title="Tukar Poin Hadiah"
                  >
                    <Gift className="w-3.5 h-3.5 text-purple-700" />
                    <span className="hidden sm:inline">Hadiah</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all"
                    title="Ubah Profil Pelanggan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleCustomerStatus(c)}
                    className={`p-2 rounded-xl transition-all ${
                      c.status === 'ACTIVE'
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                    }`}
                    title={c.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                  >
                    {c.status === 'ACTIVE' ? <X className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
       * MODAL 1: ADD / EDIT CUSTOMER
       * ========================================================================= */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                {editingCustomer ? 'Perbarui Data Pelanggan' : 'Tambah Pelanggan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddEditOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nama Lengkap:</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Cth: Ibu Sarah"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Nomor WhatsApp (Identitas Unik):
                </label>
                <input
                  type="tel"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-semibold"
                />
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Nomor ini digunakan untuk pencatatan otomatis transaksi poin
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Alamat Pengantaran:</label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Cth: Perum Gina Blok A No. 5"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Catatan Tambahan:</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Cth: Langganan seblak level 3, jangan pakai daun bawang"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>

              {!editingCustomer && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Saldo Poin Awal:</label>
                  <input
                    type="number"
                    min={0}
                    value={formInitialPoints}
                    onChange={(e) => setFormInitialPoints(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-amber-900"
                  />
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    Opsional, berikan poin pembuka bagi member baru
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="clay-button-primary py-2.5 px-5 font-bold disabled:opacity-60 shadow-md"
                >
                  {formSaving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 2: CUSTOMER HISTORY & POINT LEDGER
       * ========================================================================= */}
      {isHistoryOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                  Buku Besar Poin: {selectedCustomer.name}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedCustomer.whatsapp} • Terdaftar sejak {selectedCustomer.createdAt.substring(0, 10)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-center">
                <span className="text-[10px] text-amber-700 font-bold uppercase block">Saldo Saat Ini</span>
                <span className="font-heading font-black text-lg text-amber-900 block">
                  {selectedCustomer.pointsBalance}
                </span>
                <span className="text-[10px] text-amber-700">poin</span>
              </div>

              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-center">
                <span className="text-[10px] text-emerald-700 font-bold uppercase block">Total Poin Didapat</span>
                <span className="font-heading font-black text-lg text-emerald-900 block">
                  {selectedCustomer.totalPointsEarned || selectedCustomer.pointsBalance}
                </span>
                <span className="text-[10px] text-emerald-700">poin seumur hidup</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-center">
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Total Transaksi</span>
                <span className="font-heading font-black text-lg text-gray-800 block">
                  {selectedCustomer.totalOrders}
                </span>
                <span className="text-[10px] text-gray-400">pesanan selesai</span>
              </div>
            </div>

            {/* Timeline Ledger */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <h4 className="font-bold text-xs text-gray-700 flex items-center gap-1.5 pt-2">
                <History className="w-3.5 h-3.5 text-[#FF4500]" />
                <span>Histori Mutasi & Audit Poin:</span>
              </h4>

              {historyLoading ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF4500]" />
                  Memuat histori buku besar...
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 bg-gray-50 rounded-2xl">
                  Belum ada mutasi poin tercatat untuk pelanggan ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              entry.type === 'EARN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : entry.type === 'REDEEM'
                                ? 'bg-purple-100 text-purple-800'
                                : entry.type === 'REVERSAL'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {entry.type === 'EARN' && '+ DIDAPAT'}
                            {entry.type === 'REDEEM' && '- DITUKARKAN'}
                            {entry.type === 'REVERSAL' && '↺ BATAL'}
                            {entry.type === 'ADJUSTMENT' && 'PENYESUAIAN'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(entry.createdAt).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <p className="text-gray-700 font-medium">{entry.note}</p>
                        <div className="text-[10px] text-gray-400">
                          Saldo: {entry.balanceBefore} → <strong className="text-gray-700">{entry.balanceAfter}</strong>
                          {entry.createdBy && ` • Petugas: ${entry.createdBy}`}
                        </div>
                      </div>

                      <div
                        className={`font-heading font-black text-sm shrink-0 ${
                          entry.amount > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {entry.amount > 0 ? `+${entry.amount}` : entry.amount} poin
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="py-2.5 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 3: MANUAL POINT ADJUSTMENT (WITH MANDATORY REASON)
       * ========================================================================= */}
      {isAdjustOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                  Penyesuaian Poin Manual
                </h3>
                <p className="text-xs text-gray-400">
                  Pelanggan: <strong>{selectedCustomer.name}</strong> (Saldo saat ini: {selectedCustomer.pointsBalance} poin)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Aksi Penyesuaian:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADD')}
                    className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      adjustType === 'ADD'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Tambah (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType('DEDUCT')}
                    className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      adjustType === 'DEDUCT'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Kurangi (-)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Jumlah Poin:</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-heading font-black text-sm"
                />
              </div>

              {/* Preview calculation */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                <span className="text-amber-800 font-semibold">Simulasi Saldo Akhir:</span>
                <span className="font-heading font-black text-amber-900 text-sm">
                  {adjustType === 'ADD'
                    ? selectedCustomer.pointsBalance + adjustAmount
                    : Math.max(0, selectedCustomer.pointsBalance - adjustAmount)}{' '}
                  poin
                </span>
              </div>

              {adjustType === 'DEDUCT' && adjustAmount > selectedCustomer.pointsBalance && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-bold">
                  Peringatan: Jumlah pengurangan melebihi saldo poin pelanggan saat ini ({selectedCustomer.pointsBalance} poin).
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Alasan Penyesuaian (Wajib untuk Audit & Anti-Fraud):
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Cth: Kompensasi pesanan tertukar / Bonus ulang tahun / Koreksi kasir"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    adjustLoading ||
                    (adjustType === 'DEDUCT' && adjustAmount > selectedCustomer.pointsBalance)
                  }
                  className="clay-button-primary py-2.5 px-5 font-bold disabled:opacity-50 shadow-md"
                >
                  {adjustLoading ? 'Memproses...' : 'Simpan Penyesuaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 4: REDEEM POINTS FOR DISCOUNT (POTONGAN HARGA)
       * ========================================================================= */}
      {isRedeemDiscountOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                  Tukar Poin Diskon Belanja
                </h3>
                <p className="text-xs text-gray-400">
                  Pelanggan: <strong>{selectedCustomer.name}</strong> • Saldo: {selectedCustomer.pointsBalance} poin
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRedeemDiscountOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRedeemDiscount} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Jumlah Poin yang Ditukarkan:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={selectedCustomer.pointsBalance}
                    required
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(Math.max(1, Number(e.target.value) || 1))}
                    className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-heading font-black text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(selectedCustomer.pointsBalance)}
                    className="py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                  >
                    Semua ({selectedCustomer.pointsBalance})
                  </button>
                </div>
              </div>

              {/* Discount Value Preview */}
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1 text-center">
                <span className="text-[11px] text-emerald-800 font-bold block">
                  Nilai Potongan Belanja yang Didapat:
                </span>
                <span className="font-heading font-black text-2xl text-emerald-900 block">
                  Rp {(redeemPoints * (settings?.pointsRedeemRate || 100)).toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-emerald-700 block">
                  (Kurs: 1 poin = Rp {(settings?.pointsRedeemRate || 100).toLocaleString('id-ID')})
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRedeemDiscountOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={redeemDiscountLoading || redeemPoints > selectedCustomer.pointsBalance}
                  className="clay-button-primary py-2.5 px-5 font-bold disabled:opacity-50 shadow-md"
                >
                  {redeemDiscountLoading ? 'Memproses...' : 'Tukar Poin Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 5: REDEEM POINTS FOR REWARD PRODUCT (KATALOG HADIAH)
       * ========================================================================= */}
      {isRedeemProductOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                  Tukar Hadiah Produk
                </h3>
                <p className="text-xs text-gray-400">
                  Pelanggan: <strong>{selectedCustomer.name}</strong> • Saldo: {selectedCustomer.pointsBalance} poin
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRedeemProductOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRedeemProduct} className="space-y-3 text-xs flex-1 flex flex-col">
              <label className="block font-bold text-gray-700">Pilih Hadiah dari Katalog:</label>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {rewards.filter((r) => r.isActive).length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-2xl">
                    Belum ada reward produk yang aktif di menu Reward.
                  </div>
                ) : (
                  rewards
                    .filter((r) => r.isActive)
                    .map((reward) => {
                      const canAfford = selectedCustomer.pointsBalance >= reward.pointsCost;
                      const isSelected = selectedRewardId === reward.id;

                      return (
                        <div
                          key={reward.id}
                          onClick={() => setSelectedRewardId(reward.id)}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-200'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          } ${!canAfford ? 'opacity-60' : ''}`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-gray-800">{reward.name}</span>
                              {reward.stock !== undefined && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-gray-100 text-gray-600">
                                  Sisa: {reward.stock}
                                </span>
                              )}
                            </div>
                            {reward.description && (
                              <p className="text-[11px] text-gray-500">{reward.description}</p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-heading font-black text-purple-900 block text-xs">
                              {reward.pointsCost} poin
                            </span>
                            {!canAfford && (
                              <span className="text-[9px] text-rose-600 font-semibold block">
                                Poin kurang
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRedeemProductOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={redeemProductLoading || !selectedRewardId}
                  className="clay-button-primary py-2.5 px-5 font-bold disabled:opacity-50 shadow-md"
                >
                  {redeemProductLoading ? 'Memproses...' : 'Tukar Hadiah Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
