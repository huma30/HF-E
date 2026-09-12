import React, { useRef } from 'react';
import { Category } from '../../types';
import { Utensils, Flame, Sparkles, Coffee, CupSoda } from 'lucide-react';

interface CategoryStickyBarProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryStickyBar: React.FC<CategoryStickyBarProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeCategories = categories.filter((c) => c.isActive);

  // Helper for category icons
  const getCategoryIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('seblak')) return <Flame className="w-3.5 h-3.5" />;
    if (lower.includes('mie') || lower.includes('bakso')) return <Utensils className="w-3.5 h-3.5" />;
    if (lower.includes('minuman') || lower.includes('teh')) return <CupSoda className="w-3.5 h-3.5" />;
    if (lower.includes('camilan') || lower.includes('ceker')) return <Sparkles className="w-3.5 h-3.5" />;
    return <Coffee className="w-3.5 h-3.5" />;
  };

  return (
    <div className="sticky top-20 z-30 py-2.5 bg-[#FBFBFC]/95 backdrop-blur-md transition-all">
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1"
      >
        {/* 'Semua Menu' Pill */}
        <button
          id="cat-btn-all"
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            selectedCategoryId === null
              ? 'bg-[#2E1A47] text-white shadow-md shadow-[#2E1A47]/20 scale-102'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/80'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Semua Menu</span>
        </button>

        {/* Dynamic Category Pills */}
        {activeCategories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              id={`cat-btn-${cat.id}`}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-[#FF4500] text-white shadow-md shadow-[#FF4500]/25 scale-102'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/80'
              }`}
            >
              {getCategoryIcon(cat.name)}
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
