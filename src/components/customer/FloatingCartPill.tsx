import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';

interface FloatingCartPillProps {
  onOpenCart: () => void;
}

export const FloatingCartPill: React.FC<FloatingCartPillProps> = ({ onOpenCart }) => {
  const { itemCount, total } = useCart();

  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-4 inset-x-0 z-40 px-4 max-w-lg mx-auto pointer-events-none">
      <button
        id="floating-cart-pill-btn"
        onClick={onOpenCart}
        className="pointer-events-auto w-full clay-button-primary py-3 px-4 sm:px-5 flex items-center justify-between shadow-2xl transition-all hover:scale-101 active:scale-99"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center font-extrabold text-xs">
            {itemCount}
          </div>
          <div className="text-left">
            <p className="text-[11px] text-white/80 font-medium leading-none">Total Pesanan</p>
            <p className="font-heading font-extrabold text-sm sm:text-base leading-tight mt-0.5">
              Rp {total.toLocaleString('id-ID')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-xs">
          <span>Lihat Keranjang</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </button>
    </div>
  );
};
