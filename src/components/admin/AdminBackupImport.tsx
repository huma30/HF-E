import React, { useState } from 'react';
import { Order, Product, StoreSettings, Category } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { Download, Upload, FileSpreadsheet, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface AdminBackupImportProps {
  products: Product[];
  orders: Order[];
  categories: Category[];
  settings: StoreSettings | null;
  onRefresh: () => void;
}

export const AdminBackupImport: React.FC<AdminBackupImportProps> = ({
  products,
  orders,
  categories,
  settings,
  onRefresh,
}) => {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Export full system snapshot JSON
  const handleExportJSON = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      store: settings,
      products,
      orders,
      categories,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `backup_huma_${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export orders to CSV
  const handleExportOrdersCSV = () => {
    const headers = [
      'OrderNumber',
      'CreatedAt',
      'Source',
      'Status',
      'CustomerName',
      'CustomerWA',
      'ServiceType',
      'Subtotal',
      'Discount',
      'DeliveryFee',
      'Total',
      'PaymentMethod',
    ];

    const rows = orders.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.source,
      o.status,
      `"${o.customer.name.replace(/"/g, '""')}"`,
      o.customer.whatsapp || '-',
      o.serviceType,
      o.subtotal,
      o.discount,
      o.deliveryFee,
      o.total,
      o.paymentMethod,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_pesanan_huma_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Download Sample CSV template for products
  const handleDownloadProductTemplate = () => {
    const sample = `name,description,price,category,imageUrl\nSeblak Makaroni Baso,Seblak kuah kencur gurih dengan makaroni dan baso sapi,16000,Seblak Prasmanan,https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80\nEs Teh Manis Jumbo,Es teh manis segar ukuran jumbo 22oz,5000,Minuman Segar,https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80`;
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(sample);
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `template_import_produk_huma.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Handle CSV file upload & parsing
  const handleUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportStatus(null);
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lines.length <= 1) {
          setImportError('File CSV kosong atau tidak memiliki baris data.');
          return;
        }

        const defaultCatId = categories[0]?.id || 'cat_seblak';
        let count = 0;

        // Process rows (skip header)
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length >= 3) {
            const name = parts[0]?.trim();
            const desc = parts[1]?.trim();
            const price = Number(parts[2]?.trim()) || 10000;
            const img = parts[4]?.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';

            if (name) {
              await FirestoreService.createProduct({
                name,
                description: desc || '',
                price,
                categoryId: defaultCatId,
                imageUrl: img,
                isAvailable: true,
                isActive: true,
                wholesaleEnabled: false,
              });
              count++;
            }
          }
        }

        setImportStatus(`Berhasil mengimpor ${count} menu baru ke database.`);
        onRefresh();
      } catch (err: any) {
        setImportError(err?.message || 'Gagal memproses file CSV.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
          Backup, Ekspor & Impor Data
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Cadangkan seluruh data sistem HUMA atau ekspor laporan ke Excel / CSV
        </p>
      </div>

      {/* Export Section */}
      <div className="clay-card p-5 space-y-4">
        <h3 className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-2">
          <Database className="w-4 h-4 text-[#FF4500]" />
          <span>Cadangkan & Ekspor Data Toko</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleExportOrdersCSV}
            className="p-3.5 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200 text-left flex items-center justify-between group transition-colors"
          >
            <div>
              <p className="font-bold text-xs text-[#2E1A47]">Ekspor Rekap Pesanan (CSV)</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Buka di Microsoft Excel / Google Sheets</p>
            </div>
            <Download className="w-4 h-4 text-gray-400 group-hover:text-[#FF4500]" />
          </button>

          <button
            onClick={handleExportJSON}
            className="p-3.5 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200 text-left flex items-center justify-between group transition-colors"
          >
            <div>
              <p className="font-bold text-xs text-[#2E1A47]">Backup Lengkap Sistem (JSON)</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Seluruh produk, kategori, & pengaturan</p>
            </div>
            <Database className="w-4 h-4 text-gray-400 group-hover:text-[#2E1A47]" />
          </button>
        </div>
      </div>

      {/* Import CSV Section */}
      <div className="clay-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Impor Menu Masal dari CSV / Excel</span>
          </h3>

          <button
            onClick={handleDownloadProductTemplate}
            className="text-xs text-[#FF4500] font-bold hover:underline flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Template CSV</span>
          </button>
        </div>

        <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl text-center space-y-2">
          <Upload className="w-8 h-8 text-gray-400 mx-auto" />
          <p className="text-xs text-gray-700 font-semibold">
            Pilih file format .csv untuk memasukkan daftar produk secara masal
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleUploadCSV}
            className="text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#2E1A47] file:text-white hover:file:bg-[#FF4500] cursor-pointer"
          />
        </div>

        {importStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
