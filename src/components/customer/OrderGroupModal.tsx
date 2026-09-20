import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Category, ModifierGroup, OrderGroup, OrderGroupItem, OrderGroupModifier, Product, Promo } from '../../types';
import { Modal } from '../common/Modal';
import { OrderEngine } from '../../services/orderEngine';
import { PricingEngine } from '../../services/pricingEngine';

interface OrderGroupModalProps {
  isOpen: boolean;
  category: Category | null;
  products: Product[];
  modifierGroups: ModifierGroup[];
  promos?: Promo[];
  orderGroups?: OrderGroup[];
  existingGroup?: OrderGroup | null;
  onClose: () => void;
  onSave: (group: OrderGroup) => void;
}

export const OrderGroupModal: React.FC<OrderGroupModalProps> = ({
  isOpen, category, products, modifierGroups, promos = [], orderGroups = [], existingGroup, onClose, onSave,
}) => {
  const categoryProducts = useMemo(
    () => products.filter((p) => p.categoryId === category?.id && p.isActive && p.isAvailable),
    [products, category?.id]
  );
  const config = OrderEngine.getOrderingConfig(category);
  const modifierGroup = config.modifierGroupId
    ? modifierGroups.find((g) => g.id === config.modifierGroupId && g.isActive)
    : category?.batchModifierGroupId
      ? modifierGroups.find((g) => g.id === category.batchModifierGroupId && g.isActive)
      : undefined;

  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries((existingGroup?.items || []).map((item) => [item.productId, item.quantity]))
  );
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>(
    (existingGroup?.modifiers || []).map((modifier) => modifier.modifierId)
  );
  const [note, setNote] = useState(existingGroup?.note || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuantities(Object.fromEntries((existingGroup?.items || []).map((item) => [item.productId, item.quantity])));
    setSelectedModifierIds((existingGroup?.modifiers || []).map((modifier) => modifier.modifierId));
    setNote(existingGroup?.note || '');
    setError(null);
  }, [isOpen, category?.id, existingGroup?.id]);

  if (!category) return null;

  const setQuantity = (productId: string, next: number) => {
    setQuantities((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
    setError(null);
  };

  const toggleModifier = (modifierId: string) => {
    setSelectedModifierIds((prev) =>
      prev.includes(modifierId) ? prev.filter((id) => id !== modifierId) : [...prev, modifierId]
    );
    setError(null);
  };

  const buildItems = (): OrderGroupItem[] =>
    categoryProducts
      .filter((product) => (quantities[product.id] || 0) > 0)
      .map((product) => {
        const existingItem = existingGroup?.items.find((item) => item.productId === product.id);
        const built = OrderEngine.buildGroupItem(
          product,
          quantities[product.id],
          existingItem?.selectedModifiers || [],
          existingItem?.notes
        );
        return existingItem ? { ...built, id: existingItem.id } : built;
      });

  const buildModifiers = (): OrderGroupModifier[] =>
    (modifierGroup?.items || [])
      .filter((item) => item.isActive && selectedModifierIds.includes(item.id))
      .map((item) => ({
        modifierId: item.id,
        name: item.name,
        groupId: modifierGroup!.id,
        groupName: modifierGroup!.name,
        price: item.price,
        quantity: 1,
      }));

  const previewGroup = OrderEngine.createGroup({
    id: existingGroup?.id,
    categoryId: category.id,
    items: buildItems(),
    modifiers: buildModifiers(),
    note,
    createdAt: existingGroup?.createdAt,
  });

  const previewGroups = existingGroup
    ? orderGroups.map((group) => (group.id === existingGroup.id ? previewGroup : group))
    : [...orderGroups, previewGroup];

  const previewMixMatch = PricingEngine.calculateMixMatchDiscounts(
    OrderEngine.flattenGroups(previewGroups),
    promos
  );
  const previewGroupMixMatchDiscount = previewMixMatch.groupDiscounts?.[previewGroup.id] || 0;

  const handleSave = () => {
    const items = buildItems();
    const modifiers = buildModifiers();
    const group = OrderEngine.createGroup({
      id: existingGroup?.id,
      categoryId: category.id,
      items,
      modifiers,
      note,
      createdAt: existingGroup?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    const minSelections = config.modifierMinSelection ?? modifierGroup?.minSelection ?? 0;
    const maxSelections = config.modifierMaxSelection ?? modifierGroup?.maxSelection ?? Number.MAX_SAFE_INTEGER;
    const required = config.modifierRequired ?? category.batchModifierRequired ?? modifierGroup?.isRequired ?? false;

    if (items.length === 0) {
      setError('Pilih minimal satu menu dari kategori ' + category.name + '.');
      return;
    }
    if (config.modifierEnabled && required && modifiers.length < Math.max(1, minSelections)) {
      setError('Pilih minimal ' + Math.max(1, minSelections) + ' pilihan pada ' + (modifierGroup?.name || 'bumbu') + '.');
      return;
    }
    if (modifiers.length > maxSelections) {
      setError('Maksimal ' + maxSelections + ' pilihan pada ' + (modifierGroup?.name || 'bumbu') + '.');
      return;
    }

    onSave(group);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col max-h-[86vh]">
        <div className="pb-3 border-b border-gray-100">
          <h3 className="font-heading font-extrabold text-lg text-[#2E1A47]">
            {existingGroup ? 'Edit ' + category.name : 'Pilih ' + category.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Pilih beberapa menu, tentukan jumlahnya, lalu pilih bumbu untuk satu grup.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
          {categoryProducts.map((product) => {
            const qty = quantities[product.id] || 0;
            return (
              <div key={product.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-gray-50 border border-gray-100">
                <img src={product.imageUrl} alt={product.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm text-[#2E1A47] truncate">{product.name}</div>
                  <div className="text-xs text-[#FF4500] font-bold mt-0.5">
                    Rp {OrderEngine.buildGroupItem(product, Math.max(1, qty || 1)).unitPrice.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl p-1">
                  <button type="button" onClick={() => setQuantity(product.id, qty - 1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <button type="button" onClick={() => setQuantity(product.id, qty + 1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {qty > 0 && (
                    <button type="button" onClick={() => setQuantity(product.id, 0)} className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {config.modifierEnabled && modifierGroup && (
            <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#FF4500]" />
                  <h4 className="font-heading font-bold text-sm text-[#2E1A47]">{modifierGroup.name}</h4>
                </div>
                {(config.modifierRequired ?? modifierGroup.isRequired) && (
                  <span className="text-[10px] font-extrabold text-rose-600">WAJIB</span>
                )}
              </div>
              <div className="space-y-1.5">
                {modifierGroup.items.filter((item) => item.isActive).map((item) => {
                  const selected = selectedModifierIds.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggleModifier(item.id)}
                      className={'w-full flex items-center justify-between p-2.5 rounded-xl bg-white border ' + (selected ? 'border-[#2E1A47]' : 'border-gray-200')}>
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className={'w-4 h-4 rounded-full border flex items-center justify-center ' + (selected ? 'bg-[#2E1A47] border-[#2E1A47] text-white' : 'border-gray-300')}>
                          {selected && <Check className="w-3 h-3" />}
                        </span>
                        {item.name}
                      </span>
                      <span className="text-xs font-bold text-[#FF4500]">{item.price > 0 ? '+Rp ' + item.price.toLocaleString('id-ID') : 'Gratis'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#2E1A47] mb-1">Catatan grup (opsional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: bumbu dipisah" className="w-full text-xs px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/25" />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500">Total grup</div>
            {previewGroupMixMatchDiscount > 0 && (
              <div className="text-[10px] font-extrabold text-emerald-700">
                Mix & Match grup -Rp {previewGroupMixMatchDiscount.toLocaleString('id-ID')}
              </div>
            )}
          </div>
          <div className="text-right">
            {previewGroupMixMatchDiscount > 0 && (
              <div className="text-[10px] text-gray-400 line-through">
                Rp {previewGroup.subtotal.toLocaleString('id-ID')}
              </div>
            )}
            <span className="font-heading font-extrabold text-[#2E1A47]">
              Rp {Math.max(0, previewGroup.subtotal - previewGroupMixMatchDiscount).toLocaleString('id-ID')}
            </span>
          </div>
          <button type="button" onClick={handleSave} className="clay-button-primary py-2.5 px-5 text-xs font-extrabold">
            {existingGroup ? 'Simpan Perubahan' : 'Tambah ke Keranjang'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
