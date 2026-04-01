import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface ExportOptions {
  clientName?: string;
  reference?: string;
  onBeforeDownload?: () => void;
}

/**
 * Data collected for a single logo in the DOUBLE-PASS injection step.
 * domLeft/domTop/domW/domH are in CSS pixels, relative to the BatPage element.
 */
interface LogoLayer {
  src: string;
  format: 'PNG' | 'JPEG';
  domLeft: number;  // px — top-left of the actual image within the BatPage
  domTop:  number;  // px
  domW:    number;  // px — actual rendered width  (aspect-ratio correct)
  domH:    number;  // px — actual rendered height
}

export async function generateProductionPDF(
  element: HTMLElement,
  options: ExportOptions = {},
): Promise<void> {
  try {
    options.onBeforeDownload?.();

    // 1. SCROLL RESET — both axes
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    window.scrollTo(0, 0);
    // Let fonts, images and layout stabilise before capture
    await new Promise(resolve => setTimeout(resolve, 150));

    // 2. IMAGE PATCHES + LOGO COLLECTION ──────────────────────────────────
    //
    // TWO distinct strategies depending on image type:
    //
    //  a) T-shirt images (.bat-tshirt):
    //     html2canvas misrenders CSS object-fit:contain (stretches image to fill
    //     its box).  Fix: pre-compute the exact letterboxed pixel size and swap
    //     to object-fit:fill with those dimensions before capture, then restore.
    //
    //  b) Logo images (all non-tshirt images with object-fit:contain):
    //     DOUBLE-PASS — bypass html2canvas entirely for logos.
    //
    //     WHY: a logo displayed at 60 CSS px is captured as 60×4=240 px even
    //     with scale:4.  Its source dataURL may be 2000+ px.  html2canvas
    //     downsizes source→display before capturing → heavy pixelisation.
    //     Solution: hide logos during html2canvas, then inject them straight
    //     into jsPDF via addImage() with their original full-resolution dataURL.
    //     jsPDF embeds all source pixels; the logo prints at 300+ DPI.
    //
    const elementsToRestore: { el: HTMLElement; prop: string; val: string }[] = [];
    const logoContainersToClean: Element[] = [];  // data-logo-hide cleanup
    const logoLayers: LogoLayer[] = [];

    // Snapshot BatPage rect BEFORE any DOM mutation
    const elementRect = element.getBoundingClientRect();
    const images = Array.from(element.querySelectorAll('img')) as HTMLImageElement[];

    images.forEach((img: HTMLImageElement) => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const compStyle = window.getComputedStyle(img);
      if (compStyle.objectFit !== 'contain') return;

      const rect = img.getBoundingClientRect();
      const boxW = rect.width;
      const boxH = rect.height;
      if (!boxW || !boxH) return;

      // Actual pixel size the browser renders for object-fit:contain
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = boxW / boxH;
      let actualW: number, actualH: number;
      if (imgRatio > boxRatio) {
        actualW = boxW;
        actualH = boxW / imgRatio;
      } else {
        actualH = boxH;
        actualW = boxH * imgRatio;
      }

      if (img.classList.contains('bat-tshirt')) {
        // ── a) T-shirt: objectFit:contain → fill swap ──────────────────────
        const parent = img.parentElement;
        if (parent) {
          elementsToRestore.push({ el: parent, prop: 'width',  val: parent.style.width });
          elementsToRestore.push({ el: parent, prop: 'height', val: parent.style.height });
          parent.style.width  = `${parent.offsetWidth}px`;
          parent.style.height = `${parent.offsetHeight}px`;
        }
        (['width', 'height', 'maxWidth', 'maxHeight', 'objectFit', 'margin', 'display'] as const)
          .forEach(p => elementsToRestore.push({ el: img, prop: p, val: (img.style as any)[p] }));

        img.style.width     = `${actualW}px`;
        img.style.height    = `${actualH}px`;
        img.style.maxWidth  = `${actualW}px`;
        img.style.maxHeight = `${actualH}px`;
        img.style.objectFit = 'fill';
        img.style.display   = 'block';
        img.style.margin    = 'auto';

      } else {
        // ── b) Logo: collect HD layer data + hide for html2canvas ──────────
        const src = img.src;
        if (!src || !src.startsWith('data:')) return; // must be a loaded dataURL

        // Letterbox offsets: gap between the CSS square box and the actual image
        const offX = (boxW - actualW) / 2;
        const offY = (boxH - actualH) / 2;

        logoLayers.push({
          src,
          format: (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg'))
            ? 'JPEG' : 'PNG',
          // Position of the actual image (not the square CSS box) within BatPage
          domLeft: (rect.left - elementRect.left) + offX,
          domTop:  (rect.top  - elementRect.top)  + offY,
          domW: actualW,
          domH: actualH,
        });

        // Mark the whole LogoSlot container (.absolute.z-20, 2 levels up)
        // so that html2canvas ignores it completely via the ignoreElements hook.
        // DOM path: img → .group.relative → .absolute.z-20 (containerRef)
        const slotContainer = img.parentElement?.parentElement;
        if (slotContainer && slotContainer !== element && element.contains(slotContainer)) {
          slotContainer.setAttribute('data-logo-hide', '1');
          logoContainersToClean.push(slotContainer);
        } else {
          // Fallback: just hide the img with visibility
          elementsToRestore.push({ el: img, prop: 'visibility', val: img.style.visibility });
          img.style.visibility = 'hidden';
        }
      }
    });

    // 3. CAPTURE ULTRA HD — t-shirts + background, logos hidden ───────────
    //
    // explicit width/height/windowWidth/windowHeight freezes the layout at
    // the element's own pixel dimensions, regardless of the browser viewport.
    const elementW = element.offsetWidth;
    const elementH = element.offsetHeight;

    const canvas = await html2canvas(element, {
      scale: 4,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: elementW,
      height: elementH,
      windowWidth: elementW,
      windowHeight: elementH,
      ignoreElements: (node) =>
        (node.hasAttribute?.('data-no-pdf') || node.hasAttribute?.('data-logo-hide')) ?? false,
    });

    // 4. DOM RESTAURATION — both style patches and logo-hide markers
    window.scrollTo(originalScrollX, originalScrollY);
    elementsToRestore.forEach(item => { (item.el.style as any)[item.prop] = item.val; });
    logoContainersToClean.forEach(c => c.removeAttribute('data-logo-hide'));

    // 5. PDF CONSTRUCTION ─────────────────────────────────────────────────
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();   // 297 mm
    const pdfH = pdf.internal.pageSize.getHeight();  // 210 mm

    const canvasRatio = canvas.width / canvas.height;
    let bgW = pdfW;
    let bgH = pdfW / canvasRatio;
    if (bgH > pdfH) { bgH = pdfH; bgW = pdfH * canvasRatio; }

    // Centering offsets (≈ 0 mm for the exact 1123×794 BatPage)
    const offsetX = (pdfW - bgW) / 2;
    const offsetY = (pdfH - bgH) / 2;

    // Separate X/Y scale factors (mm per CSS px).
    // BatPage 1123×794 → A4 297×210 mm : both ≈ 0.2644, difference < 0.03%.
    const scaleX = bgW / elementW;
    const scaleY = bgH / elementH;

    // 5a. Background layer: html2canvas raster (t-shirts, text, table, frames)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, offsetY, bgW, bgH);

    // 5b. Logo layers: direct HD injection ────────────────────────────────
    //
    // Each logo is placed at the exact DOM position it occupied on screen,
    // converted to PDF mm with the same scale factors used for the background.
    //
    //   pdfX = offsetX + domLeft × scaleX
    //   pdfY = offsetY + domTop  × scaleY
    //   pdfW = domW    × scaleX
    //   pdfH = domH    × scaleY
    //
    // domLeft/domTop already account for the object-fit:contain letterbox
    // offset, so the logo lands on the t-shirt at exactly the right spot.
    for (const logo of logoLayers) {
      pdf.addImage(
        logo.src,
        logo.format,
        offsetX + logo.domLeft * scaleX,
        offsetY + logo.domTop  * scaleY,
        logo.domW * scaleX,
        logo.domH * scaleY,
      );
    }

    // 6. TÉLÉCHARGEMENT
    const refStr  = options.reference ? `_${options.reference.replace(/\s+/g, '_')}` : '';
    const dateStr = new Date().toISOString().split('T')[0];
    pdf.save(`BAT_Production${refStr}_${dateStr}.pdf`);

  } catch (error) {
    console.error('[BAT] Échec export PDF :', error);
    throw error;
  }
}

/**
 * Exporte toutes les fiches en PDFs individuels.
 */
export async function exportAllPdfs(
  cards: { clientName: string; reference: string }[],
  getPage: (index: number) => HTMLElement | null,
  switchCard: (index: number) => void,
): Promise<void> {
  for (let i = 0; i < cards.length; i++) {
    switchCard(i);
    await new Promise(r => setTimeout(r, 350));
    const el = getPage(i);
    if (!el) continue;
    await generateProductionPDF(el, {
      clientName: cards[i].clientName,
      reference:  cards[i].reference,
    });
  }
}
