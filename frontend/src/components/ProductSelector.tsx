import { useState, useEffect } from 'react';
import catalog from '../data/catalog.json';

import type { ProductMeta } from '../App';

type Color = { name: string; front: string; back: string | null; side: string | null };
type Reference = { name: string; colors: Color[]; genre?: string; col?: string; coupe?: string; designation?: string; grammage?: string; matiere?: string; ethique?: string };
type Category = { name: string; references: Reference[] };

const data = catalog as Category[];

// Build a flat list of references with their category for grouping
type FlatRef = { catName: string; ref: Reference; catIdx: number; refIdx: number };
const flatRefs: FlatRef[] = [];
data.forEach((cat, catIdx) => {
  cat.references.forEach((ref, refIdx) => {
    flatRefs.push({ catName: cat.name, ref, catIdx, refIdx });
  });
});

interface ProductSelectorProps {
  onSelect: (front: string, back: string | null, side: string | null, color: string, reference: string, meta: ProductMeta | null) => void;
}

export function ProductSelector({ onSelect }: ProductSelectorProps) {
  const [selectedRefKey, setSelectedRefKey] = useState<string>('');
  const [colorIndex, setColorIndex] = useState<number>(-1);

  const selectedFlat = flatRefs.find(f => `${f.catIdx}-${f.refIdx}` === selectedRefKey);
  const colors = selectedFlat ? selectedFlat.ref.colors : [];
  const selected = colorIndex >= 0 && colorIndex < colors.length ? colors[colorIndex] : null;

  useEffect(() => { setColorIndex(-1); }, [selectedRefKey]);

  useEffect(() => {
    if (selected && selectedFlat) {
      const r = selectedFlat.ref;
      const meta: ProductMeta | null = r.genre || r.designation || r.matiere
        ? { genre: r.genre || '', col: r.col || '', coupe: r.coupe || '', designation: r.designation || '', grammage: r.grammage || '', matiere: r.matiere || '', ethique: r.ethique || '' }
        : null;
      onSelect(selected.front, selected.back, selected.side, selected.name, selectedFlat.ref.name, meta);
    }
  }, [selected, selectedFlat]);

  const selectClass =
    'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-textMain text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all appearance-none cursor-pointer';

  // Canonical category order
  const categoryOrder = ['HOMME', 'FEMME', 'ENFANT', 'BÉBÉ'];
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  const grouped = categoryOrder
    .map(cat => {
      const catIdx = data.findIndex(c => normalize(c.name) === normalize(cat));
      if (catIdx < 0) return null;
      // Sort references by OLDA code (e.g. H-001, F-012, B-003)
      const refs = data[catIdx].references
        .map((ref, refIdx) => ({ key: `${catIdx}-${refIdx}`, name: ref.name }))
        .sort((a, b) => {
          const codeA = a.name.match(/-\s*([A-Z]\d+)/)?.[1] || a.name;
          const codeB = b.name.match(/-\s*([A-Z]\d+)/)?.[1] || b.name;
          return codeA.localeCompare(codeB, undefined, { numeric: true });
        });
      return {
        catName: cat.charAt(0) + cat.slice(1).toLowerCase(),
        refs,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null && g.refs.length > 0);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-textMuted mb-1 text-sm">Référence produit</label>
        <select
          className={selectClass}
          value={selectedRefKey}
          onChange={e => setSelectedRefKey(e.target.value)}
        >
          <option value="">— Choisir une référence —</option>
          {grouped.map(group => (
            <optgroup key={group.catName} label={group.catName}>
              {group.refs.map(r => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedFlat && (
        <div>
          <label className="block text-textMuted mb-1 text-sm">Couleur</label>
          <select className={selectClass} value={colorIndex} onChange={e => setColorIndex(Number(e.target.value))}>
            <option value={-1}>—</option>
            {colors.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
          </select>
        </div>
      )}

      {selected && (
        <div className="mt-2 flex gap-2">
          <div className="flex-1 rounded-lg border border-border overflow-hidden bg-white">
            <p className="text-[10px] text-center text-gray-400 uppercase pt-1">Avant</p>
            <img src={selected.front} alt="Avant" className="w-full h-28 object-contain" />
          </div>
          {selected.back && (
            <div className="flex-1 rounded-lg border border-border overflow-hidden bg-white">
              <p className="text-[10px] text-center text-gray-400 uppercase pt-1">Arrière</p>
              <img src={selected.back} alt="Arrière" className="w-full h-28 object-contain" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
