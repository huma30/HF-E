import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { ModifierGroup, ModifierItem, BatchModifierSelection, BatchModifierOption } from '../../types';
import { Check, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BatchModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string;
  categoryName: string;
  modifierGroup: ModifierGroup;
  targetQuantity?: number; // Kept for backward-compatibility
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number;
  mode?: 'UNIFORM' | 'PER_ITEM' | 'POOL'; // Kept for backward-compatibility
  currentSelection?: BatchModifierSelection | null;
  onSave: (selection: BatchModifierSelection) => void;
}

export const BatchModifierModal: React.FC<BatchModifierModalProps> = ({
  isOpen,
  onClose,
  categoryId,
  categoryName,
  modifierGroup,
  isRequired = true,
  minSelections,
  maxSelections,
  currentSelection,
  onSave,
}) => {
  // Safe calculation of dynamic limits based on Admin configuration
  const safeMin = useMemo(() => {
    if (!isRequired) return 0;
    if (minSelections !== undefined) return Math.max(1, Number(minSelections) || 1);
    if (modifierGroup?.minSelection !== undefined) return Math.max(1, Number(modifierGroup.minSelection) || 1);
    return 1;
  }, [isRequired, minSelections, modifierGroup]);

  const safeMax = useMemo(() => {
    let max = 2;
    if (maxSelections !== undefined && Number(maxSelections) > 0) {
      max = Number(maxSelections);
    } else if (modifierGroup?.maxSelection !== undefined && Number(modifierGroup.maxSelection) > 0) {
      max = Number(modifierGroup.maxSelection);
    }
    return Math.max(safeMin, max);
  }, [safeMin, maxSelections, modifierGroup]);

  // Selected modifier IDs
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Active items in modifier group
  const activeItems = useMemo(() => {
    return (modifierGroup?.items || []).filter((it) => it.isActive);
  }, [modifierGroup]);

  // Populate selection when opened
  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      if (currentSelection) {
        if (currentSelection.selectedModifiers && currentSelection.selectedModifiers.length > 0) {
          const ids = currentSelection.selectedModifiers
            .map((m) => m.modifierId)
            .filter((id) =>
              activeItems.some(
                (it) => it.id === id && it.isAvailable !== false && it.status !== 'SOLD_OUT'
              )
            );
          setSelectedIds(ids.slice(0, safeMax));
        } else if (currentSelection.options && currentSelection.options.length > 0) {
          const ids = currentSelection.options
            .filter((o) => (o.quantity ?? 1) > 0)
            .map((o) => o.modifierId)
            .filter((id) =>
              activeItems.some(
                (it) => it.id === id && it.isAvailable !== false && it.status !== 'SOLD_OUT'
              )
            );
          setSelectedIds(ids.slice(0, safeMax));
        } else {
          setSelectedIds([]);
        }
      } else {
        setSelectedIds([]);
      }
    }
  }, [isOpen, currentSelection, activeItems, safeMax]);

  // Toggle selection with strict upper limit guard
  const handleToggle = (item: ModifierItem) => {
    const isAvail = item.isAvailable !== false && item.status !== 'SOLD_OUT';
    if (!isAvail) {
      setFeedback(`Bumbu/opsi "${item.name}" saat ini sedang habis.`);
      return;
    }

    const isChecked = selectedIds.includes(item.id);
    if (isChecked) {
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      setFeedback(null);
    } else {
      if (selectedIds.length >= safeMax) {
        setFeedback(`Maksimal ${safeMax} bumbu dapat dipilih.`);
        return;
      }
      setSelectedIds((prev) => [...prev, item.id]);
      setFeedback(null);
    }
  };

  const isComplete = isRequired
    ? selectedIds.length >= safeMin && selectedIds.length <= safeMax
    : selectedIds.length <= safeMax;

  // Calculate extra price if any modifier option has a price
  const extraPrice = useMemo(() => {
    return selectedIds.reduce((sum, id) => {
      const item = activeItems.find((it) => it.id === id);
      return sum + (item?.price || 0);
    }, 0);
  }, [selectedIds, activeItems]);

  const handleSave = () => {
    const selectedItems = activeItems.filter((it) => selectedIds.includes(it.id));
    const soldOutItem = selectedItems.find(
      (it) => it.isAvailable === false || it.status === 'SOLD_OUT'
    );
    if (soldOutItem) {
      setFeedback(`Opsi "${soldOutItem.name}" sedang habis. Harap batalkan pilihan tersebut.`);
      return;
    }

    if (isRequired && selectedIds.length < safeMin) {
      setFeedback(`Pilih minimal ${safeMin} bumbu terlebih dahulu.`);
      return;
    }
    if (selectedIds.length > safeMax) {
      setFeedback(`Maksimal ${safeMax} bumbu dapat dipilih.`);
      return;
    }

    const options: BatchModifierOption[] = selectedItems.map((it) => ({
      modifierId: it.id,
      modifierName: it.name,
      quantity: 1,
      price: it.price || 0,
    }));

    const selectedModifiers = selectedItems.map((it) => ({
      modifierId: it.id,
      modifierName: it.name,
      price: it.price || 0,
    }));

    onSave({
      categoryId,
      categoryName,
      modifierGroupId: modifierGroup.id,
      modifierGroupName: modifierGroup.name,
      options,
      totalAllocated: selectedIds.length,
      targetQuantity: safeMax,
      required: isRequired,
      minSelections: safeMin,
      maxSelections: safeMax,
      selectedModifiers,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modifierGroup?.name ? `Pilih ${modifierGroup.name}` : `Pilih Bumbu`}
      subtitle={`Kategori: ${categoryName}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {/* Decorative Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />

        {/* Header reference format: Bumbu [Wajib/Opsional] 0/2 */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50/90 rounded-xl border border-gray-200/80">
          <div className="flex items-center gap-2">
            <span className="font-heading font-extrabold text-sm text-[#2E1A47]">
              {modifierGroup?.name || 'Bumbu'}
            </span>
            {isRequired ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                Wajib
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                Opsional
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-bold tracking-wide transition-colors ${
                isComplete && selectedIds.length > 0
                  ? 'text-emerald-700 font-black'
                  : 'text-gray-400'
              }`}
            >
              {selectedIds.length}/{safeMax}
            </span>
          </div>
        </div>

        {/* Lightweight feedback banner */}
        {feedback && (
          <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-bold animate-pulse">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Checkbox Options List - Scrollable if options are many */}
        <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pr-1">
          {activeItems.map((item) => {
            const isAvail = item.isAvailable !== false && item.status !== 'SOLD_OUT';
            const isChecked = selectedIds.includes(item.id);
            const isAtLimit = selectedIds.length >= safeMax && !isChecked;

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isAvail) handleToggle(item);
                }}
                className={`w-full p-3 rounded-xl border flex items-center justify-between gap-3 select-none transition-all ${
                  !isAvail
                    ? 'bg-gray-100/70 border-gray-200 opacity-60 cursor-not-allowed'
                    : isChecked
                    ? 'bg-orange-50/70 border-[#FF4500] shadow-2xs cursor-pointer'
                    : isAtLimit
                    ? 'bg-gray-50/60 border-gray-200 opacity-60 hover:border-gray-300 cursor-pointer'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Custom Checkbox as in reference screenshot */}
                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                      !isAvail
                        ? 'border-gray-300 bg-gray-200 text-gray-400'
                        : isChecked
                        ? 'bg-[#FF4500] border-[#FF4500] text-white shadow-xs'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <span
                    className={`text-xs sm:text-sm truncate ${
                      !isAvail
                        ? 'text-gray-400 line-through'
                        : isChecked
                        ? 'text-gray-900 font-bold'
                        : 'text-gray-800 font-medium'
                    }`}
                  >
                    {item.name}
                  </span>

                  {!isAvail && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 uppercase shrink-0">
                      Habis
                    </span>
                  )}
                </div>

                <span
                  className={`text-xs sm:text-sm font-semibold shrink-0 ${
                    !isAvail ? 'text-gray-400' : 'text-[#FF4500]'
                  }`}
                >
                  {item.price > 0 ? `+Rp ${item.price.toLocaleString('id-ID')}` : 'Gratis'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer & Action Buttons matching reference screenshot styling */}
        <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-3.5 rounded-2xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition-colors shrink-0"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isRequired && selectedIds.length < safeMin}
            className="flex-1 bg-[#FF4500] hover:bg-[#E03E00] text-white font-extrabold py-3 px-4 rounded-2xl flex items-center justify-between shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-1.5">
              {isComplete ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : (
                <Check className="w-4 h-4 text-white" />
              )}
              <span className="text-xs sm:text-sm">
                {isComplete ? 'Simpan Pilihan' : `Pilih Minimal ${safeMin} Bumbu`}
              </span>
            </div>
            <span className="text-xs sm:text-sm font-bold opacity-90">
              {extraPrice > 0 ? `+Rp ${extraPrice.toLocaleString('id-ID')}` : `${selectedIds.length}/${safeMax}`}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
