import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';

export type SizeQty = { size: string; qty: string; logoSizeFront: string; logoSizeBack: string };

export type ProductMeta = {
  genre: string;
  col: string;
  coupe: string;
  designation: string;
  grammage: string;
  matiere: string;
  ethique: string;
};

export type LogoEntry = {
  preview: string;           // dataURL for UI display
  pdfBytes: Uint8Array | null; // original PDF bytes (vector)
  imageDataUrl: string | null; // original image dataURL (raster)
  type: 'pdf' | 'image';
};

export type LogoPosition = {
  xPct: number;   // 0–1, position du centre en % du container
  yPct: number;   // 0–1
  scale: number;  // 1 = taille par défaut (120px max)
};

export type BatData = {
  clientName: string;
  date: string;
  reference: string;
  docType: string;
  color: string;
  sizesQty: SizeQty[];
  tshirtImage: string | null;
  tshirtBackImage: string | null;
  tshirtSleeveImage: string | null;
  frontLogo: LogoEntry | null;
  backLogo: LogoEntry | null;
  frontLogoPos: LogoPosition;
  backLogoPos: LogoPosition;
  frontLogoSize: string;
  backLogoSize: string;
  showLeftSleeve: boolean;
  showRightSleeve: boolean;
  leftSleeveLogo: LogoEntry | null;
  rightSleeveLogo: LogoEntry | null;
  leftSleeveLogoPos: LogoPosition;
  rightSleeveLogoPos: LogoPosition;
  leftSleeveLogoSize: string;
  rightSleeveLogoSize: string;
  note: string;
  productMeta: ProductMeta | null;
};

const defaultSizes: SizeQty[] = [
  { size: 'XS', qty: '', logoSizeFront: '', logoSizeBack: '' },
  { size: 'S', qty: '', logoSizeFront: '', logoSizeBack: '' },
  { size: 'M', qty: '', logoSizeFront: '', logoSizeBack: '' },
  { size: 'L', qty: '', logoSizeFront: '', logoSizeBack: '' },
  { size: 'XL', qty: '', logoSizeFront: '', logoSizeBack: '' },
  { size: 'XXL', qty: '', logoSizeFront: '', logoSizeBack: '' },
];

function createEmptyCard(clientName: string, date: string, docType: string): BatData {
  return {
    clientName,
    date,
    reference: '',
    docType,
    color: '',
    sizesQty: defaultSizes.map(s => ({ ...s })),
    tshirtImage: null,
    tshirtBackImage: null,
    tshirtSleeveImage: null,
    frontLogo: null,
    backLogo: null,
    frontLogoPos: { xPct: 0.62, yPct: 0.32, scale: 0.7 },
    backLogoPos: { xPct: 0.50, yPct: 0.35, scale: 1.0 },
    frontLogoSize: '',
    backLogoSize: '',
    showLeftSleeve: false,
    showRightSleeve: false,
    leftSleeveLogo: null,
    rightSleeveLogo: null,
    leftSleeveLogoPos: { xPct: 0.5, yPct: 0.45, scale: 0.7 },
    rightSleeveLogoPos: { xPct: 0.5, yPct: 0.45, scale: 0.7 },
    leftSleeveLogoSize: '',
    rightSleeveLogoSize: '',
    note: '',
    productMeta: null,
  };
}

function App() {
  const [cards, setCards] = useState<BatData[]>([
    createEmptyCard('', new Date().toISOString().split('T')[0], 'Bon à tirer'),
  ]);
  const [activeIndex, setActiveIndex] = useState(0);

  const data = cards[activeIndex];

  const setData: React.Dispatch<React.SetStateAction<BatData>> = useCallback((action) => {
    setCards(prev => {
      const updated = [...prev];
      updated[activeIndex] = typeof action === 'function' ? action(prev[activeIndex]) : action;
      return updated;
    });
  }, [activeIndex]);

  const addCard = () => {
    const newCard = createEmptyCard(data.clientName, data.date, data.docType);
    setCards(prev => [...prev, newCard]);
    setActiveIndex(cards.length);
  };

  const removeCard = (index: number) => {
    if (cards.length <= 1) return;
    setCards(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(prev => prev >= index ? Math.max(0, prev - 1) : prev);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar data={data} setData={setData} />
      <Preview
        cards={cards}
        activeIndex={activeIndex}
        setActiveIndex={setActiveIndex}
        addCard={addCard}
        removeCard={removeCard}
        setData={setData}
      />
    </div>
  );
}

export default App;
