import React, { useState, useEffect } from 'react';
import { Order, StoreSettings } from '../../types';
import { Modal } from '../common/Modal';
import { ReceiptService } from '../../services/receiptService';
import { PrinterService, BluetoothStatus } from '../../services/printerService';
import {
  Printer,
  Download,
  Copy,
  Check,
  MessageCircle,
  Image as ImageIcon,
  FileText,
  Scissors,
  Loader2,
  Bluetooth,
  RefreshCw,
  AlertCircle,
  WifiOff,
} from 'lucide-react';

interface ThermalReceiptModalProps {
  order: Order | null;
  settings: StoreSettings | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  order,
  settings,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState<'image' | 'text'>('image');
  const [receiptImageDataUrl, setReceiptImageDataUrl] = useState<string>('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccessNotice, setShareSuccessNotice] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);

  // Bluetooth state
  const [btStatus, setBtStatus] = useState<BluetoothStatus>('DISCONNECTED');
  const [btDeviceName, setBtDeviceName] = useState<string | null>(null);
  const [isPrintingBt, setIsPrintingBt] = useState(false);

  useEffect(() => {
    const unsub = PrinterService.onStatusChange((status, devName) => {
      setBtStatus(status);
      setBtDeviceName(devName);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (order && isOpen) {
      setPrinterError(null);
      setIsGeneratingImage(true);
      ReceiptService.generateReceiptImage(order, settings || undefined)
        .then((url) => {
          setReceiptImageDataUrl(url);
        })
        .catch((err) => {
          console.error('Gagal membuat preview gambar struk:', err);
        })
        .finally(() => {
          setIsGeneratingImage(false);
        });
    }
  }, [order, settings, isOpen]);

  if (!order) return null;

  const receiptText = ReceiptService.formatTextReceipt(order, settings || undefined);
  const paperWidth = settings?.paperWidth || '58mm';
  const autoCut = settings?.autoCutEnabled ?? true;

  // Bluetooth connection
  const handleConnectBt = async () => {
    setPrinterError(null);
    const res = await PrinterService.connectBluetooth();
    if (!res.success && res.error) {
      setPrinterError(res.error);
    }
  };

  const handleDisconnectBt = async () => {
    await PrinterService.disconnectBluetooth();
  };

  // Print via Bluetooth
  const handlePrintBluetooth = async () => {
    setPrinterError(null);
    if (btStatus !== 'CONNECTED') {
      const res = await PrinterService.connectBluetooth();
      if (!res.success) {
        if (res.error) setPrinterError(res.error);
        return;
      }
    }

    setIsPrintingBt(true);
    try {
      await PrinterService.printViaBluetooth(order, settings || undefined);
      setShareSuccessNotice('Perintah cetak struk ESC/POS berhasil dikirim ke printer!');
      setTimeout(() => setShareSuccessNotice(null), 4000);
    } catch (err: any) {
      setPrinterError(err?.message || 'Gagal mengirim data ke printer Bluetooth.');
    } finally {
      setIsPrintingBt(false);
    }
  };

  // Test Print Bluetooth
  const handleTestPrintBt = async () => {
    setPrinterError(null);
    setIsPrintingBt(true);
    try {
      await PrinterService.testPrintBluetooth(settings || undefined);
      setShareSuccessNotice('Tes cetak thermal berhasil!');
      setTimeout(() => setShareSuccessNotice(null), 4000);
    } catch (err: any) {
      setPrinterError(err?.message || 'Gagal melakukan tes cetak Bluetooth.');
    } finally {
      setIsPrintingBt(false);
    }
  };

  // Browser Fallback Print
  const handlePrintBrowser = () => {
    PrinterService.printViaBrowser(order, settings || undefined);
  };

  const handleDownloadImage = async () => {
    await ReceiptService.downloadReceiptImage(order, settings || undefined);
  };

  const handleShareWhatsAppImage = async () => {
    setIsSharing(true);
    setShareSuccessNotice(null);
    try {
      const res = await PrinterService.shareReceiptImageViaWhatsApp(order, settings || undefined);
      if (res.sharedViaNative) {
        setShareSuccessNotice('Struk berhasil dibagikan via sistem');
      } else if (res.downloaded) {
        setShareSuccessNotice('Gambar struk diunduh & WhatsApp terbuka');
      }
      setTimeout(() => setShareSuccessNotice(null), 4000);
    } catch (err) {
      console.error('Error sharing receipt:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(receiptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Struk Pembayaran Kasir"
      subtitle={`No. Pesanan: ${order.orderNumber} • Format: ${paperWidth}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3.5">
        {/* Bluetooth Connection Status Bar */}
        <div className="p-2.5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                btStatus === 'CONNECTED'
                  ? 'bg-blue-600 text-white'
                  : btStatus === 'CONNECTING'
                  ? 'bg-amber-100 text-amber-700 animate-pulse'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              <Bluetooth className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-gray-800 flex items-center gap-1.5">
                <span>{btDeviceName || 'Printer Bluetooth'}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    btStatus === 'CONNECTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : btStatus === 'CONNECTING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {btStatus === 'CONNECTED'
                    ? 'Terhubung'
                    : btStatus === 'CONNECTING'
                    ? 'Menghubungkan...'
                    : btStatus === 'UNSUPPORTED'
                    ? 'Tidak Didukung'
                    : 'Terputus'}
                </span>
              </div>
              <span className="text-[10px] text-gray-500">
                {paperWidth} • Auto-Cut: {autoCut ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {btStatus === 'CONNECTED' ? (
              <>
                <button
                  onClick={handleTestPrintBt}
                  disabled={isPrintingBt}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                  title="Kirim tes cetak ESC/POS"
                >
                  Tes Cetak
                </button>
                <button
                  onClick={handleDisconnectBt}
                  className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                  title="Putuskan Bluetooth"
                >
                  <WifiOff className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={handleConnectBt}
                disabled={btStatus === 'CONNECTING'}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs disabled:opacity-50"
              >
                {btStatus === 'CONNECTING' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bluetooth className="w-3 h-3" />
                )}
                <span>Hubungkan</span>
              </button>
            )}
          </div>
        </div>

        {/* Error message if any */}
        {printerError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">{printerError}</div>
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setPreviewMode('image')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              previewMode === 'image'
                ? 'bg-white text-[#2E1A47] shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Gambar Struk (Logo)</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('text')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              previewMode === 'text'
                ? 'bg-white text-[#2E1A47] shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Teks Monospace</span>
          </button>
        </div>

        {/* Preview Container */}
        {previewMode === 'image' ? (
          <div className="bg-gray-100 p-3 rounded-2xl border border-gray-200 flex flex-col items-center justify-center min-h-[240px] max-h-[45vh] overflow-y-auto">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                <Loader2 className="w-6 h-6 text-[#FF4500] animate-spin" />
                <span className="text-xs">Merender gambar struk resolusi tinggi...</span>
              </div>
            ) : receiptImageDataUrl ? (
              <img
                src={receiptImageDataUrl}
                alt="Preview Struk"
                className="w-full max-w-[320px] rounded-lg shadow-md border border-gray-300 object-contain bg-white"
              />
            ) : (
              <div className="text-xs text-gray-400 py-6">Gagal memuat gambar struk.</div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50/40 p-3.5 rounded-2xl border border-amber-200/60 shadow-inner max-h-[45vh] overflow-y-auto font-mono text-[11px] sm:text-xs text-gray-900 whitespace-pre leading-relaxed selection:bg-amber-200">
            {receiptText}
          </div>
        )}

        {/* Notification pill */}
        {shareSuccessNotice && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs text-center font-medium">
            {shareSuccessNotice}
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Bluetooth Print Button */}
          <button
            id="btn-print-bluetooth"
            onClick={handlePrintBluetooth}
            disabled={isPrintingBt}
            className="w-full py-2.5 px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white flex items-center justify-center gap-2 text-xs font-extrabold shadow-md transition-all disabled:opacity-60"
          >
            {isPrintingBt ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bluetooth className="w-4 h-4" />
            )}
            <span>Cetak Langsung via Bluetooth ESC/POS</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="btn-print-receipt-browser"
              onClick={handlePrintBrowser}
              className="w-full clay-button-primary py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs font-bold shadow-md"
              title="Cetak lewat dialog browser biasa"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Browser / USB</span>
            </button>

            <button
              id="btn-share-receipt-wa"
              onClick={handleShareWhatsAppImage}
              disabled={isSharing}
              className="w-full py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-md disabled:opacity-50"
            >
              {isSharing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              <span>Share WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Secondary Action Controls */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            id="btn-download-receipt-image"
            onClick={handleDownloadImage}
            className="py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh File Gambar</span>
          </button>

          <button
            onClick={handleCopyText}
            className="py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Tersalin!' : 'Salin Teks Struk'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
