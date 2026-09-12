import React, { useState, useMemo } from 'react';
import { Product, ModifierGroup, SelectedModifier, Category } from '../../types';
import { Modal } from '../common/Modal';
import { PricingEngine } from '../../services/pricingEngine';
import { Plus, Minus, Check, AlertCircle, Sparkles } from 'lucide-react';

interface ProductModifierModalProps {
  product: Product | null;
  modifierGroups: ModifierGroup[];
  categories?: Category[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => void;
}

export const ProductModifierModal: React.FC<ProductModifierModalProps> = ({
  product,
  modifierGroups,
  categories,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  if (!product) return null;

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const category = categories?.find((c) => c.id === product.categoryId);
  const isBatchCategory = category?.batchModifierEnabled === true;

  // Relevant modifier groups for this product (excluding batch modifier group if handled in Cart)
  const relevantGroups = useMemo(() => {
    return modifierGroups.filter((g) => {
      if (!product.modifierGroupIds?.includes(g.id) || !g.isActive) return false;
      if (isBatchCategory && g.id === category?.batchModifierGroupId) return false;
      return true;
    });
  }, [product, modifierGroups, isBatchCategory, category]);

  // Wholesale tier price check for current quantity
  const unitPrice = useMemo(() => {
    return PricingEngine.calculateUnitPrice(product, quantity);
  }, [product, quantity]);

  // Extra modifiers price per unit
  const modifiersPrice = useMemo(() => {
    return PricingEngine.calculateModifiersPrice(selectedModifiers);
  }, [selectedModifiers]);

  const totalCalculated = (unitPrice + modifiersPrice) * quantity;

  // Toggle or select modifier item
  const handleToggleModifier = (group: ModifierGroup, item: any) => {
    setValidationError(null);
    const existingIndex = selectedModifiers.findIndex(
      (m) => m.groupId === group.id && m.item.id === item.id
    );

    if (existingIndex > -1) {
      // Remove
      setSelectedModifiers((prev) =>
        prev.filter((m) => !(m.groupId === group.id && m.item.id === item.id))
      );
    } else {
      // Check max selection limit for this group
      const currentInGroup = selectedModifiers.filter((m) => m.groupId === group.id);
      
      // If single selection required (min=1, max=1)
      if (group.maxSelection === 1) {
        // Replace existing in this group
        setSelectedModifiers((prev) => [
          ...prev.filter((m) => m.groupId !== group.id),
          { groupId: group.id, groupName: group.name, item },
        ]);
      } else {
        if (currentInGroup.length >= group.maxSelection) {
          setValidationError(`Maksimal ${group.maxSelection} pilihan untuk "${group.name}".`);
          return;
        }
        setSelectedModifiers((prev) => [
          ...prev,
          { groupId: group.id, groupName: group.name, item },
        ]);
      }
    }
  };

  const handleConfirm = () => {
    // Validate required groups
    for (const group of relevantGroups) {
      const selectedInGroup = selectedModifiers.filter((m) => m.groupId === group.id);
      if (group.isRequired && selectedInGroup.length < group.minSelection) {
        setValidationError(
          `Mohon pilih minimal ${group.minSelection} opsi pada "${group.name}".`
        );
        return;
      }
    }

    onAddToCart(product, quantity, selectedModifiers, notes);
    // Reset state and close
    setQuantity(1);
    setSelectedModifiers([]);
    setNotes('');
    setValidationError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="flex flex-col max-h-[82vh]">
        {/* Product Header */}
        <div className="flex gap-3 pb-3 border-b border-gray-100">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-20 h-20 rounded-2xl object-cover shadow-sm shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-extrabold text-base sm:text-lg text-[#2E1A47] truncate">
              {product.name}
            </h3>
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{product.description}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-heading font-extrabold text-[#FF4500] text-sm">
                Rp {unitPrice.toLocaleString('id-ID')}
              </span>
              {unitPrice < product.price && (
                <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                  Harga Grosir Aktif!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Wholesale Tier Info Banner (if enabled) */}
        {product.wholesaleEnabled && product.wholesaleRules && product.wholesaleRules.length > 0 && (
          <div className="my-2.5 p-2.5 bg-amber-50 rounded-xl border border-amber-200/70 text-xs">
            <div className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Tingkatan Harga Grosir:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {product.wholesaleRules.map((rule, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                    quantity >= rule.minQty && (rule.maxQty === undefined || quantity <= rule.maxQty)
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-amber-900 border border-amber-200'
                  }`}
                >
                  {rule.minQty}{rule.maxQty ? `–${rule.maxQty}` : '+'} pcs: Rp {rule.price.toLocaleString('id-ID')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Modifiers List (Scrollable) */}
        <div className="flex-1 overflow-y-auto pr-1 my-2 space-y-4">
          {relevantGroups.map((group) => {
            const selectedInThisGroup = selectedModifiers.filter((m) => m.groupId === group.id);
            return (
              <div key={group.id} className="bg-gray-50/70 p-3 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h5 className="font-heading font-bold text-xs text-[#2E1A47] flex items-center gap-1.5">
                      {group.name}
                      {group.isRequired ? (
                        <span className="text-[10px] text-rose-500 font-extrabold bg-rose-50 px-1.5 py-0.5 rounded-full">
                          Wajib
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-medium">Opsional</span>
                      )}
                    </h5>
                    {group.description && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{group.description}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 font-semibold">
                    {selectedInThisGroup.length}/{group.maxSelection}
                  </span>
                </div>

                {/* Items in this group */}
                <div className="space-y-1.5">
                  {group.items
                    .filter((item) => item.isActive)
                    .map((item) => {
                      const isSelected = selectedInThisGroup.some((m) => m.item.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleToggleModifier(group, item)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-white border-2 border-[#2E1A47] shadow-xs'
                              : 'bg-white/60 border border-gray-200/80 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-${
                                group.maxSelection === 1 ? 'full' : 'md'
                              } flex items-center justify-center border ${
                                isSelected
                                  ? 'bg-[#2E1A47] border-[#2E1A47] text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="font-semibold text-gray-800">{item.name}</span>
                          </div>
                          <span className="font-bold text-[#FF4500]">
                            {item.price > 0 ? `+Rp ${item.price.toLocaleString('id-ID')}` : 'Gratis'}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}

          {/* Notes per item */}
          <div className="pt-1">
            <label className="block text-xs font-bold text-[#2E1A47] mb-1">
              Catatan Pesanan Khusus (Opsional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cth: Bawang dipisah, kuah dibanyakin..."
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30 focus:border-[#FF4500]"
            />
          </div>

          {validationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Footer: Quantity & Confirm Add */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          {/* Quantity Controls */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-700 disabled:opacity-40 hover:bg-gray-50 active:scale-95 shadow-xs transition-all"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-10 text-center font-heading font-extrabold text-sm text-[#2E1A47]">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Button */}
          <button
            id="btn-confirm-add-modifier"
            onClick={handleConfirm}
            className="flex-1 clay-button-primary py-2.5 px-4 text-xs sm:text-sm flex items-center justify-between"
          >
            <span>Tambah</span>
            <span>Rp {totalCalculated.toLocaleString('id-ID')}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
