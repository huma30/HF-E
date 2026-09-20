import { Order, StoreSettings, PointRedemption, Customer } from '../types';

export class ReceiptService {
  private static readonly DASH_LINE = '----------------------------------------';

  private static getDisplayGroups(order: Order) {
    return order.groups && order.groups.length > 0 ? order.groups : [];
  }

  private static appendGroupText(lines: string[], order: Order): void {
    const groups = this.getDisplayGroups(order);
    groups.forEach((group, index) => {
      lines.push(`GROUP ${index + 1}${group.categoryId ? ` [${group.categoryId}]` : ''}`);
      group.items.forEach((item) => {
        const lineText = `${item.quantity}x ${item.name}`.padEnd(26, ' ') + `Rp ${item.subtotal.toLocaleString('id-ID')}`.padStart(14, ' ');
        lines.push(lineText);
        if (item.selectedModifiers?.length) lines.push(`   ↳ ${item.selectedModifiers.map((m) => m.item.name).join(', ')}`);
        if (item.notes?.trim()) lines.push(`   ↳ Catatan: "${item.notes.trim()}"`);
      });
      if (group.modifiers.length) {
        lines.push(`   ↳ Bumbu: ${group.modifiers.map((m) => m.name).join(', ')}`);
      }
      if (group.note?.trim()) lines.push(`   ↳ Catatan Group: "${group.note.trim()}"`);
      if (index < groups.length - 1) lines.push(ReceiptService.DASH_LINE);
    });
  }


  /**
   * Format standard thermal receipt text (58mm/80mm compatible)
   */
  public static formatTextReceipt(order: Order, settings?: Partial<StoreSettings>): string {
    const storeName = settings?.storeName || 'HUMA FOOD';
    const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
    const address = settings?.address || 'Perum Gina Blok B No. 12';
    const wa = settings?.whatsapp || '085878775527';

    const eqLine = '========================================';
    const dashLine = '----------------------------------------';

    const formattedDate = new Date(order.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const lines: string[] = [
      eqLine,
      `             ${storeName}`,
      `     "${tagline}"`,
      `       ${address}`,
      `          WA: ${wa}`,
      eqLine,
      '',
      `No. Pesanan : ${order.orderNumber}`,
      `Tanggal     : ${formattedDate}`,
      `Pelanggan   : ${order.customer.name}`,
      `No. WA      : ${order.customer.whatsapp && order.customer.whatsapp !== '-' ? order.customer.whatsapp : '-'}`,
      `Layanan     : ${order.serviceType === 'DELIVERY' ? `Delivery (${order.deliveryAreaName || 'Area'})` : order.serviceType === 'TAKEAWAY' ? 'Takeaway' : 'Dine In'}`,
    ];

    if (order.serviceType === 'DELIVERY' && order.customer.address) {
      lines.push(`Alamat      : ${order.customer.address}`);
    }

    if (order.cashierName) {
      lines.push(`Kasir       : ${order.cashierName}`);
    }

    lines.push(dashLine);
    lines.push('ITEM');
    lines.push(dashLine);

    if (order.groups && order.groups.length > 0) {
      this.appendGroupText(lines, order);
    } else {
      order.items.forEach((item) => {
        const lineText = `${item.quantity}x ${item.productName}`.padEnd(26, ' ') + `Rp ${item.lineTotal.toLocaleString('id-ID')}`.padStart(14, ' ');
        lines.push(lineText);
        if (item.selectedModifiers?.length) lines.push(`   ↳ ${item.selectedModifiers.map((m) => m.item.name).join(', ')}`);
        if (item.notes?.trim()) lines.push(`   ↳ Catatan: "${item.notes.trim()}"`);
      });
      if (order.batchModifiers?.length) {
        lines.push(dashLine);
        lines.push('PILIHAN BUMBU:');
        order.batchModifiers.forEach((bm) => {
          const optionNames = bm.selectedModifiers?.map((m) => m.modifierName) || bm.options.filter((o) => (o.quantity ?? 1) > 0).map((o) => o.modifierName);
          if (optionNames.length) lines.push(` * ${bm.modifierGroupName || bm.categoryName}: ${optionNames.join(', ')}`);
        });
      }
    }

    lines.push(dashLine);
    lines.push('RINGKASAN PEMBAYARAN');
    lines.push('Subtotal Semua Pesanan'.padEnd(26, ' ') + 'Rp ' + order.subtotal.toLocaleString('id-ID').padStart(14, ' '));

    if (order.discount > 0) {
      lines.push('Total Potongan'.padEnd(26, ' ') + '-Rp ' + order.discount.toLocaleString('id-ID').padStart(14, ' '));
    }

    if (order.serviceType === 'DELIVERY') {
      lines.push('Ongkos Kirim'.padEnd(26, ' ') + `Rp ${order.deliveryFee.toLocaleString('id-ID')}`.padStart(14, ' '));
    }

    lines.push(dashLine);
    lines.push('TOTAL BAYAR'.padEnd(26, ' ') + `Rp ${order.total.toLocaleString('id-ID')}`.padStart(14, ' '));
    lines.push(eqLine);

    const paymentLabel = 
      order.paymentMethod === 'CASH' ? 'Tunai (Cash)' :
      order.paymentMethod === 'COD' ? 'Tunai / COD' :
      order.paymentMethod === 'QRIS' ? 'QRIS Digital' :
      order.paymentMethod === 'BANK_TRANSFER' ? 'Transfer Bank' : 'Split Payment';

    lines.push(`Pembayaran  : ${paymentLabel}`);

    if (order.amountPaid) {
      lines.push(`Uang Diterima: Rp ${order.amountPaid.toLocaleString('id-ID')}`);
      lines.push(`Kembali     : Rp ${(order.change || 0).toLocaleString('id-ID')}`);
    }

    lines.push('----------------------------------------');
    lines.push('     Terima kasih atas pesanan Anda!');
    lines.push(`       ${tagline}`);
    lines.push('   Simpan struk ini sebagai bukti transaksi');
    lines.push('----------------------------------------');

    if (settings?.autoCutEnabled) {
      lines.push('\n\n\n[-- AUTO-CUT PRINTER --]');
    }

    return lines.join('\n');
  }

  /**
   * Resolves the effective receipt logo URL with fallback to default HUMA receipt logo
   */
  public static getEffectiveReceiptLogo(settings?: Partial<StoreSettings>): string {
    const rLogo = settings?.receiptLogoUrl?.trim();
    if (rLogo) return rLogo;
    const sLogo = settings?.logoUrl?.trim();
    if (sLogo) return sLogo;
    return '/huma_receipt_logo.png';
  }

  /**
   * Helper to load an image asynchronously with crossOrigin and data/blob URL safety
   */
  private static loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (!src || typeof src !== 'string' || !src.trim()) {
        return reject(new Error('URL gambar kosong.'));
      }

      const img = new Image();
      const isRemoteHttp = src.startsWith('http://') || src.startsWith('https://');
      
      // Resolve relative path to absolute URL if running in browser
      const fullSrc = !isRemoteHttp && !src.startsWith('data:') && !src.startsWith('blob:') && typeof window !== 'undefined'
        ? (src.startsWith('/') ? `${window.location.origin}${src}` : `${window.location.origin}/${src}`)
        : src;

      // Only set crossOrigin on remote HTTP/HTTPS assets
      if (isRemoteHttp) {
        img.crossOrigin = 'anonymous';
      }

      const timer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        reject(new Error('Timeout memuat gambar struk (4s).'));
      }, 4000);

      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };

      img.onerror = () => {
        clearTimeout(timer);
        // If remote image failed with crossOrigin, try once without crossOrigin as fallback
        if (isRemoteHttp && img.crossOrigin) {
          const retryImg = new Image();
          retryImg.onload = () => resolve(retryImg);
          retryImg.onerror = () => reject(new Error('Gagal memuat gambar struk.'));
          retryImg.src = fullSrc;
        } else {
          reject(new Error('Gagal memuat gambar struk.'));
        }
      };

      img.src = fullSrc;

      // Handle already cached images
      if (img.complete && img.naturalWidth > 0) {
        clearTimeout(timer);
        resolve(img);
      }
    });
  }

  /**
   * Generates ESC/POS GS v 0 raster bit image bytes for thermal Bluetooth/USB printing
   */
  public static async getEscPosLogoRaster(settings?: Partial<StoreSettings>): Promise<number[]> {
    const logoUrl = this.getEffectiveReceiptLogo(settings);
    if (!logoUrl) return [];

    try {
      const img = await this.loadImage(logoUrl);
      const is80mm = settings?.paperWidth === '80mm';
      const targetPaperDots = is80mm ? 576 : 384;
      const bytesPerLine = targetPaperDots / 8; // 48 bytes for 58mm, 72 bytes for 80mm

      const origW = img.naturalWidth || img.width || 1;
      const origH = img.naturalHeight || img.height || 1;

      // Scale logo to fit nicely in thermal receipt header (max width 288 for 58mm, 420 for 80mm)
      const maxLogoDotsW = is80mm ? 420 : 288;
      const maxLogoDotsH = 100;
      const scale = Math.min(maxLogoDotsW / origW, maxLogoDotsH / origH, 1);

      const drawW = Math.max(1, Math.round(origW * scale));
      const drawH = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetPaperDots;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];

      // Fill white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetPaperDots, drawH);

      // Draw logo centered
      const drawX = Math.round((targetPaperDots - drawW) / 2);
      ctx.drawImage(img, drawX, 0, drawW, drawH);

      const imgData = ctx.getImageData(0, 0, targetPaperDots, drawH).data;

      // ESC/POS GS v 0 format:
      // GS v 0 m xL xH yL yH d1...dk
      // m = 0 (normal mode)
      const xL = bytesPerLine & 0xFF;
      const xH = (bytesPerLine >> 8) & 0xFF;
      const yL = drawH & 0xFF;
      const yH = (drawH >> 8) & 0xFF;

      const rasterBytes: number[] = [
        0x1D, 0x76, 0x30, 0x00,
        xL, xH, yL, yH,
      ];

      for (let y = 0; y < drawH; y++) {
        for (let byteIdx = 0; byteIdx < bytesPerLine; byteIdx++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = byteIdx * 8 + bit;
            const idx = (y * targetPaperDots + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const a = imgData[idx + 3];

            // If transparent or light pixel -> white (0)
            // If dark pixel -> black thermal dot (1)
            let isBlack = false;
            if (a > 64) {
              const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
              if (luminance < 165) {
                isBlack = true;
              }
            }

            if (isBlack) {
              byteVal |= (1 << (7 - bit));
            }
          }
          rasterBytes.push(byteVal);
        }
      }

      return rasterBytes;
    } catch (err) {
      console.warn('[HUMA Receipt] Failed to generate ESC/POS logo raster:', err);
      return [];
    }
  }

  /**
   * Generate crystal-clear PNG image of the thermal receipt, complete with logo,
   * detailed items, pricing breakdown, QRIS code (if applicable), and footer.
   */
  public static async generateReceiptImage(order: Order, settings?: Partial<StoreSettings>): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Thermal roll dimensions (58mm paper represented at 480px width)
    const paperWidth = settings?.paperWidth === '80mm' ? 580 : 480;
    const padding = 24;
    const contentWidth = paperWidth - padding * 2;

    // Load effective logo (check receiptLogoUrl -> logoUrl -> default huma_receipt_logo)
    const logoUrl = this.getEffectiveReceiptLogo(settings);
    let logoImg: HTMLImageElement | null = null;
    let logoHeight = 0;
    const MAX_LOGO_WIDTH = 220;
    const MAX_LOGO_HEIGHT = 80;

    if (logoUrl) {
      try {
        logoImg = await this.loadImage(logoUrl);
        const origW = logoImg.naturalWidth || logoImg.width || 1;
        const origH = logoImg.naturalHeight || logoImg.height || 1;
        const scale = Math.min(MAX_LOGO_WIDTH / origW, MAX_LOGO_HEIGHT / origH, 1);
        logoHeight = Math.round(origH * scale) + 14; // with bottom spacing
      } catch (err) {
        console.warn('[HUMA Receipt] Failed to load logo for canvas render:', err);
        logoImg = null;
      }
    }

    // Estimate total canvas height
    const baseLineHeight = 22;
    const itemCount = order.groups?.length
      ? order.groups.reduce((sum, group) => sum + group.items.length, 0)
      : order.items.length;
    const groupCount = order.groups?.length || 0;
    const modCount = order.groups?.length
      ? order.groups.reduce(
          (sum, group) =>
            sum +
            group.items.reduce((n, item) => n + (item.selectedModifiers?.length || 0), 0) +
            (group.modifiers?.length || 0),
          0
        )
      : order.items.reduce((acc, i) => acc + (i.selectedModifiers?.length || 0), 0);
    const estimatedLines = 30 + itemCount * 3 + modCount + groupCount * 5;
    const totalHeight = padding * 2 + logoHeight + estimatedLines * baseLineHeight + (settings?.autoCutEnabled ? 40 : 0);

    // Render at 2x pixel ratio for sharp display & mobile clarity
    const scaleFactor = 2;
    canvas.width = paperWidth * scaleFactor;
    canvas.height = totalHeight * scaleFactor;
    ctx.scale(scaleFactor, scaleFactor);

    // Canvas Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, paperWidth, totalHeight);

    let currentY = padding;

    // 1. Draw Logo (if available)
    if (logoImg) {
      const origW = logoImg.naturalWidth || logoImg.width || 1;
      const origH = logoImg.naturalHeight || logoImg.height || 1;
      const scale = Math.min(MAX_LOGO_WIDTH / origW, MAX_LOGO_HEIGHT / origH, 1);
      const drawW = Math.max(1, Math.round(origW * scale));
      const drawH = Math.max(1, Math.round(origH * scale));
      const drawX = Math.round((paperWidth - drawW) / 2);

      ctx.drawImage(logoImg, drawX, currentY, drawW, drawH);
      currentY += drawH + 12;
    }

    // 2. Header Store Information
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    
    ctx.font = 'bold 18px "Courier New", Courier, monospace';
    ctx.fillText((settings?.storeName || 'HUMA FOOD').toUpperCase(), paperWidth / 2, currentY);
    currentY += 20;

    ctx.font = 'italic 12px "Courier New", Courier, monospace';
    ctx.fillText(`"${settings?.tagline || 'Jajan dekat rasa bersahabat'}"`, paperWidth / 2, currentY);
    currentY += 18;

    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.fillText(settings?.address || 'Perum Gina Blok B No. 12', paperWidth / 2, currentY);
    currentY += 16;
    ctx.fillText(`WA: ${settings?.whatsapp || '085878775527'}`, paperWidth / 2, currentY);
    currentY += 20;

    // Draw Double Separator
    const drawLine = (y: number, char = '=') => {
      ctx.textAlign = 'center';
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText(char.repeat(paperWidth > 500 ? 46 : 38), paperWidth / 2, y);
    };

    drawLine(currentY, '=');
    currentY += 18;

    // 3. Transaction Details
    ctx.textAlign = 'left';
    ctx.font = '12px "Courier New", Courier, monospace';

    const formattedDate = new Date(order.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const drawRow = (label: string, value: string) => {
      ctx.textAlign = 'left';
      ctx.fillText(label, padding, currentY);
      ctx.textAlign = 'right';
      ctx.fillText(value, paperWidth - padding, currentY);
      currentY += 18;
    };

    drawRow('No. Pesanan', order.orderNumber);
    drawRow('Tanggal', formattedDate);
    drawRow('Pelanggan', order.customer.name);
    drawRow('Layanan', order.serviceType === 'DELIVERY' ? `Delivery (${order.deliveryAreaName || 'Area'})` : order.serviceType === 'TAKEAWAY' ? 'Takeaway' : 'Dine In');

    if (order.serviceType === 'DELIVERY' && order.customer.address) {
      drawRow('Alamat', order.customer.address);
    }
    if (order.cashierName) {
      drawRow('Kasir', order.cashierName);
    }

    drawLine(currentY, '-');
    currentY += 18;

    // 4. Items List
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Courier New", Courier, monospace';
    ctx.fillText('ITEM', padding, currentY);
    ctx.textAlign = 'right';
    ctx.fillText('TOTAL', paperWidth - padding, currentY);
    currentY += 16;

    drawLine(currentY, '-');
    currentY += 18;

    ctx.font = '12px "Courier New", Courier, monospace';
    if (order.groups && order.groups.length > 0) {
      order.groups.forEach((group, groupIndex) => {
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px "Courier New", Courier, monospace';
        ctx.fillText(`GROUP ${groupIndex + 1}`, padding, currentY);
        currentY += 16;
        ctx.font = '12px "Courier New", Courier, monospace';

        group.items.forEach((item) => {
          ctx.textAlign = 'left';
          ctx.fillText(`${item.quantity}x ${item.name}`, padding, currentY);
          ctx.textAlign = 'right';
          ctx.fillText(`Rp ${item.subtotal.toLocaleString('id-ID')}`, paperWidth - padding, currentY);
          currentY += 16;

          if (item.selectedModifiers?.length) {
            ctx.textAlign = 'left';
            ctx.font = '11px "Courier New", Courier, monospace';
            ctx.fillText(`   ↳ Pilihan: ${item.selectedModifiers.map((m) => m.item.name).join(', ')}`, padding, currentY);
            currentY += 15;
            ctx.font = '12px "Courier New", Courier, monospace';
          }

          if (item.notes?.trim()) {
            ctx.textAlign = 'left';
            ctx.font = '11px "Courier New", Courier, monospace';
            ctx.fillText(`   ↳ Catatan: "${item.notes.trim()}"`, padding, currentY);
            currentY += 15;
            ctx.font = '12px "Courier New", Courier, monospace';
          }
        });

        ctx.textAlign = 'left';
        ctx.font = 'bold 11px "Courier New", Courier, monospace';
        ctx.fillText(
          `   BUMBU: ${group.modifiers?.length ? group.modifiers.map((m) => m.name).join(', ') : '-'}`,
          padding,
          currentY
        );
        currentY += 15;

        if (group.note?.trim()) {
          ctx.font = '11px "Courier New", Courier, monospace';
          ctx.fillText(`   Catatan Group: "${group.note.trim()}"`, padding, currentY);
          currentY += 15;
        }

        currentY += 5;

        if (groupIndex < order.groups!.length - 1) {
          drawLine(currentY, '-');
          currentY += 15;
        }
      });
    } else {
      order.items.forEach((item) => {
        ctx.textAlign = 'left';
        ctx.fillText(`${item.quantity}x ${item.productName}`, padding, currentY);
        ctx.textAlign = 'right';
        ctx.fillText(`Rp ${item.lineTotal.toLocaleString('id-ID')}`, paperWidth - padding, currentY);
        currentY += 16;

        if (item.selectedModifiers?.length) {
          ctx.textAlign = 'left';
          ctx.font = '11px "Courier New", Courier, monospace';
          ctx.fillText(`   ↳ Pilihan: ${item.selectedModifiers.map((m) => m.item.name).join(', ')}`, padding, currentY);
          currentY += 15;
          ctx.font = '12px "Courier New", Courier, monospace';
        }

        if (item.notes?.trim()) {
          ctx.textAlign = 'left';
          ctx.font = '11px "Courier New", Courier, monospace';
          ctx.fillText(`   ↳ Catatan: "${item.notes.trim()}"`, padding, currentY);
          currentY += 15;
          ctx.font = '12px "Courier New", Courier, monospace';
        }
      });
    }

    if (order.batchModifiers && order.batchModifiers.length > 0) {
      drawLine(currentY, '-');
      currentY += 16;
      ctx.font = 'bold 11px "Courier New", Courier, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('PILIHAN BUMBU:', padding, currentY);
      currentY += 15;
      ctx.font = '11px "Courier New", Courier, monospace';
      order.batchModifiers.forEach((bm) => {
        const optionNames =
          bm.selectedModifiers?.map((m) => m.modifierName) ||
          bm.options.filter((o) => (o.quantity ?? 1) > 0).map((o) => o.modifierName);
        if (optionNames.length > 0) {
          ctx.fillText(` * ${bm.modifierGroupName || bm.categoryName}: ${optionNames.join(', ')}`, padding, currentY);
          currentY += 15;
        }
      });
      ctx.font = '12px "Courier New", Courier, monospace';
    }

    drawLine(currentY, '-');
    currentY += 18;

    // 5. Payment Breakdown
    ctx.font = '12px "Courier New", Courier, monospace';
    drawRow('Subtotal Semua Pesanan', 'Rp ' + order.subtotal.toLocaleString('id-ID'));
    if (order.discount > 0) {
      drawRow('Total Potongan', '-Rp ' + order.discount.toLocaleString('id-ID'));
    }
    if (order.serviceType === 'DELIVERY') {
      drawRow('Ongkos Kirim', 'Rp ' + order.deliveryFee.toLocaleString('id-ID'));
    }

    drawLine(currentY, '=');
    currentY += 20;

    // Grand Total
    ctx.font = 'bold 15px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL BAYAR', padding, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(`Rp ${order.total.toLocaleString('id-ID')}`, paperWidth - padding, currentY);
    currentY += 22;

    drawLine(currentY, '=');
    currentY += 18;

    // Payment Info
    ctx.font = '12px "Courier New", Courier, monospace';
    const paymentLabel = 
      order.paymentMethod === 'CASH' ? 'Tunai' :
      order.paymentMethod === 'COD' ? 'Tunai / COD' :
      order.paymentMethod === 'QRIS' ? 'QRIS Digital' :
      order.paymentMethod === 'BANK_TRANSFER' ? 'Transfer Bank' : 'Split Payment';

    drawRow('Metode Bayar', paymentLabel);
    if (order.amountPaid) {
      drawRow('Uang Diterima', `Rp ${order.amountPaid.toLocaleString('id-ID')}`);
      drawRow('Kembali', `Rp ${(order.change || 0).toLocaleString('id-ID')}`);
    }

    drawLine(currentY, '-');
    currentY += 20;

    // 6. Footer
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Courier New", Courier, monospace';
    ctx.fillText('Terima kasih atas kunjungan Anda!', paperWidth / 2, currentY);
    currentY += 18;
    ctx.font = 'italic 11px "Courier New", Courier, monospace';
    ctx.fillText(`"${settings?.tagline || 'Jajan dekat rasa bersahabat'}"`, paperWidth / 2, currentY);
    currentY += 16;
    ctx.font = '10px "Courier New", Courier, monospace';
    ctx.fillText('Simpan struk ini sebagai bukti transaksi sah', paperWidth / 2, currentY);
    currentY += 20;

    if (settings?.autoCutEnabled) {
      drawLine(currentY, '-');
      currentY += 14;
      ctx.font = '10px "Courier New", Courier, monospace';
      ctx.fillText('[ AUTO-CUT PRINTER ]', paperWidth / 2, currentY);
      currentY += 20;
    }

    return canvas.toDataURL('image/png', 0.95);
  }

  /**
   * Generate PNG Blob for Web Share API file sharing
   */
  public static async generateReceiptBlob(order: Order, settings?: Partial<StoreSettings>): Promise<Blob | null> {
    const dataUrl = await this.generateReceiptImage(order, settings);
    if (!dataUrl) return null;

    try {
      const response = await fetch(dataUrl);
      return await response.blob();
    } catch {
      return null;
    }
  }

  /**
   * Download receipt as image file
   */
  public static async downloadReceiptImage(order: Order, settings?: Partial<StoreSettings>): Promise<void> {
    const dataUrl = await this.generateReceiptImage(order, settings);
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Struk-${order.orderNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Format clean thermal print HTML for browser print dialog
   */
  public static formatHtmlReceipt(order: Order, settings?: Partial<StoreSettings>): string {
    const storeName = settings?.storeName || 'HUMA FOOD';
    const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
    const address = settings?.address || 'Perum Gina Blok B No. 12';
    const wa = settings?.whatsapp || '085878775527';
    const paperWidth = settings?.paperWidth || '58mm';
    const logoUrl = this.getEffectiveReceiptLogo(settings);
    
    // Resolve relative URL if running in browser context
    const resolvedLogoUrl = (logoUrl.startsWith('/') && typeof window !== 'undefined')
      ? `${window.location.origin}${logoUrl}`
      : logoUrl;

    const formattedDate = new Date(order.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const paymentLabel = 
      order.paymentMethod === 'CASH' ? 'Tunai' :
      order.paymentMethod === 'COD' ? 'Tunai / COD' :
      order.paymentMethod === 'QRIS' ? 'QRIS Digital' :
      order.paymentMethod === 'BANK_TRANSFER' ? 'Transfer Bank' : 'Split Payment';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Struk ${order.orderNumber} - ${storeName}</title>
          ${typeof window !== 'undefined' ? `<base href="${window.location.origin}/">` : ''}
          <style>
            @page {
              margin: 0;
              size: ${paperWidth} auto;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.35;
              padding: 8px 6px;
              color: #000;
              margin: 0;
              width: ${paperWidth};
              max-width: 100%;
              background: #fff;
              word-wrap: break-word;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .italic { font-style: italic; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            .divider-double { border-top: 1px solid #000; border-bottom: 1px solid #000; height: 3px; margin: 6px 0; }
            .logo-img {
              max-height: 70px;
              max-width: 175px;
              width: auto;
              height: auto;
              object-fit: contain;
              display: inline-block;
              margin: 0 auto 6px auto;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              image-rendering: -webkit-optimize-contrast;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .item-row {
              margin: 3px 0;
            }
            .mod-item {
              padding-left: 10px;
              font-size: 10px;
              color: #333;
            }
            .total-row {
              font-size: 13px;
              font-weight: bold;
              margin: 4px 0;
            }
            .cut-spacer {
              margin-top: 25px;
              padding-top: 10px;
              font-size: 9px;
              text-align: center;
              border-top: 1px dotted #ccc;
            }
            @media print {
              body {
                padding: 4px 2px;
              }
              .logo-img {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .cut-spacer {
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            ${resolvedLogoUrl ? `
              <div style="text-align: center; margin-bottom: 6px;">
                <img src="${resolvedLogoUrl}" alt="${storeName}" class="logo-img" />
              </div>
            ` : ''}
            <div class="bold" style="font-size: 14px; letter-spacing: 0.5px;">${storeName.toUpperCase()}</div>
            <div class="italic" style="font-size: 10px; margin-top: 1px;">"${tagline}"</div>
            <div style="font-size: 10px; margin-top: 1px;">${address}</div>
            <div style="font-size: 10px;">WA: ${wa}</div>
          </div>

          <div class="divider-double"></div>

          <div class="row"><span>No. Pesanan:</span><span class="bold">${order.orderNumber}</span></div>
          <div class="row"><span>Tanggal:</span><span>${formattedDate}</span></div>
          <div class="row"><span>Pelanggan:</span><span>${order.customer.name}</span></div>
          <div class="row"><span>Layanan:</span><span>${order.serviceType === 'DELIVERY' ? `Delivery (${order.deliveryAreaName || 'Area'})` : order.serviceType === 'TAKEAWAY' ? 'Takeaway' : 'Dine In'}</span></div>
          ${order.serviceType === 'DELIVERY' && order.customer.address ? `<div class="row"><span>Alamat:</span><span>${order.customer.address}</span></div>` : ''}
          ${order.cashierName ? `<div class="row"><span>Kasir:</span><span>${order.cashierName}</span></div>` : ''}

          <div class="divider"></div>
          <div class="row bold"><span>ITEM</span><span>TOTAL</span></div>
          <div class="divider"></div>

          ${order.groups && order.groups.length > 0
            ? order.groups.map((group, index) => `
              <div class="item-row" style="border-top: 1px dashed #999; padding-top: 5px; margin-top: 6px;">
                <div class="bold">GROUP ${index + 1}</div>
                ${group.items.map(item => `
                  <div class="row">
                    <span>${item.quantity}x ${item.name}</span>
                    <span>Rp ${item.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  ${item.selectedModifiers?.length ? `<div class="mod-item">↳ Pilihan: ${item.selectedModifiers.map(m => m.item.name).join(', ')}</div>` : ''}
                  ${item.notes?.trim() ? `<div class="mod-item">↳ Catatan: "${item.notes.trim()}"</div>` : ''}
                `).join('')}
                <div class="mod-item bold">🧂 Bumbu: ${group.modifiers?.length ? group.modifiers.map(m => m.name).join(', ') : '-'}</div>
                ${group.note?.trim() ? `<div class="mod-item">↳ Catatan Group: "${group.note.trim()}"</div>` : ''}
              </div>
            `).join('')
            : order.items.map(item => `
              <div class="item-row">
                <div class="row">
                  <span>${item.quantity}x ${item.productName}</span>
                  <span>Rp ${item.lineTotal.toLocaleString('id-ID')}</span>
                </div>
                ${item.selectedModifiers?.length ? `<div class="mod-item">↳ Pilihan: ${item.selectedModifiers.map(m => m.item.name).join(', ')}</div>` : ''}
                ${item.notes?.trim() ? `<div class="mod-item">↳ Catatan: "${item.notes.trim()}"</div>` : ''}
              </div>
            `).join('')}

          <div class="divider"></div>
          <div class="bold" style="margin-bottom: 3px;">RINGKASAN PEMBAYARAN</div>
          <div class="row"><span>Subtotal Semua Pesanan</span><span>Rp ${order.subtotal.toLocaleString('id-ID')}</span></div>
          ${order.discount > 0 ? `
            <div class="row"><span>Total Potongan</span><span>-Rp ${order.discount.toLocaleString('id-ID')}</span></div>
          ` : ''}
          ${order.serviceType === 'DELIVERY' ? `
            <div class="row"><span>Ongkos Kirim</span><span>Rp ${order.deliveryFee.toLocaleString('id-ID')}</span></div>
          ` : ''}

          <div class="divider-double"></div>
          <div class="row total-row">
            <span>TOTAL BAYAR</span>
            <span>Rp ${order.total.toLocaleString('id-ID')}</span>
          </div>
          <div class="divider-double"></div>

          <div class="row"><span>Metode Bayar:</span><span>${paymentLabel}</span></div>
          ${order.amountPaid ? `
            <div class="row"><span>Uang Diterima:</span><span>Rp ${order.amountPaid.toLocaleString('id-ID')}</span></div>
            <div class="row"><span>Kembali:</span><span>Rp ${(order.change || 0).toLocaleString('id-ID')}</span></div>
          ` : ''}

          <div class="divider"></div>
          <div class="text-center" style="margin-top: 6px;">
            <div class="bold">Terima kasih atas pesanan Anda!</div>
            <div class="italic" style="font-size: 10px;">"${tagline}"</div>
            <div style="font-size: 9px; color: #555; margin-top: 3px;">Simpan struk ini sebagai bukti transaksi</div>
          </div>

          ${settings?.autoCutEnabled ? `
            <div class="cut-spacer">
              ----------------------------------------<br/>
              [ AUTO-CUT PRINTER ]
            </div>
          ` : ''}
        </body>
      </html>
    `;
  }

  /**
   * Format standard thermal text for Point Redemption Receipt (58mm/80mm compatible)
   */
  public static formatTextRedeemReceipt(
    redemption: PointRedemption,
    customer?: Customer | null,
    settings?: Partial<StoreSettings>
  ): string {
    const storeName = settings?.storeName || 'HUMA FOOD';
    const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
    const address = settings?.address || 'Perum Gina Blok B No. 12';
    const wa = settings?.whatsapp || '085878775527';

    const eqLine = '========================================';
    const dashLine = '----------------------------------------';

    const formattedDate = new Date(redemption.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const code = redemption.redemptionCode || `RDM-${redemption.id.slice(-6).toUpperCase()}`;
    const custName = redemption.customerName || customer?.name || 'Pelanggan HUMA';
    const custPhone = redemption.customerPhone || customer?.whatsapp || '-';
    const rewardTypeLabel = redemption.type === 'DISCOUNT' ? 'VOUCHER POTONGAN HARGA' : 'MENU GRATIS';
    const remainingPoints = redemption.pointsBalanceAfter !== undefined
      ? redemption.pointsBalanceAfter
      : (customer?.pointsBalance ?? 0);

    const lines: string[] = [
      eqLine,
      `             ${storeName}`,
      `     "${tagline}"`,
      `       ${address}`,
      `          WA: ${wa}`,
      eqLine,
      '     STRUK BUKTI PENUKARAN POIN',
      '      (INSTANT REWARD REDEEM)',
      eqLine,
      `KODE KLAIM  : ${code}`,
      `Waktu Klaim : ${formattedDate}`,
      `Status      : BERHASIL (VALID)`,
      dashLine,
      'DATA PELANGGAN',
      `Nama        : ${custName}`,
      `WhatsApp    : ${custPhone}`,
      dashLine,
      'RINCIAN HADIAH',
      `Hadiah      : ${redemption.rewardName}`,
      `Kategori    : ${rewardTypeLabel}`,
      redemption.discountAmount ? `Nilai Diskon: Rp ${redemption.discountAmount.toLocaleString('id-ID')}` : '',
      dashLine,
      `Poin Ditukar: -${redemption.pointsSpent} Poin`,
      `Sisa Poin   : ${remainingPoints} Poin`,
      eqLine,
      'PETUNJUK KLAIM:',
      '1. Tunjukkan struk ini ke kasir outlet HUMA, atau',
      '2. Kirim bukti struk via WhatsApp saat memesan.',
      eqLine,
      ' Terima kasih atas kesetiaan Anda!',
      eqLine,
    ].filter(Boolean);

    return lines.join('\n');
  }

  /**
   * Format clean thermal print HTML for Point Redemption Receipt
   */
  public static formatHtmlRedeemReceipt(
    redemption: PointRedemption,
    customer?: Customer | null,
    settings?: Partial<StoreSettings>
  ): string {
    const storeName = settings?.storeName || 'HUMA FOOD';
    const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
    const address = settings?.address || 'Perum Gina Blok B No. 12';
    const wa = settings?.whatsapp || '085878775527';
    const paperWidth = settings?.paperWidth || '58mm';
    const logoUrl = this.getEffectiveReceiptLogo(settings);

    const resolvedLogoUrl = (logoUrl.startsWith('/') && typeof window !== 'undefined')
      ? `${window.location.origin}${logoUrl}`
      : logoUrl;

    const formattedDate = new Date(redemption.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const code = redemption.redemptionCode || `RDM-${redemption.id.slice(-6).toUpperCase()}`;
    const custName = redemption.customerName || customer?.name || 'Pelanggan HUMA';
    const custPhone = redemption.customerPhone || customer?.whatsapp || '-';
    const remainingPoints = redemption.pointsBalanceAfter !== undefined
      ? redemption.pointsBalanceAfter
      : (customer?.pointsBalance ?? 0);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Struk Klaim ${code} - ${storeName}</title>
          ${typeof window !== 'undefined' ? `<base href="${window.location.origin}/">` : ''}
          <style>
            @page {
              margin: 0;
              size: ${paperWidth} auto;
            }
            * { box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.35;
              padding: 10px 8px;
              color: #000;
              margin: 0;
              width: ${paperWidth};
              max-width: 100%;
              background: #fff;
              word-wrap: break-word;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .divider-double { border-top: 1px solid #000; border-bottom: 1px solid #000; height: 3px; margin: 6px 0; }
            .logo-img {
              max-height: 60px;
              max-width: 160px;
              object-fit: contain;
              display: block;
              margin: 0 auto 6px auto;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .badge-code {
              display: inline-block;
              border: 2px solid #000;
              padding: 5px 12px;
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 1.5px;
              margin: 6px auto;
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            ${resolvedLogoUrl ? `<img src="${resolvedLogoUrl}" class="logo-img" alt="${storeName}" />` : ''}
            <div class="bold" style="font-size: 13px;">${storeName}</div>
            <div style="font-size: 10px;">"${tagline}"</div>
            <div style="font-size: 9px; margin-top: 2px;">${address}</div>
            <div style="font-size: 9px;">WA: ${wa}</div>
          </div>

          <div class="divider-double"></div>
          <div class="text-center bold" style="font-size: 11px; letter-spacing: 0.5px;">
            STRUK BUKTI PENUKARAN POIN
          </div>
          <div class="text-center" style="font-size: 9px; color: #333;">(BUKTI KLAIM REWARD RESMI)</div>
          
          <div class="text-center">
            <div class="badge-code">${code}</div>
          </div>

          <div class="divider"></div>
          <div class="row"><span>Waktu:</span><span>${formattedDate}</span></div>
          <div class="row"><span>Status:</span><span class="bold">BERHASIL (VALID)</span></div>
          <div class="row"><span>Pelanggan:</span><span class="bold">${custName}</span></div>
          <div class="row"><span>No. WA:</span><span>${custPhone}</span></div>

          <div class="divider"></div>
          <div class="bold" style="margin-bottom: 2px;">DETAIL HADIAH:</div>
          <div class="bold" style="font-size: 12px;">${redemption.rewardName}</div>
          <div style="font-size: 10px; color: #444;">
            ${redemption.type === 'DISCOUNT' ? '🎫 Voucher Potongan Harga' : '🍲 Menu Hadiah Spesial'}
          </div>
          ${redemption.discountAmount ? `<div class="row" style="margin-top: 3px;"><span>Nilai Diskon:</span><span class="bold">Rp ${redemption.discountAmount.toLocaleString('id-ID')}</span></div>` : ''}

          <div class="divider"></div>
          <div class="row">
            <span>Poin Ditukarkan:</span>
            <span class="bold">-${redemption.pointsSpent} Poin</span>
          </div>
          <div class="row">
            <span>Sisa Saldo Poin:</span>
            <span class="bold">${remainingPoints} Poin</span>
          </div>

          <div class="divider-double"></div>
          <div style="font-size: 9px; line-height: 1.4; margin: 4px 0;">
            <div class="bold">Petunjuk Klaim:</div>
            <div>1. Tunjukkan struk ini ke kasir outlet HUMA.</div>
            <div>2. Atau bagikan bukti via WhatsApp saat memesan online.</div>
          </div>

          <div class="divider"></div>
          <div class="text-center" style="font-size: 9px; margin-top: 6px;">
            <div class="bold">Terima kasih atas kesetiaan Anda!</div>
            <div>"${tagline}"</div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Browser system print for Point Redemption receipt (58mm / 80mm)
   */
  public static printRedeemReceiptViaBrowser(
    redemption: PointRedemption,
    customer?: Customer | null,
    settings?: Partial<StoreSettings>
  ): void {
    const html = this.formatHtmlRedeemReceipt(redemption, customer, settings);
    
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

    const logoImg = doc.querySelector('img.logo-img') as HTMLImageElement | null;
    if (logoImg && !logoImg.complete) {
      logoImg.onload = () => {
        setTimeout(triggerPrint, 120);
      };
      logoImg.onerror = () => {
        triggerPrint();
      };
      setTimeout(triggerPrint, 1000);
    } else {
      setTimeout(triggerPrint, 250);
    }
  }
}
