import { useState, type ReactNode, type ChangeEvent } from 'react';
import { Plus, X } from 'lucide-react';
import type { BatData } from '../App';
import { Logo } from './Logo';
import { ProductSelector } from './ProductSelector';

interface SidebarProps {
  data: BatData;
  setData: React.Dispatch<React.SetStateAction<BatData>>;
}

function SizesQtyEditor({ data, setData }: SidebarProps) {
  const [adding, setAdding] = useState(false);
  const [newSize, setNewSize] = useState('');

  const addSize = () => {
    const trimmed = newSize.trim().toUpperCase();
    if (!trimmed) return;
    if (data.sizesQty.some(r => r.size.toUpperCase() === trimmed)) {
      setNewSize('');
      setAdding(false);
      return;
    }
    setData(prev => ({ ...prev, sizesQty: [...prev.sizesQty, { size: trimmed, qty: '', logoSizeFront: '', logoSizeBack: '' }] }));
    setNewSize('');
    setAdding(false);
  };

  const removeSize = (i: number) => {
    setData(prev => ({ ...prev, sizesQty: prev.sizesQty.filter((_, idx) => idx !== i) }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-textMuted">Tailles / Quantités</label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-textMuted hover:text-primary transition-colors"
          title="Ajouter une taille"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {adding && (
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="text"
            value={newSize}
            onChange={e => setNewSize(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSize(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Ex: 3XL"
            autoFocus
            className="w-20 bg-background border border-primary rounded-md px-2 py-1.5 text-textMain text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
          <button type="button" onClick={addSize} className="text-xs text-primary hover:text-primaryHover font-medium">OK</button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-textMuted hover:text-textMain">✕</button>
        </div>
      )}

      {/* Header row */}
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 mb-1">
        <span />
        <span className="text-textMuted text-[9px] uppercase tracking-wider">Qté</span>
        <span className="text-textMuted text-[9px] uppercase tracking-wider">AV (mm)</span>
        <span className="text-textMuted text-[9px] uppercase tracking-wider">AR (mm)</span>
        <span className="w-3" />
      </div>
      <div className="space-y-1.5">
        {data.sizesQty.map((row, i) => (
          <div key={row.size} className="grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 items-center group">
            <span className="text-textMuted text-xs">{row.size}</span>
            <input
              type="number"
              min="0"
              value={row.qty}
              onChange={e => {
                const updated = [...data.sizesQty];
                updated[i] = { ...updated[i], qty: e.target.value };
                setData(prev => ({ ...prev, sizesQty: updated }));
              }}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-textMain text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <input
              type="text"
              value={row.logoSizeFront}
              onChange={e => {
                const updated = [...data.sizesQty];
                updated[i] = { ...updated[i], logoSizeFront: e.target.value };
                setData(prev => ({ ...prev, sizesQty: updated }));
              }}
              placeholder=""
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-textMain text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <input
              type="text"
              value={row.logoSizeBack}
              onChange={e => {
                const updated = [...data.sizesQty];
                updated[i] = { ...updated[i], logoSizeBack: e.target.value };
                setData(prev => ({ ...prev, sizesQty: updated }));
              }}
              placeholder=""
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-textMain text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <div className="w-3 flex justify-center">
              {!['XS','S','M','L','XL','XXL'].includes(row.size) && (
                <button
                  type="button"
                  onClick={() => removeSize(i)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const LOWERCASE_PARTICLES = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'à', 'et', 'en',
  'van', 'von', 'di', 'el', 'al', 'ben', 'ibn',
]);

function toTitleCase(input: string): string {
  return input.replace(/\S+/g, (word, offset) => {
    if (offset > 0 && LOWERCASE_PARTICLES.has(word.toLowerCase())) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function Sidebar({ data, setData }: SidebarProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleClientName = (e: ChangeEvent<HTMLInputElement>) => {
    const formatted = toTitleCase(e.target.value);
    setData((prev) => ({ ...prev, clientName: formatted }));
  };

  const SectionTitle = ({ children }: {children: ReactNode}) => (
    <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-4 border-b border-border pb-2">{children}</h3>
  );

  return (
    <aside className="w-80 h-full bg-surface border-r border-border flex flex-col overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <Logo className="w-10 h-10 text-white drop-shadow-sm" />
          <div className="leading-tight">
             <h2 className="text-xl font-black font-grotesk text-white tracking-wide">
               Atelier OLDA
             </h2>
             <p className="text-[10px] text-textMuted uppercase tracking-widest font-bold">Atelier Textile</p>
          </div>
        </div>

        {/* --- FORMULAIRE --- */}
        <div className="mb-8 space-y-4 text-sm">
          <SectionTitle>Informations Commande</SectionTitle>

          <div>
            <label className="block text-textMuted mb-1">Titre du document</label>
            <input
              type="text" name="docType" value={data.docType} onChange={handleChange}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-textMain focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder="Bon à tirer"
            />
          </div>

          <div>
            <label className="block text-textMuted mb-1">Date</label>
            <input
              type="date" name="date" value={data.date} onChange={handleChange}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-textMain focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-textMuted mb-1">Nom du client</label>
            <input
              type="text" name="clientName" value={data.clientName} onChange={handleClientName}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-textMain focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder=""
            />
          </div>
        </div>

        {/* --- SÉLECTION PRODUIT --- */}
        <div className="mb-8">
          <SectionTitle>Sélection Produit</SectionTitle>
          <ProductSelector
            onSelect={(front, back, side, color, reference, meta) => {
              const hasSleeve = !!side;
              setData(prev => ({
                ...prev,
                tshirtImage: front,
                tshirtBackImage: back,
                tshirtSleeveImage: side,
                color,
                reference,
                productMeta: meta,
                showLeftSleeve: hasSleeve,
                showRightSleeve: hasSleeve,
              }));
            }}
          />
        </div>

        {/* --- TAILLES / QUANTITÉS --- */}
        <div className="mb-8 text-sm">
          <SizesQtyEditor data={data} setData={setData} />
        </div>

        {/* --- NOTE --- */}
        <div className="mb-8 text-sm">
          <label className="block text-textMuted mb-1">Note client</label>
          <textarea
            value={data.note}
            onChange={e => setData(prev => ({ ...prev, note: e.target.value }))}
            rows={3}
            placeholder="Information visible sur le document..."
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-textMain text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-y"
          />
        </div>

        {/* --- MANCHES --- */}
        <div className="mt-8 space-y-3">
          <SectionTitle>Manches</SectionTitle>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.showLeftSleeve}
                onChange={e => setData(prev => ({ ...prev, showLeftSleeve: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-blue-500"
              />
              <span className="text-textMain">Manche gauche</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.showRightSleeve}
                onChange={e => setData(prev => ({ ...prev, showRightSleeve: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-blue-500"
              />
              <span className="text-textMain">Manche droite</span>
            </label>
          </div>
        </div>

      </div>
    </aside>
  );
}
