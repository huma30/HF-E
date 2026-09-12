import React from 'react';
import { Product, ModifierGroup, Category } from '../../types';
import { Plus, Flame, Tag, Layers, Sparkles } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  modifierGroups: ModifierGroup[];
  categories?: Category[];
  onOpenProductModal: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
}

const ProductCardComponent: React.FC<ProductCardProps> = ({
  product,
  modifierGroups,
  categories,
  onOpenProductModal,
  onQuickAdd,
}) => {
  // Check if product belongs to a category with Batch Modifier (e.g. Gorengan bumbu dipilih di checkout)
  const category = categories?.find((c) => c.id === product.categoryId);
  const isBatchCategory = category?.batchModifierEnabled === true;

  // Standalone modifier groups (excluding batch modifier group if managed at category level)
  const standaloneGroupIds = (product.modifierGroupIds || []).filter(
    (gId) => !isBatchCategory || gId !== category?.batchModifierGroupId
  );
  const prodModGroups = modifierGroups.filter(
    (g) => standaloneGroupIds.includes(g.id) && g.isActive
  );
  const hasRequiredModifiers = prodModGroups.some((g) => g.isRequired);

  // Lowest wholesale price preview if available
  const lowestWholesalePrice =
    product.wholesaleEnabled && product.wholesaleRules && product.wholesaleRules.length > 0
      ? Math.min(...product.wholesaleRules.map((r) => r.price))
      : null;

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.isAvailable) return;

    // If product has category batch modifier and no standalone required modifiers, quick add directly with NO popup
    if (isBatchCategory && !hasRequiredModifiers) {
      onQuickAdd(product);
    } else if (hasRequiredModifiers || standaloneGroupIds.length > 0) {
      onOpenProductModal(product);
    } else {
      onQuickAdd(product);
    }
  };

  return (
    <div
      id={`product-card-${product.id}`}
      onClick={() => {
        if (!product.isAvailable) return;
        if (isBatchCategory && !hasRequiredModifiers && standaloneGroupIds.length === 0) {
          onQuickAdd(product);
        } else {
          onOpenProductModal(product);
        }
      }}
      className={`clay-card clay-card-interactive flex flex-col justify-between overflow-hidden cursor-pointer group p-3 sm:p-3.5 relative ${
        !product.isAvailable ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      {/* Image Container */}
      <div className="relative w-full h-36 sm:h-44 rounded-xl sm:rounded-2xl overflow-hidden bg-gray-100 mb-3">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {product.isPopular && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF4500] text-white text-[10px] font-extrabold shadow-sm">
              <Flame className="w-3 h-3" />
              Favorit
            </span>
          )}
          {product.wholesaleEnabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E1AD01] text-[#2E1A47] text-[10px] font-extrabold shadow-sm">
              <Tag className="w-3 h-3" />
              Ada Grosir
            </span>
          )}
        </div>

        {!product.isAvailable && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
            <span className="px-3 py-1 rounded-full bg-red-600 text-white text-xs font-extrabold tracking-wide uppercase shadow-md">
              Habis
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <h4 className="font-heading font-bold text-sm sm:text-base text-[#2E1A47] group-hover:text-[#FF4500] transition-colors line-clamp-1">
            {product.name}
          </h4>
          <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Pricing & Add Button */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-end justify-between gap-2">
          <div>
            <div className="font-heading font-extrabold text-[#2E1A47] text-sm sm:text-base">
              Rp {product.price.toLocaleString('id-ID')}
            </div>
            {lowestWholesalePrice && (
              <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-0.5">
                <Layers className="w-3 h-3" />
                Grosir mulai Rp {lowestWholesalePrice.toLocaleString('id-ID')}
              </p>
            )}
          </div>

          <button
            id={`btn-add-${product.id}`}
            onClick={handleAction}
            aria-label={`Pilih ${product.name}`}
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#2E1A47] hover:bg-[#FF4500] text-white shadow-md active:scale-90 transition-all"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProductCard = React.memo(ProductCardComponent);
