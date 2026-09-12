import { Order } from '../types';

export class WhatsAppService {
  public static readonly STORE_PHONE = '085878775527';
  public static readonly INT_PHONE = '6285878775527';

  /**
   * Format order into a clean, professional WhatsApp text message
   */
  public static formatOrderMessage(order: Order): string {
    const divider = '━━━━━━━━━━━━━━━━━━━━━━';
    const lines: string[] = [];

    lines.push('🍔 *PESANAN BARU — HUMA FOOD*');
    lines.push('_Jajan dekat rasa bersahabat_');
    lines.push(divider);
    lines.push(`📋 *No. Pesanan:* ${order.orderNumber}`);
    lines.push(`📅 *Waktu:* ${new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`);
    lines.push(`👤 *Pelanggan:* ${order.customer.name}`);
    lines.push(`📱 *No. WA:* ${order.customer.whatsapp && order.customer.whatsapp.trim() !== '' ? order.customer.whatsapp : '-'}`);
    lines.push(`🛵 *Layanan:* ${order.serviceType === 'DELIVERY' ? 'Delivery Antar' : order.serviceType === 'TAKEAWAY' ? 'Bawa Pulang (Takeaway)' : 'Makan di Tempat (Dine In)'}`);
    
    if (order.serviceType === 'DELIVERY') {
      if (order.deliveryAreaName) {
        lines.push(`📍 *Area:* ${order.deliveryAreaName}`);
      }
      lines.push(`🏠 *Alamat:* ${order.customer.address || '-'}`);
    }

    if (order.customer.notes && order.customer.notes.trim()) {
      lines.push(`📝 *Catatan Order:* ${order.customer.notes}`);
    }

    lines.push(divider);
    lines.push('🛒 *RINCIAN PESANAN:*');

    order.items.forEach((item) => {
      const itemSubtotal = item.lineTotal.toLocaleString('id-ID');
      lines.push(`• *${item.quantity}x ${item.productName}* — Rp ${itemSubtotal}`);
      
      // Selected modifiers
      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        const modTexts = item.selectedModifiers.map(
          (m) => `${m.item.name}${m.item.price > 0 ? ` (+Rp ${m.item.price.toLocaleString('id-ID')})` : ''}`
        );
        lines.push(`  ↳ _Pilihan: ${modTexts.join(', ')}_`);
      }

      // Notes per item
      if (item.notes && item.notes.trim()) {
        lines.push(`  ↳ _Catatan: "${item.notes}"_`);
      }
    });

    // Batch Modifiers (e.g. Bumbu Gorengan)
    if (order.batchModifiers && order.batchModifiers.length > 0) {
      lines.push(divider);
      lines.push('🧂 *PILIHAN BUMBU / RASA:*');
      order.batchModifiers.forEach((bm) => {
        const optionNames =
          bm.selectedModifiers?.map((m) => m.modifierName) ||
          bm.options.filter((o) => (o.quantity ?? 1) > 0).map((o) => o.modifierName);
        if (optionNames.length > 0) {
          lines.push(`• *${bm.modifierGroupName || bm.categoryName}* (${bm.categoryName}): ${optionNames.join(', ')}`);
        }
      });
    }

    lines.push(divider);
    lines.push(`Subtotal: Rp ${order.subtotal.toLocaleString('id-ID')}`);
    
    if (order.discount > 0) {
      lines.push(`Diskon ${order.promoCode ? `(${order.promoCode})` : ''}: -Rp ${order.discount.toLocaleString('id-ID')}`);
    }

    if (order.serviceType === 'DELIVERY') {
      lines.push(`Ongkos Kirim: Rp ${order.deliveryFee.toLocaleString('id-ID')}`);
    }

    lines.push(`💰 *TOTAL BAYAR: Rp ${order.total.toLocaleString('id-ID')}*`);
    lines.push(divider);
    
    const paymentLabel = 
      order.paymentMethod === 'CASH' ? 'Tunai (Cash)' :
      order.paymentMethod === 'COD' ? 'Bayar di Tempat (COD)' :
      order.paymentMethod === 'QRIS' ? 'QRIS' :
      order.paymentMethod === 'BANK_TRANSFER' ? 'Transfer Bank' : 'Split Payment';

    lines.push(`💳 *Metode Pembayaran:* ${paymentLabel}`);

    if (order.paymentMethod === 'CASH' || order.paymentMethod === 'COD') {
      lines.push(`💵 *Uang Diberikan:* Rp ${(order.amountPaid || order.total).toLocaleString('id-ID')}`);
      lines.push(`🪙 *Kembalian:* Rp ${(order.change || 0).toLocaleString('id-ID')}`);
    }

    lines.push(divider);
    lines.push('Terima kasih atas pesanan Anda! 🙏');
    lines.push('Mohon konfirmasi jika pesanan ini sudah benar.');

    return lines.join('\n');
  }

  /**
   * Format cart items for direct quick WhatsApp ordering
   */
  public static formatCartQuickOrderMessage(
    items: { quantity: number; productName: string; lineTotal: number; selectedModifiers?: any[]; notes?: string }[],
    total: number,
    subtotal: number,
    discount: number,
    storeName = 'HUMA FOOD'
  ): string {
    const divider = '━━━━━━━━━━━━━━━━━━━━━━';
    const lines: string[] = [];

    lines.push(`🍔 *PESANAN CEPAT — ${storeName.toUpperCase()}*`);
    lines.push('_Jajan dekat rasa bersahabat_');
    lines.push(divider);
    lines.push('🛒 *RINCIAN PESANAN SAYA:*');

    items.forEach((item) => {
      lines.push(`• *${item.quantity}x ${item.productName}* — Rp ${item.lineTotal.toLocaleString('id-ID')}`);
      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        const mods = item.selectedModifiers.map((m: any) => m.item?.name || m.name).join(', ');
        lines.push(`  ↳ _Pilihan: ${mods}_`);
      }
      if (item.notes && item.notes.trim()) {
        lines.push(`  ↳ _Catatan: "${item.notes}"_`);
      }
    });

    lines.push(divider);
    lines.push(`Subtotal: Rp ${subtotal.toLocaleString('id-ID')}`);
    if (discount > 0) {
      lines.push(`Diskon Promo: -Rp ${discount.toLocaleString('id-ID')}`);
    }
    lines.push(`💰 *TOTAL BAYAR: Rp ${total.toLocaleString('id-ID')}*`);
    lines.push(divider);
    lines.push('Halo Admin, mohon bantu proses pesanan saya di atas ya. Terima kasih! 🙏');

    return lines.join('\n');
  }

  /**
   * Get direct WhatsApp URL from cart items
   */
  public static getCartWhatsAppUrl(
    items: any[],
    total: number,
    subtotal: number,
    discount: number,
    targetPhone = WhatsAppService.INT_PHONE,
    storeName = 'HUMA FOOD'
  ): string {
    const message = this.formatCartQuickOrderMessage(items, total, subtotal, discount, storeName);
    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Get direct WhatsApp Web / App URL
   */
  public static getWhatsAppUrl(order: Order, targetPhone = WhatsAppService.INT_PHONE): string {
    const message = this.formatOrderMessage(order);
    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }
}
