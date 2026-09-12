import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { StoreSettings } from '../../types';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

interface AdminLoginPageProps {
  settings: StoreSettings | null;
  onSuccess: () => void;
  onBackToStorefront: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  settings,
  onSuccess,
  onBackToStorefront,
}) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login gagal. Periksa kembali email dan kata sandi staff.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1E1130] flex flex-col justify-center items-center p-4 selection:bg-[#FF4500] selection:text-white">
      {/* Return to Customer storefront */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <button
          onClick={onBackToStorefront}
          className="flex items-center gap-1.5 text-xs text-purple-200/80 hover:text-white transition-colors px-3 py-1.5 rounded-xl hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Beranda Customer</span>
        </button>

        <span className="text-[11px] font-mono text-purple-300/60 bg-purple-900/40 px-2.5 py-1 rounded-lg border border-purple-500/20">
          Akses Internal Terisolasi
        </span>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-purple-100">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2E1A47] to-[#1E1130] text-white mx-auto flex items-center justify-center shadow-lg mb-3">
            <ShieldCheck className="w-7 h-7 text-[#FF4500]" />
          </div>
          <h1 className="font-heading font-black text-xl text-[#2E1A47]">
            Portal Internal & Admin
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {settings?.storeName || 'HUMA FOOD'} — Area Khusus Manajemen & Kasir
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Email Staff / Admin
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                id="admin-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@humafood.com"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-hidden focus:border-[#2E1A47] focus:ring-1 focus:ring-[#2E1A47] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                id="admin-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-hidden focus:border-[#2E1A47] focus:ring-1 focus:ring-[#2E1A47] transition-all"
              />
            </div>
          </div>

          <button
            id="btn-submit-admin-login"
            type="submit"
            disabled={isLoading}
            className="w-full clay-button-primary py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold shadow-lg disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi Akun...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Masuk ke Panel Kontrol</span>
              </>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <p className="text-[11px] text-gray-400 text-center mt-6 leading-relaxed">
          Halaman ini dilindungi enkripsi sistem & Firebase Authentication. Hanya staf dan manajemen resmi yang memiliki kredensial terdaftar yang dapat masuk.
        </p>
      </div>
    </div>
  );
};
