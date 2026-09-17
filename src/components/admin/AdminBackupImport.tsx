import React, { useState, useRef } from 'react';
import { Order, Product, StoreSettings, Category } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { Download, Upload, FileSpreadsheet, Database, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

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
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      `"${(o.customer?.name || '').replace(/"/g, '""')}"`,
      o.customer?.whatsapp || '-',
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

  // Download Sample Excel (.xlsx) & CSV template for products
  const handleDownloadProductTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    const templateData = [
      {
        Nama_Menu: 'Seblak Makaroni Baso',
        Deskripsi: 'Seblak kuah kencur gurih dengan makaroni dan baso sapi',
        Harga: 16000,
        Kategori: categories[0]?.name || 'Seblak Prasmanan',
        Foto_URL: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
        Tersedia: 'YA',
      },
      {
        Nama_Menu: 'Es Teh Manis Jumbo',
        Deskripsi: 'Es teh manis segar ukuran jumbo 22oz',
        Harga: 5000,
        Kategori: categories[1]?.name || 'Minuman Segar',
        Foto_URL: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80',
        Tersedia: 'YA',
      },
      {
        Nama_Menu: 'Baso Aci Kuah Mercon',
        Deskripsi: 'Baso aci kenyal isi pedas dengan pilus cikur dan jeruk limau',
        Harga: 15000,
        Kategori: categories[0]?.name || 'Seblak Prasmanan',
        Foto_URL: '',
        Tersedia: 'YA',
      },
    ];

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(templateData);
      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Nama_Menu
        { wch: 45 }, // Deskripsi
        { wch: 12 }, // Harga
        { wch: 20 }, // Kategori
        { wch: 55 }, // Foto_URL
        { wch: 10 }, // Tersedia
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Menu Template');
      XLSX.writeFile(wb, 'template_import_produk_huma.xlsx');
    } else {
      const sample = `Nama_Menu,Deskripsi,Harga,Kategori,Foto_URL,Tersedia\n"Seblak Makaroni Baso","Seblak kuah kencur gurih dengan makaroni dan baso sapi",16000,"${categories[0]?.name || 'Seblak Prasmanan'}","https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",YA\n"Es Teh Manis Jumbo","Es teh manis segar ukuran jumbo 22oz",5000,"${categories[1]?.name || 'Minuman Segar'}","https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80",YA`;
      const blob = new Blob(['\uFEFF' + sample], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `template_import_produk_huma.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  // Helper to match category by name or ID
  const resolveCategoryId = (catVal: string | undefined): string => {
    if (!catVal || typeof catVal !== 'string') {
      return categories[0]?.id || 'cat_seblak';
    }
    const clean = catVal.trim().toLowerCase();
    const found = categories.find(
      (c) => c.name.toLowerCase() === clean || c.id.toLowerCase() === clean
    );
    if (found) return found.id;
    // Partial match
    const partial = categories.find((c) => c.name.toLowerCase().includes(clean) || clean.includes(c.name.toLowerCase()));
    return partial ? partial.id : (categories[0]?.id || 'cat_seblak');
  };

  // Handle Excel (.xlsx, .xls) & CSV file upload & parsing
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportStatus(null);
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('File tidak memiliki sheet yang dapat dibaca.');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rawRows || rawRows.length <= 1) {
        throw new Error('File kosong atau tidak memiliki baris data produk.');
      }

      // Identify header index
      const headerRow: string[] = (rawRows[0] || []).map((h: any) => String(h).trim().toLowerCase());
      
      const findCol = (keys: string[]): number => {
        return headerRow.findIndex((col) => keys.some((k) => col.includes(k)));
      };

      const nameIdx = findCol(['nama', 'name', 'menu', 'produk', 'item']);
      const descIdx = findCol(['deskripsi', 'desc', 'keterangan', 'detail']);
      const priceIdx = findCol(['harga', 'price', 'rp', 'tarif']);
      const catIdx = findCol(['kategori', 'category', 'jenis', 'grup']);
      const imgIdx = findCol(['foto', 'gambar', 'image', 'photo', 'url']);
      const availIdx = findCol(['tersedia', 'available', 'status', 'aktif']);

      const finalNameIdx = nameIdx >= 0 ? nameIdx : 0;
      const finalDescIdx = descIdx >= 0 ? descIdx : (rawRows[0]?.length > 1 ? 1 : -1);
      const finalPriceIdx = priceIdx >= 0 ? priceIdx : (rawRows[0]?.length > 2 ? 2 : -1);
      const finalCatIdx = catIdx >= 0 ? catIdx : (rawRows[0]?.length > 3 ? 3 : -1);
      const finalImgIdx = imgIdx >= 0 ? imgIdx : (rawRows[0]?.length > 4 ? 4 : -1);

      const newProductsToInsert: Array<Omit<Product, 'id'>> = [];
      const defaultImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';

      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        const rawName = row[finalNameIdx];
        if (!rawName || String(rawName).trim() === '') continue;

        const name = String(rawName).trim();
        const desc = finalDescIdx >= 0 && row[finalDescIdx] !== undefined ? String(row[finalDescIdx]).trim() : '';
        
        let price = 0;
        if (finalPriceIdx >= 0 && row[finalPriceIdx] !== undefined) {
          const rawPrice = String(row[finalPriceIdx]).replace(/[^0-9]/g, '');
          price = parseInt(rawPrice, 10) || 10000;
        } else {
          price = 10000;
        }

        const catName = finalCatIdx >= 0 && row[finalCatIdx] !== undefined ? String(row[finalCatIdx]).trim() : '';
        const categoryId = resolveCategoryId(catName);

        let imgUrl = defaultImg;
        if (finalImgIdx >= 0 && row[finalImgIdx] !== undefined && String(row[finalImgIdx]).trim().startsWith('http')) {
          imgUrl = String(row[finalImgIdx]).trim();
        }

        let isAvail = true;
        if (availIdx >= 0 && row[availIdx] !== undefined) {
          const rawAvail = String(row[availIdx]).trim().toLowerCase();
          if (rawAvail === 'tidak' || rawAvail === 'no' || rawAvail === 'habis' || rawAvail === 'false' || rawAvail === '0') {
            isAvail = false;
          }
        }

        newProductsToInsert.push({
          name,
          description: desc,
          price,
          categoryId,
          imageUrl: imgUrl,
          isAvailable: isAvail,
          isActive: true,
          wholesaleEnabled: false,
          modifierGroupIds: [],
        });
      }

      if (newProductsToInsert.length === 0) {
        throw new Error('Tidak ada baris produk valid yang ditemukan dalam file. Pastikan kolom Nama Menu terisi.');
      }

      // Execute bulk insert via high-performance Firestore write batch
      const result = await FirestoreService.bulkCreateProducts(newProductsToInsert);

      let msg = `Berhasil mengimpor ${result.insertedCount} menu baru ke database HUMA Food!`;
      if (result.skippedDuplicatesCount > 0) {
        msg += ` (${result.skippedDuplicatesCount} produk duplikat dilewati: ${result.duplicateNames.slice(0, 3).join(', ')}${result.duplicateNames.length > 3 ? '...' : ''})`;
      }
      setImportStatus(msg);
      onRefresh();
    } catch (err: any) {
      console.error('Import error:', err);
      setImportError(err?.message || 'Gagal memproses file. Pastikan format Excel (.xlsx/.xls) atau CSV sesuai.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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

      {/* Import Excel / CSV Section */}
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Impor Menu Masal dari Excel / CSV</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Mendukung file Microsoft Excel (.xlsx, .xls) dan file CSV
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownloadProductTemplate('xlsx')}
              className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-xl border border-emerald-200 font-bold flex items-center gap-1.5 transition-colors"
              title="Unduh template Microsoft Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Template Excel (.xlsx)</span>
            </button>
            <button
              onClick={() => handleDownloadProductTemplate('csv')}
              className="text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-xl border border-gray-200 font-medium flex items-center gap-1.5 transition-colors"
              title="Unduh template CSV biasa"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-b from-gray-50 to-white border-2 border-dashed border-gray-200 rounded-2xl text-center space-y-3">
          <Upload className="w-8 h-8 text-emerald-600 mx-auto" />
          <div>
            <p className="text-xs text-gray-800 font-bold">
              Pilih file Excel (.xlsx / .xls) atau .csv untuk impor produk masal
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              Format kolom otomatis disesuaikan (Nama_Menu, Deskripsi, Harga, Kategori, Foto_URL, Tersedia)
            </p>
          </div>

          <div className="flex justify-center pt-1">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all cursor-pointer ${
              isImporting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#2E1A47] hover:bg-[#FF4500]'
            }`}>
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sedang Mengimpor Menu...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Pilih File Excel / CSV</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                disabled={isImporting}
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleUploadFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {importStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
