import React, { useState, useRef } from 'react';
import { Upload, X, RefreshCw, AlertCircle, CheckCircle2, Link as LinkIcon, Loader2, Sparkles, Cloud, CloudCheck } from 'lucide-react';
import { optimizeImage, formatBytes, ImagePresetKey } from '../../utils/imageOptimizer';
import { StorageService } from '../../services/storageService';

interface ImageUploadFieldProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  helperText?: string;
  maxSizeMB?: number;
  aspectRatio?: 'square' | 'banner' | 'qris' | 'receipt' | 'any';
  preset?: ImagePresetKey;
  folder?: 'products' | 'banners' | 'settings' | 'rewards' | 'receipts';
  placeholderText?: string;
  disabled?: boolean;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  onRemove,
  helperText,
  maxSizeMB = 5,
  aspectRatio = 'any',
  preset,
  folder,
  placeholderText = 'Pilih atau seret gambar ke sini',
  disabled = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCloudUploading, setIsCloudUploading] = useState(false);
  const [isCloudUploaded, setIsCloudUploaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUrlMode, setIsUrlMode] = useState(false);
  const [customUrl, setCustomUrl] = useState(value || '');
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: string;
    compressedSize: string;
    savings: number;
    format: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePreset: ImagePresetKey =
    preset ||
    (aspectRatio === 'banner'
      ? 'banner'
      : aspectRatio === 'qris'
      ? 'qris'
      : aspectRatio === 'receipt'
      ? 'receipt'
      : aspectRatio === 'square'
      ? 'product'
      : 'custom');

  const uploadFolder: 'products' | 'banners' | 'settings' | 'rewards' | 'receipts' =
    folder ||
    (activePreset === 'banner'
      ? 'banners'
      : activePreset === 'reward'
      ? 'rewards'
      : activePreset === 'logo' || activePreset === 'receipt' || activePreset === 'qris'
      ? 'settings'
      : 'products');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setErrorMessage(null);
    setIsCloudUploaded(false);

    // 1. Validation: File size > 0
    if (file.size === 0) {
      setErrorMessage('File gambar kosong (0 byte). Harap pilih file yang valid.');
      return;
    }

    // 2. Validation: File size <= maxSizeMB
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setErrorMessage(`Ukuran file terlalu besar (${fileSizeMB} MB). Batas maksimum adalah ${maxSizeMB} MB.`);
      return;
    }

    // 3. Validation: Format MIME
    const isValidMime =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      Boolean(file.name.match(/\.(jpe?g|png|webp|svg|gif)$/i));
    if (!isValidMime) {
      setErrorMessage(
        `Format file "${file.name}" tidak didukung. Harap pilih gambar bertipe PNG, JPG, JPEG, WEBP, atau SVG.`
      );
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Ultra-fast hardware-accelerated client-side compression (typically <30ms)
      const optimized = await optimizeImage(file, { preset: activePreset });
      
      // Immediately set preview and form value with local dataUrl
      onChange(optimized.dataUrl);
      setCustomUrl(optimized.dataUrl);

      setCompressionStats({
        originalSize: formatBytes(optimized.originalSizeBytes),
        compressedSize: formatBytes(optimized.optimizedSizeBytes),
        savings: optimized.savingsPercent,
        format: optimized.format.replace('image/', '').toUpperCase(),
      });

      // 2. Start asynchronous background upload to Firebase Storage if available
      if (StorageService.isAvailable()) {
        setIsCloudUploading(true);
        StorageService.uploadImage(optimized.blob, uploadFolder, optimized.filename, true)
          .then((remoteUrl) => {
            if (remoteUrl && !remoteUrl.startsWith('data:')) {
              onChange(remoteUrl);
              setIsCloudUploaded(true);
            }
          })
          .catch((uploadErr) => {
            console.info('[HUMA Storage] Background upload fallback to local WebP data URL:', uploadErr);
          })
          .finally(() => {
            setIsCloudUploading(false);
          });
      }

    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memproses dan mengompresi gambar.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMessage(null);
    setCustomUrl('');
    onChange('');
    if (onRemove) onRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyUrl = () => {
    if (customUrl.trim()) {
      onChange(customUrl.trim());
      setErrorMessage(null);
    }
  };

  // Preview dimensions styling helper
  const getPreviewClasses = () => {
    switch (aspectRatio) {
      case 'banner':
        return 'w-full h-36 sm:h-44 object-cover rounded-2xl';
      case 'square':
        return 'w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-2xl';
      case 'receipt':
        return 'w-32 h-20 object-contain bg-white p-2 rounded-xl border border-gray-200';
      case 'qris':
        return 'w-36 h-36 sm:w-44 sm:h-44 object-contain bg-white p-2 rounded-2xl border border-gray-200';
      default:
        return 'w-32 h-32 object-cover rounded-2xl';
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => setIsUrlMode(!isUrlMode)}
          className="text-[11px] text-[#2E1A47] hover:underline font-semibold flex items-center gap-1"
        >
          <LinkIcon className="w-3 h-3 text-[#FF4500]" />
          <span>{isUrlMode ? 'Mode Upload File' : 'Input URL Langsung'}</span>
        </button>
      </div>

      {helperText && <p className="text-[11px] text-gray-500">{helperText}</p>}

      {/* URL Input Mode */}
      {isUrlMode ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://contoh.com/gambar.png"
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
          />
          <button
            type="button"
            onClick={handleApplyUrl}
            className="px-3 py-2 bg-[#2E1A47] hover:bg-[#3D235E] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            Terapkan
          </button>
        </div>
      ) : (
        /* File Dropzone / Upload */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && !isProcessing && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-4 transition-all cursor-pointer text-center ${
            isDragging
              ? 'border-[#FF4500] bg-orange-50/60'
              : value
              ? 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
              : 'border-gray-300 bg-white hover:border-[#2E1A47] hover:bg-gray-50/50'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml, image/gif"
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled || isProcessing}
          />

          {isProcessing ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-7 h-7 text-[#FF4500] animate-spin" />
              <span className="text-xs font-bold text-gray-700">Memproses & mengompresi gambar...</span>
              <span className="text-[10px] text-gray-400">Harap tunggu sebentar</span>
            </div>
          ) : value ? (
            /* Has Image Preview */
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-2">
              <div className="relative group shrink-0">
                <img
                  src={value}
                  alt={label}
                  className={`${getPreviewClasses()} shadow-sm`}
                />
              </div>

              <div className="text-left space-y-1.5 flex-1">
                <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Gambar Siap Digunakan</span>
                  {isCloudUploading && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-[#2E1A47] text-[10px] font-bold animate-pulse ml-1">
                      <Loader2 className="w-3 h-3 animate-spin text-[#FF4500]" />
                      Mengunggah ke Cloud...
                    </span>
                  )}
                  {(isCloudUploaded || (value && value.startsWith('http'))) && !isCloudUploading && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold ml-1">
                      <Cloud className="w-3 h-3 text-sky-600" />
                      Tersimpan di Cloud
                    </span>
                  )}
                </div>

                {compressionStats ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      {compressionStats.format} • {compressionStats.compressedSize}
                    </span>
                    {compressionStats.savings > 0 && (
                      <span className="text-[10px] text-gray-500 font-semibold">
                        Hemat {compressionStats.savings}% dari {compressionStats.originalSize}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Format teroptimasi untuk kecepatan & hemat bandwidth.
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-100 flex items-center gap-1 shadow-2xs"
                  >
                    <RefreshCw className="w-3 h-3 text-gray-500" />
                    <span>Ganti Gambar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 flex items-center gap-1 shadow-2xs"
                  >
                    <X className="w-3 h-3" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="py-4 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#FF4500] flex items-center justify-center mb-2 shadow-inner">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-gray-800">{placeholderText}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                PNG, JPG, WEBP, atau SVG (Maks. {maxSizeMB} MB)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message Box */}
      {errorMessage && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block">Peringatan Upload:</span>
            <span className="text-[11px] leading-tight">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
