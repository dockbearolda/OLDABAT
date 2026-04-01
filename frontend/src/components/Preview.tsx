import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import type { BatData, LogoEntry, LogoPosition } from '../App';
import { Logo } from './Logo';
import { pdfToPreview } from '../lib/pdf-preview';
import { generateProductionPDF, exportAllPdfs } from '../lib/pdf-export';

interface PreviewProps {
  cards: BatData[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  addCard: () => void;
  removeCard: (i: number) => void;
  setData: React.Dispatch<React.SetStateAction<BatData>>;
}

/** Processes a file into a LogoEntry */
async function fileToLogoEntry(file: File): Promise<LogoEntry> {
  if (file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(buf);
    const preview = await pdfToPreview(pdfBytes);
    return { preview, pdfBytes, imageDataUrl: null, type: 'pdf' };
  }
  const dataUrl = await new Promise<string>(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
  return { preview: dataUrl, pdfBytes: null, imageDataUrl: dataUrl, type: 'image' };
}

/**
 * Compute the actual rendered bounds of an object-contain image within its zone.
 * Returns offsets and dimensions of the image within the zone element.
 */
function getImageBounds(zone: HTMLElement): { offX: number; offY: number; w: number; h: number } | null {
  const img = zone.querySelector('img') as HTMLImageElement;
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const zoneW = zone.clientWidth;
  const zoneH = zone.clientHeight;
  const scale = Math.min(zoneW / img.naturalWidth, zoneH / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { offX: (zoneW - w) / 2, offY: (zoneH - h) / 2, w, h };
}

/** Logo slot — draggable + resizable diagonally (aspect ratio locked)
 *  Coordinates (xPct, yPct) are IMAGE-RELATIVE: (0,0)=top-left of t-shirt, (1,1)=bottom-right.
 */
function LogoSlot({
  logo,
  onPlace,
  onRemove,
  position,
  onPositionChange,
  label,
  onDragStateChange,
}: {
  logo: LogoEntry | null;
  onPlace: (entry: LogoEntry) => void;
  onRemove: () => void;
  position: LogoPosition;
  onPositionChange: (pos: LogoPosition) => void;
  label: string;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [justPlaced, setJustPlaced] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPctX: number; startPctY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const dragStateRef = useRef(onDragStateChange);
  dragStateRef.current = onDragStateChange;

  // Track actual image bounds within the zone via ResizeObserver
  const [imgBounds, setImgBounds] = useState<{ offX: number; offY: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const zone = containerRef.current?.parentElement;
    if (!zone) return;
    const update = () => setImgBounds(getImageBounds(zone));
    const ro = new ResizeObserver(update);
    ro.observe(zone);
    const img = zone.querySelector('img') as HTMLImageElement;
    if (img) { img.addEventListener('load', update); }
    update();
    return () => { ro.disconnect(); if (img) img.removeEventListener('load', update); };
  }, []);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const entry = await fileToLogoEntry(file);
      onPlace(entry);
      setJustPlaced(true);
    } catch (err) {
      console.error('Erreur traitement logo:', err);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onPlace]);

  useEffect(() => {
    if (justPlaced) {
      const t = setTimeout(() => setJustPlaced(false), 600);
      return () => clearTimeout(t);
    }
  }, [justPlaced]);

  // --- DRAG logic (image-relative coordinates) ---
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (isResizing) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStateRef.current?.(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPctX: position.xPct, startPctY: position.yPct };
  }, [position, isResizing]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      // Use image bounds for delta calculation — drag moves relative to t-shirt
      const bounds = getImageBounds(parent);
      const refW = bounds?.w ?? parent.clientWidth;
      const refH = bounds?.h ?? parent.clientHeight;
      const dx = (e.clientX - dragRef.current.startX) / refW;
      const dy = (e.clientY - dragRef.current.startY) / refH;
      const xPct = Math.max(0.02, Math.min(0.98, dragRef.current.startPctX + dx));
      const yPct = Math.max(0.02, Math.min(0.98, dragRef.current.startPctY + dy));
      onPositionChange({ ...position, xPct, yPct });
    };
    const onUp = () => { setIsDragging(false); dragStateRef.current?.(false); dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, position, onPositionChange]);

  // --- RESIZE logic (diagonal, keep ratio) ---
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startScale: position.scale };
  }, [position.scale]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
      const dy = e.clientY - resizeRef.current.startY;
      const diag = (dx + dy) / 2;
      // Compute max scale based on image bounds so logo never exceeds t-shirt
      const parent = containerRef.current?.parentElement;
      const bounds = parent ? getImageBounds(parent) : null;
      const dynMaxScale = bounds ? (Math.min(bounds.w, bounds.h) * 0.85) / BASE_SIZE : 3;
      const newScale = Math.max(0.2, Math.min(dynMaxScale, resizeRef.current.startScale + diag / 120));
      onPositionChange({ ...position, scale: newScale });
    };
    const onUp = () => { setIsResizing(false); resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizing, position, onPositionChange]);

  const BASE_SIZE = 120;
  // Clamp logo size so it never exceeds the t-shirt image bounds
  const maxLogoSize = imgBounds ? Math.min(imgBounds.w, imgBounds.h) * 0.85 : BASE_SIZE * 4;
  const maxScale = maxLogoSize / BASE_SIZE;
  const clampedScale = Math.min(position.scale, maxScale);
  const scaledSize = BASE_SIZE * clampedScale;

  // Convert image-relative position to pixel position within zone
  // Also clamp position so the logo stays within the image bounds
  const halfW = scaledSize / 2;
  const halfH = scaledSize / 2;
  let pixelLeft: number, pixelTop: number;
  if (imgBounds) {
    const minX = imgBounds.offX + halfW;
    const maxX = imgBounds.offX + imgBounds.w - halfW;
    const minY = imgBounds.offY + halfH;
    const maxY = imgBounds.offY + imgBounds.h - halfH;
    pixelLeft = Math.max(minX, Math.min(maxX, imgBounds.offX + imgBounds.w * position.xPct));
    pixelTop = Math.max(minY, Math.min(maxY, imgBounds.offY + imgBounds.h * position.yPct));
  } else {
    pixelLeft = 0;
    pixelTop = 0;
  }
  const cssPos = imgBounds
    ? { left: `${pixelLeft}px`, top: `${pixelTop}px` }
    : { left: `${position.xPct * 100}%`, top: `${position.yPct * 100}%` };


  return (
    <div
      ref={containerRef}
      className="absolute z-20"
      style={{
        left: cssPos.left,
        top: cssPos.top,
        // CRITICAL: NO transform here — html2canvas cannot reliably render
        // translate(-50%,-50%). We use negative margins instead.
        marginLeft: logo ? `${-scaledSize / 2}px` : '-22px',
        marginTop: logo ? `${-scaledSize / 2}px` : '-22px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        className="hidden"
        onChange={handleFile}
      />

      {loading ? (
        <div className="w-14 h-14 flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin relative z-10" />
          </div>
        </div>
      ) : logo ? (
        <div
          className="group relative"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            animation: justPlaced ? 'logoReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : undefined,
          }}
        >
          {/* Bounding box visible on hover */}
          {(isHovered || isDragging || isResizing) && (
            <div
              className="absolute pointer-events-none"
              style={{
                inset: '-4px',
                border: '1.5px dashed rgba(59, 130, 246, 0.5)',
                borderRadius: '4px',
              }}
            />
          )}
          <img
            src={logo.preview}
            alt={label}
            onMouseDown={onDragStart}
            draggable={false}
            style={{
              width: `${scaledSize}px`,
              height: `${scaledSize}px`,
              objectFit: 'contain',
              filter: isHovered
                ? 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.25))'
                : 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
              userSelect: 'none',
            }}
          />
          {/* Resize handle — bottom-right corner */}
          <div
            onMouseDown={onResizeStart}
            style={{
              position: 'absolute',
              right: '-6px',
              bottom: '-6px',
              width: '14px',
              height: '14px',
              cursor: 'nwse-resize',
              background: (isHovered || isResizing) ? 'rgba(59, 130, 246, 0.9)' : 'transparent',
              borderRadius: '2px',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {(isHovered || isResizing) && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M7 1L1 7M7 4L4 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          {/* Remove button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out"
            style={{
              background: 'rgba(239, 68, 68, 0.9)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              transform: isHovered ? 'scale(1)' : 'scale(0.5)',
              transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <X className="w-3 h-3 text-white" />
          </button>
          {/* Replace button */}
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out"
            style={{
              background: 'rgba(59, 130, 246, 0.9)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
              transform: isHovered ? 'scale(1)' : 'scale(0.5)',
              transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            title="Remplacer le logo"
          >
            <RefreshCw className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="logo-slot-btn group relative flex items-center justify-center"
          title={label}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: isHovered
              ? '0 4px 20px rgba(59, 130, 246, 0.35), 0 0 0 2px rgba(59, 130, 246, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.6)'
              : '0 2px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
            transform: isHovered ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          onMouseDown={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)';
          }}
          onMouseUp={e => {
            (e.currentTarget as HTMLElement).style.transform = isHovered ? 'scale(1.15)' : 'scale(1)';
          }}
        >
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              animation: 'slotPulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              border: '1.5px solid rgba(59, 130, 246, 0.3)',
            }}
          />
          <Plus
            className="relative z-10 transition-all duration-300"
            style={{
              width: '18px',
              height: '18px',
              color: isHovered ? '#3b82f6' : '#6b7280',
              transform: isHovered ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'color 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />
        </button>
      )}
    </div>
  );
}

/** Crosshair guide — only visible when logo is being dragged */
function Crosshair({ position, visible }: { position: LogoPosition; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [imgBounds, setImgBounds] = useState<{ offX: number; offY: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const zone = ref.current?.parentElement;
    if (!zone) return;
    const update = () => setImgBounds(getImageBounds(zone));
    const ro = new ResizeObserver(update);
    ro.observe(zone);
    const img = zone.querySelector('img') as HTMLImageElement;
    if (img) img.addEventListener('load', update);
    update();
    return () => { ro.disconnect(); if (img) img.removeEventListener('load', update); };
  }, []);

  if (!visible) return <div ref={ref} className="absolute inset-0 pointer-events-none" />;

  const left = imgBounds ? imgBounds.offX + imgBounds.w * position.xPct : `${position.xPct * 100}%`;
  const top = imgBounds ? imgBounds.offY + imgBounds.h * position.yPct : `${position.yPct * 100}%`;

  return (
    <div ref={ref} className="absolute inset-0 z-30 pointer-events-none">
      <div className="absolute top-0 bottom-0 w-px bg-red-500/50" style={{ left: typeof left === 'number' ? `${left}px` : left }} />
      <div className="absolute left-0 right-0 h-px bg-red-500/50" style={{ top: typeof top === 'number' ? `${top}px` : top }} />
      <div
        className="absolute"
        style={{
          left: typeof left === 'number' ? `${left}px` : left,
          top: typeof top === 'number' ? `${top}px` : top,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="w-3 h-3 rounded-full border-2 border-red-500 bg-red-500/20" />
      </div>
    </div>
  );
}

function BatPage({
  data,
  setData,
  pageIndex,
}: {
  data: BatData;
  setData: React.Dispatch<React.SetStateAction<BatData>>;
  pageIndex: number;
}) {
  const [isFrontDragging, setIsFrontDragging] = useState(false);
  const [isBackDragging, setIsBackDragging] = useState(false);

  return (
    <div
      id={`bat-page-${pageIndex}`}
      className="bg-white shadow-2xl shrink-0"
      style={{ width: '1123px', height: '794px' }}
    >
      <div className="w-full h-full relative flex flex-col p-12 overflow-hidden bg-white text-black" style={{ fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } as React.CSSProperties}>
        {/* HEADER */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Logo className="w-20 h-20 text-black" />
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight">{data.docType || 'Bon à Tirer'}</h1>
                <p className="text-black font-medium">DOCUMENT DE VALIDATION</p>
              </div>
            </div>
          </div>
          <div className="text-right text-sm space-y-1">
            <p className="text-[10px] text-black">{data.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}</p>
            <p><span className="font-bold text-black">{data.clientName || '__________________'}</span></p>
            <p><span className="font-bold text-black">Référence :</span> <span className="font-bold text-blue-600">{data.reference || '__________________'}</span></p>
          </div>
        </div>

        {/* DÉTAILS TECHNIQUES — compact */}
        <div className="mb-3 bg-gray-50 px-4 py-2 rounded border border-gray-200">
          {/* Row 1: product details inline */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-0.5 text-[11px]">
            {data.color && (
              <span><span className="text-gray-500 text-[10px] mr-1">Couleur :</span><span className="font-bold text-black">{data.color}</span></span>
            )}
            {data.productMeta?.col && (
              <span><span className="text-gray-500 text-[10px] mr-1">Col :</span><span className="font-bold text-black">{data.productMeta.col}</span></span>
            )}
            {data.productMeta?.coupe && (
              <span><span className="text-gray-500 text-[10px] mr-1">Coupe :</span><span className="font-bold text-black">{data.productMeta.coupe}</span></span>
            )}
            {data.productMeta?.grammage && (
              <span><span className="text-gray-500 text-[10px] mr-1">Grammage :</span><span className="font-bold text-black">{data.productMeta.grammage} g/m²</span></span>
            )}
            {data.productMeta?.matiere && (
              <span><span className="text-gray-500 text-[10px] mr-1">Matière :</span><span className="font-bold text-black">{data.productMeta.matiere}</span></span>
            )}
            {data.productMeta?.ethique && (
              <span><span className="text-gray-500 text-[10px] mr-1">Éthique :</span><span className="font-bold text-black">{data.productMeta.ethique}</span></span>
            )}
          </div>
          {/* Row 2: sizes with logo dimensions */}
          <div className="flex items-center gap-x-1 mt-1 pt-1 border-t border-gray-200 text-[11px]">
            <span className="text-black uppercase text-[9px] mr-1">Tailles</span>
            {data.sizesQty.some(r => r.qty) ? (
              <span className="flex flex-wrap gap-x-3">
                {data.sizesQty.filter(r => r.qty).map((r, i) => {
                const hasDims = r.logoSizeFront || r.logoSizeBack;
                return (
                  <span key={i}>
                    <span className="font-bold">{r.size}×{r.qty}</span>
                    {hasDims && (
                      <span className="font-bold text-black text-[11px] ml-1">
                        ({r.logoSizeFront && <><span className="font-normal text-[9px]">AV: </span><span className="font-extrabold">{r.logoSizeFront} mm</span></>}
                        {r.logoSizeFront && r.logoSizeBack && ' '}
                        {r.logoSizeBack && <><span className="font-normal text-[9px]">AR: </span><span className="font-extrabold">{r.logoSizeBack} mm</span></>})
                      </span>
                    )}
                  </span>
                );
              })}
              </span>
            ) : (
              <span className="font-bold">-</span>
            )}
          </div>
        </div>

        {/* ZONE VISUELLE — auto-resize toutes les zones */}
        {data.tshirtImage ? (
          <div className="flex-1 flex flex-col mt-3 min-h-0">
            <div className="flex-1 flex gap-3 min-h-0">
              {/* MANCHE GAUCHE */}
              {data.showLeftSleeve && (
                <div className="relative border-2 border-dashed border-gray-300 rounded overflow-hidden bg-gray-50/30" style={{ flex: '0 0 18%' }}>
                  <p className="absolute top-2 left-2 text-[9px] text-black uppercase font-bold z-20">Manche G.</p>
                  {data.tshirtSleeveImage && (
                    <img src={data.tshirtSleeveImage} alt="Manche G." className="bat-tshirt absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ transform: 'scaleX(-1)' }} />
                  )}
                  <LogoSlot
                    logo={data.leftSleeveLogo}
                    onPlace={entry => setData(prev => ({ ...prev, leftSleeveLogo: entry }))}
                    onRemove={() => setData(prev => ({ ...prev, leftSleeveLogo: null }))}
                    position={data.leftSleeveLogoPos}
                    onPositionChange={pos => setData(prev => ({ ...prev, leftSleeveLogoPos: pos }))}
                    label="Logo manche gauche"
                  />
                </div>
              )}

              {/* AVANT */}
              <div className="relative border-2 border-dashed border-gray-300 rounded overflow-hidden" style={{ flex: '1 1 0%' }}>
                <p className="absolute top-2 left-3 text-[10px] text-black uppercase font-bold z-20">Avant</p>
                <img src={data.tshirtImage} alt="Avant" className="bat-tshirt absolute inset-0 w-full h-full object-contain pointer-events-none" />
                <Crosshair
                  position={data.frontLogoPos}
                  visible={isFrontDragging}
                />
                <LogoSlot
                  logo={data.frontLogo}
                  onPlace={entry => setData(prev => ({ ...prev, frontLogo: entry }))}
                  onRemove={() => setData(prev => ({ ...prev, frontLogo: null }))}
                  position={data.frontLogoPos}
                  onPositionChange={pos => setData(prev => ({ ...prev, frontLogoPos: pos }))}
                  label="Logo avant (cœur)"
                  onDragStateChange={setIsFrontDragging}
                />
              </div>

              {/* ARRIÈRE */}
              {data.tshirtBackImage && (
                <div className="relative border-2 border-dashed border-gray-300 rounded overflow-hidden" style={{ flex: '1 1 0%' }}>
                  <p className="absolute top-2 left-3 text-[10px] text-black uppercase font-bold z-20">Arrière</p>
                  <img src={data.tshirtBackImage} alt="Arrière" className="bat-tshirt absolute inset-0 w-full h-full object-contain pointer-events-none" />
                  <Crosshair
                    position={data.backLogoPos}
                    visible={isBackDragging}
                  />
                  <LogoSlot
                    logo={data.backLogo}
                    onPlace={entry => setData(prev => ({ ...prev, backLogo: entry }))}
                    onRemove={() => setData(prev => ({ ...prev, backLogo: null }))}
                    position={data.backLogoPos}
                    onPositionChange={pos => setData(prev => ({ ...prev, backLogoPos: pos }))}
                    label="Logo arrière (centre dos)"
                    onDragStateChange={setIsBackDragging}
                  />
                </div>
              )}

              {/* MANCHE DROITE */}
              {data.showRightSleeve && (
                <div className="relative border-2 border-dashed border-gray-300 rounded overflow-hidden bg-gray-50/30" style={{ flex: '0 0 18%' }}>
                  <p className="absolute top-2 left-2 text-[9px] text-black uppercase font-bold z-20">Manche D.</p>
                  {data.tshirtSleeveImage && (
                    <img src={data.tshirtSleeveImage} alt="Manche D." className="bat-tshirt absolute inset-0 w-full h-full object-contain pointer-events-none" />
                  )}
                  <LogoSlot
                    logo={data.rightSleeveLogo}
                    onPlace={entry => setData(prev => ({ ...prev, rightSleeveLogo: entry }))}
                    onRemove={() => setData(prev => ({ ...prev, rightSleeveLogo: null }))}
                    position={data.rightSleeveLogoPos}
                    onPositionChange={pos => setData(prev => ({ ...prev, rightSleeveLogoPos: pos }))}
                    label="Logo manche droite"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 relative border-2 border-dashed border-gray-300 rounded overflow-hidden mt-4">
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 pointer-events-none">
              <span className="text-lg uppercase font-bold tracking-widest opacity-50">Aucun textile sélectionné</span>
            </div>
          </div>
        )}

        {/* NOTE */}
        {data.note && (
          <div className="mt-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-gray-700">
            <span className="text-amber-600 font-bold uppercase text-[9px] mr-1.5">Note</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{data.note}</span>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-black text-center uppercase tracking-widest">
          Ce document fait office de contrat. La signature de ce BAT valide la mise en production.
        </div>
      </div>
    </div>
  );
}

export function Preview({ cards, activeIndex, setActiveIndex, addCard, removeCard, setData }: PreviewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const data = cards[activeIndex];

  const handleExportSingle = async () => {
    const el = document.getElementById(`bat-page-${activeIndex}`);
    if (!el) return;
    setIsExporting(true);
    try {
      await generateProductionPDF(el, {
        clientName: data.clientName,
        reference:  data.reference,
      });
    } catch (e) {
      console.error('[BAT] Export failed:', e);
      alert('Erreur lors de la génération du PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    const originalIndex = activeIndex;
    try {
      await exportAllPdfs(
        cards,
        (i) => document.getElementById(`bat-page-${i}`),
        setActiveIndex,
      );
    } catch (e) {
      console.error('[BAT] Export all failed:', e);
      alert('Erreur lors de la génération des PDFs.');
    } finally {
      setActiveIndex(originalIndex);
      setIsExporting(false);
    }
  };

  return (
    <main className="flex-1 bg-background flex flex-col items-center justify-start overflow-auto p-8 border-l border-border relative">

      {/* HEADER BAR */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-textMain">Aperçu du Document</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportSingle}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface hover:bg-surfaceHover text-textMain border border-border font-medium rounded-md transition-all active:scale-95 disabled:opacity-50 text-sm"
            data-no-pdf
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Cette fiche</span>
          </button>
          {cards.length > 1 && (
            <button
              onClick={handleExportAll}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primaryHover text-white font-medium rounded-md shadow-md shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 text-sm"
              data-no-pdf
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Tout ({cards.length} pages)</span>
            </button>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="w-full max-w-4xl flex items-center gap-1 mb-4">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`relative group flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
              i === activeIndex
                ? 'bg-white text-gray-800 shadow-sm'
                : 'bg-surface text-textMuted hover:bg-surfaceHover hover:text-textMain'
            }`}
          >
            <span>Fiche {i + 1}</span>
            {card.reference && (
              <span className={`text-xs ${i === activeIndex ? 'text-blue-600' : 'text-textMuted'}`}>
                {card.reference}
              </span>
            )}
            {cards.length > 1 && (
              <span
                onClick={e => { e.stopPropagation(); removeCard(i); }}
                className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all cursor-pointer"
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
        <button
          onClick={addCard}
          className="flex items-center gap-1 px-3 py-2 rounded-t-lg text-sm text-textMuted hover:text-primary hover:bg-surfaceHover transition-all"
          title="Ajouter une fiche"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <PageScaler pageIndex={activeIndex}>
        <BatPage data={data} setData={setData} pageIndex={activeIndex} />
      </PageScaler>
    </main>
  );
}

/**
 * Scales the BatPage to fit the available width using CSS zoom.
 * This ensures the page never overflows the container.
 * CSS zoom (not transform) properly adjusts layout flow.
 */
function PageScaler({ children, pageIndex }: { children: React.ReactNode; pageIndex: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const main = container.parentElement;
    if (!main) return;

    const update = () => {
      // Available width = main width minus padding (p-8 = 32px each side)
      const availW = main.clientWidth - 64;
      const z = Math.min(1, availW / 1123);
      setZoom(z);
    };

    const ro = new ResizeObserver(update);
    ro.observe(main);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      id={`bat-page-scaler-${pageIndex}`}
      style={{
        zoom,
        transformOrigin: 'top center',
      }}
    >
      {children}
    </div>
  );
}
