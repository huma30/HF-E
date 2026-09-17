import { Order, StoreSettings } from '../types';
import { ReceiptService } from './receiptService';
import { WhatsAppService } from './whatsappService';
import { errorService } from './errorService';

export interface PrinterCapabilities {
  hasWebBluetooth: boolean;
  hasWebShare: boolean;
  hasSystemPrint: boolean;
}

export type BluetoothStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'UNSUPPORTED';

export class PrinterService {
  private static bluetoothDevice: any = null;
  private static characteristic: any = null;
  private static connectionStatus: BluetoothStatus = 'DISCONNECTED';
  private static connectedDeviceName: string | null = null;
  private static statusListeners: Array<(status: BluetoothStatus, deviceName: string | null) => void> = [];

  /**
   * Check what the current browser/device supports
   */
  public static checkCapabilities(): PrinterCapabilities {
    const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const hasSystemPrint = typeof window !== 'undefined' && typeof window.print === 'function';

    return {
      hasWebBluetooth,
      hasWebShare,
      hasSystemPrint,
    };
  }

  public static getBluetoothStatus(): { status: BluetoothStatus; deviceName: string | null } {
    return {
      status: this.connectionStatus,
      deviceName: this.connectedDeviceName,
    };
  }

  public static onStatusChange(callback: (status: BluetoothStatus, deviceName: string | null) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.connectionStatus, this.connectedDeviceName);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== callback);
    };
  }

  private static notifyStatus(status: BluetoothStatus, deviceName: string | null) {
    this.connectionStatus = status;
    this.connectedDeviceName = deviceName;
    for (const listener of this.statusListeners) {
      try {
        listener(status, deviceName);
      } catch (e) {
        console.error('Error in printer status listener:', e);
      }
    }
  }

  /**
   * Connect to a Bluetooth thermal printer via Web Bluetooth API
   */
  public static async connectBluetooth(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    const { hasWebBluetooth } = this.checkCapabilities();
    if (!hasWebBluetooth) {
      this.notifyStatus('UNSUPPORTED', null);
      return { success: false, error: 'Web Bluetooth tidak didukung pada browser/perangkat ini. Gunakan Google Chrome pada Android, Windows, atau macOS.' };
    }

    try {
      this.notifyStatus('CONNECTING', null);

      // Common Thermal Printer Service UUIDs (Standard 0xFFE0, 0x18F0, or raw SPP)
      const nav: any = navigator;
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
          { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
          { services: ['49535343-fe7d-4ae5-8fa9-9fafd205e455'] },
          { namePrefix: 'MPT' },
          { namePrefix: 'RP' },
          { namePrefix: 'POS' },
          { namePrefix: 'Thermal' },
          { namePrefix: 'Printer' },
          { namePrefix: 'BT' },
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
        ],
        acceptAllDevices: false,
      }).catch(async (err: any) => {
        // Fallback to acceptAllDevices if filtered request is cancelled or failed
        if (err.name !== 'NotFoundError') {
          return await nav.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
              '000018f0-0000-1000-8000-00805f9b34fb',
              'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
              '49535343-fe7d-4ae5-8fa9-9fafd205e455',
              '0000ff00-0000-1000-8000-00805f9b34fb',
              '0000ffe0-0000-1000-8000-00805f9b34fb',
            ],
          });
        }
        throw err;
      });

      if (!device) {
        this.notifyStatus('DISCONNECTED', null);
        return { success: false, error: 'Pencarian perangkat dibatalkan.' };
      }

      device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null;
        this.bluetoothDevice = null;
        this.notifyStatus('DISCONNECTED', null);
      });

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let writeChar: any = null;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        throw new Error('Karakteristik write printer tidak ditemukan pada perangkat ini.');
      }

      this.bluetoothDevice = device;
      this.characteristic = writeChar;
      const deviceName = device.name || 'Thermal Printer';
      this.notifyStatus('CONNECTED', deviceName);

      return { success: true, deviceName };
    } catch (err: any) {
      this.notifyStatus('DISCONNECTED', null);
      if (err.name === 'NotFoundError') {
        return { success: false, error: 'Pencarian printer dibatalkan oleh pengguna.' };
      }
      errorService.capture(err, { action: 'connectBluetooth' });
      return { success: false, error: err?.message || 'Gagal menyambungkan ke printer Bluetooth.' };
    }
  }

  /**
   * Disconnect Bluetooth printer
   */
  public static async disconnectBluetooth(): Promise<void> {
    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      try {
        this.bluetoothDevice.gatt.disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    }
    this.characteristic = null;
    this.bluetoothDevice = null;
    this.notifyStatus('DISCONNECTED', null);
  }

  /**
   * Send binary payload to Bluetooth printer with chunking for MTU constraints
   */
  public static async sendBluetoothData(payload: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer Bluetooth belum terhubung. Silakan klik "Hubungkan Bluetooth" terlebih dahulu.');
    }

    // Most BLE printers accept 20 to 100 bytes chunks
    const CHUNK_SIZE = 100;
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      // Brief pause between chunks to prevent buffer overflow
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /**
   * Generates ESC/POS byte sequence with auto-cut command for Bluetooth/USB thermal printers
   */
  public static buildEscPosPayload(
    order: Order,
    settings?: Partial<StoreSettings>,
    logoRasterBytes?: number[]
  ): Uint8Array {
    const encoder = new TextEncoder();
    const paperWidth = settings?.paperWidth || '58mm';
    const lineWidth = paperWidth === '80mm' ? 48 : 32;

    const padRight = (str: string, len: number) => (str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length));
    const padLeft = (str: string, len: number) => (str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str);
    const formatRow = (left: string, right: string) => {
      const availableLeft = lineWidth - right.length - 1;
      const l = left.length > availableLeft ? left.slice(0, availableLeft) : left;
      const spaces = ' '.repeat(Math.max(1, lineWidth - l.length - right.length));
      return l + spaces + right + '\n';
    };

    const separator = '='.repeat(lineWidth) + '\n';
    const dashLine = '-'.repeat(lineWidth) + '\n';

    // ESC/POS Commands
    const ESC = 0x1B;
    const GS = 0x1D;

    const INIT = [ESC, 0x40]; // Initialize
    const ALIGN_LEFT = [ESC, 0x61, 0x00];
    const ALIGN_CENTER = [ESC, 0x61, 0x01];
    const ALIGN_RIGHT = [ESC, 0x61, 0x02];
    const BOLD_ON = [ESC, 0x45, 0x01];
    const BOLD_OFF = [ESC, 0x45, 0x00];
    const DOUBLE_SIZE = [GS, 0x21, 0x11]; // 2x width & 2x height
    const NORMAL_SIZE = [GS, 0x21, 0x00];

    const bytes: number[] = [];
    const addBytes = (arr: number[]) => bytes.push(...arr);
    const addText = (text: string) => {
      const enc = encoder.encode(text);
      for (let i = 0; i < enc.length; i++) bytes.push(enc[i]);
    };

    // 1. Initialize
    addBytes(INIT);

    // 1.5 Header: Logo Raster (if available)
    if (logoRasterBytes && logoRasterBytes.length > 0) {
      addBytes(ALIGN_CENTER);
      addBytes(logoRasterBytes);
      addText('\n');
    }

    // 2. Header: Center, Double Size Store Name
    addBytes(ALIGN_CENTER);
    addBytes(BOLD_ON);
    addBytes(DOUBLE_SIZE);
    addText(`${settings?.storeName || 'HUMA FOOD'}\n`);
    addBytes(NORMAL_SIZE);
    addBytes(BOLD_OFF);

    if (settings?.tagline) {
      addText(`${settings.tagline}\n`);
    }
    if (settings?.address) {
      addText(`${settings.address}\n`);
    }
    if (settings?.whatsapp) {
      addText(`WA: ${settings.whatsapp}\n`);
    }

    addText(separator);

    // 3. Order Info: Left
    addBytes(ALIGN_LEFT);
    addText(formatRow('No. Pesanan:', order.orderNumber));
    addText(formatRow('Tanggal:', new Date(order.createdAt).toLocaleString('id-ID')));
    addText(formatRow('Layanan:', order.serviceType));
    addText(formatRow('Pelanggan:', order.customer.name));
    if (order.customer.whatsapp && order.customer.whatsapp !== '-') {
      addText(formatRow('No. WA:', order.customer.whatsapp));
    }
    if (order.deliveryAreaName) {
      addText(formatRow('Area Antar:', order.deliveryAreaName));
    }
    if (order.cashierName) {
      addText(formatRow('Kasir:', order.cashierName));
    }

    addText(dashLine);

    // 4. Items List
    addBytes(BOLD_ON);
    addText(formatRow('ITEM', 'TOTAL'));
    addBytes(BOLD_OFF);
    addText(dashLine);

    for (const item of order.items) {
      const priceStr = `Rp ${item.lineTotal.toLocaleString('id-ID')}`;
      addBytes(BOLD_ON);
      addText(`${item.productName}\n`);
      addBytes(BOLD_OFF);

      const qtyAndPrice = `  ${item.quantity} x Rp ${item.unitPrice.toLocaleString('id-ID')}`;
      addText(formatRow(qtyAndPrice, priceStr));

      // Modifiers
      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        for (const mod of item.selectedModifiers) {
          const modText = `   + ${mod.item.name}`;
          const modPrice = mod.item.price > 0 ? `Rp ${mod.item.price.toLocaleString('id-ID')}` : 'Gratis';
          addText(formatRow(modText, modPrice));
        }
      }

      if (item.notes) {
        addText(`   Ket: ${item.notes}\n`);
      }
    }

    addText(dashLine);

    // 5. Totals
    addText(formatRow('Subtotal:', `Rp ${order.subtotal.toLocaleString('id-ID')}`));
    if (order.discount > 0) {
      addText(formatRow('Diskon:', `-Rp ${order.discount.toLocaleString('id-ID')}`));
    }
    if (order.deliveryFee > 0) {
      addText(formatRow('Ongkir:', `Rp ${order.deliveryFee.toLocaleString('id-ID')}`));
    }

    addText(separator);

    addBytes(BOLD_ON);
    addText(formatRow('TOTAL AKHIR:', `Rp ${order.total.toLocaleString('id-ID')}`));
    addBytes(BOLD_OFF);

    addText(formatRow('Pembayaran:', order.paymentMethod));
    if (order.amountPaid > 0) {
      addText(formatRow('Diterima:', `Rp ${order.amountPaid.toLocaleString('id-ID')}`));
      addText(formatRow('Kembalian:', `Rp ${order.change.toLocaleString('id-ID')}`));
    }

    addText(separator);

    // 6. Footer (Customizable)
    addBytes(ALIGN_CENTER);

    const footerMsg = settings?.receiptFooterMessage !== undefined
      ? settings.receiptFooterMessage
      : 'Terima kasih atas pesanan Anda!';
    if (footerMsg && footerMsg.trim()) {
      addBytes(BOLD_ON);
      addText(`${footerMsg.trim()}\n`);
      addBytes(BOLD_OFF);
    }

    const showTagline = settings?.receiptFooterShowTagline !== false;
    const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
    if (showTagline && tagline && tagline.trim()) {
      addText(`"${tagline.trim()}"\n`);
    }

    const footerNote = settings?.receiptFooterNote !== undefined
      ? settings.receiptFooterNote
      : 'Simpan struk ini sebagai bukti transaksi';
    if (footerNote && footerNote.trim()) {
      addText(`${footerNote.trim()}\n`);
    }

    if (settings?.receiptFooterCustomText && settings.receiptFooterCustomText.trim()) {
      const customLines = settings.receiptFooterCustomText.split('\n');
      customLines.forEach((cLine) => {
        if (cLine.trim()) {
          addText(`${cLine.trim()}\n`);
        }
      });
    }

    if (settings?.receiptFooterShowGoogleReview && settings?.googleReviewUrl) {
      addText('Beri ulasan kami di Google Maps!\n');
    }

    // 7. Feed and Paper Cut
    addText('\n\n\n\n');
    if (settings?.autoCutEnabled !== false) {
      addBytes([GS, 0x56, 0x01]); // Partial paper cut
    }

    return new Uint8Array(bytes);
  }

  /**
   * Print receipt via connected Bluetooth thermal printer
   */
  public static async printViaBluetooth(order: Order, settings?: Partial<StoreSettings>): Promise<void> {
    let logoRaster: number[] | undefined;
    try {
      logoRaster = await ReceiptService.getEscPosLogoRaster(settings);
    } catch (err) {
      console.warn('[HUMA Printer] Failed to get logo raster for Bluetooth print:', err);
    }
    const payload = this.buildEscPosPayload(order, settings, logoRaster);
    await this.sendBluetoothData(payload);
  }

  /**
   * Test Print via connected Bluetooth thermal printer
   */
  public static async testPrintBluetooth(settings?: Partial<StoreSettings>): Promise<void> {
    const encoder = new TextEncoder();
    const bytes: number[] = [
      0x1B, 0x40, // Init
      0x1B, 0x61, 0x01, // Center
      0x1B, 0x45, 0x01, // Bold
      0x1D, 0x21, 0x11, // Double size
    ];

    const storeName = settings?.storeName || 'HUMA FOOD';
    for (const b of encoder.encode(`${storeName}\n`)) bytes.push(b);

    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00); // Normal size
    for (const b of encoder.encode('TES CETAK PRINTER THERMAL\n')) bytes.push(b);
    for (const b of encoder.encode('Status: TERHUBUNG NORMAL\n')) bytes.push(b);
    for (const b of encoder.encode(`${new Date().toLocaleString('id-ID')}\n`));
    for (const b of encoder.encode('================================\n\n\n\n')) bytes.push(b);

    // Auto Cut
    bytes.push(0x1D, 0x56, 0x01);

    await this.sendBluetoothData(new Uint8Array(bytes));
  }

  /**
   * Browser system print for thermal receipt (58mm / 80mm) with store logo,
   * high-contrast typography, and auto-cut compatibility.
   */
  public static printViaBrowser(order: Order, settings?: Partial<StoreSettings>): void {
    const html = ReceiptService.formatHtmlReceipt(order, settings);
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = settings?.paperWidth === '80mm' ? '580px' : '480px';
    iframe.style.height = '800px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let hasPrinted = false;
    const triggerPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Fallback window.print', err);
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }
    };

    // Wait for the logo image in the iframe to fully load before triggering print
    const logoImg = doc.querySelector('img.logo-img') as HTMLImageElement | null;
    if (logoImg && !logoImg.complete) {
      logoImg.onload = () => {
        setTimeout(triggerPrint, 120);
      };
      logoImg.onerror = () => {
        triggerPrint();
      };
      // Safety fallback if onload doesn't fire
      setTimeout(triggerPrint, 1000);
    } else {
      setTimeout(triggerPrint, 250);
    }
  }

  /**
   * Share receipt image directly via Web Share API or fallback to image download + WhatsApp link
   */
  public static async shareReceiptImageViaWhatsApp(
    order: Order,
    settings?: Partial<StoreSettings>,
    targetPhone?: string
  ): Promise<{ sharedViaNative: boolean; downloaded: boolean; openedWhatsApp: boolean }> {
    const phoneToUse = targetPhone || order.customer.whatsapp || settings?.whatsapp || WhatsAppService.STORE_PHONE;
    const cleanPhone = phoneToUse.replace(/^0/, '62').replace(/[^0-9]/g, '');

    const blob = await ReceiptService.generateReceiptBlob(order, settings);
    
    if (blob && typeof navigator !== 'undefined' && navigator.canShare) {
      try {
        const file = new File([blob], `Struk-${order.orderNumber}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Struk Pesanan ${order.orderNumber} - ${settings?.storeName || 'HUMA'}`,
            text: `Struk bukti pesanan ${order.orderNumber}. Total: Rp ${order.total.toLocaleString('id-ID')}`,
            files: [file],
          });
          return { sharedViaNative: true, downloaded: false, openedWhatsApp: true };
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return { sharedViaNative: false, downloaded: false, openedWhatsApp: false };
        }
      }
    }

    await ReceiptService.downloadReceiptImage(order, settings);
    const waUrl = WhatsAppService.getWhatsAppUrl(order, cleanPhone);
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    return { sharedViaNative: false, downloaded: true, openedWhatsApp: true };
  }
}
