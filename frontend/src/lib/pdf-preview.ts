import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Removes only the background white of a rendered PDF logo.
 *
 * WHY flood-fill instead of a global threshold pass:
 *   A global "R>240 → alpha=0" sweep destroys intentional white design
 *   elements (white text, white fills, etc.) that are surrounded by other
 *   colours inside the logo.  A flood-fill seeded from every edge pixel that
 *   is near-white propagates only through connected near-white regions that
 *   touch the page border — i.e. the document background — and stops as soon
 *   as it hits a coloured pixel.  Interior white regions that are not
 *   reachable from any edge are left fully opaque.
 *
 * Algorithm: 4-connected DFS (push/pop) starting from all near-white edge
 * pixels.  O(W×H) time and space.  Uses pop() instead of shift() to avoid
 * the O(n) cost of shift on plain arrays.
 */
function removeBackgroundWhite(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const isNearWhite = (pi: number) =>
    pixels[pi] > 240 && pixels[pi + 1] > 240 && pixels[pi + 2] > 240;

  const visited = new Uint8Array(width * height); // 0 = unvisited
  const stack: number[] = [];

  const enqueue = (idx: number) => {
    if (visited[idx] === 0 && isNearWhite(idx * 4)) {
      visited[idx] = 1;
      stack.push(idx);
    }
  };

  // Seed: all four edges
  for (let x = 0; x < width; x++) {
    enqueue(x);                          // top row
    enqueue((height - 1) * width + x);  // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);                  // left column
    enqueue(y * width + width - 1);     // right column
  }

  // DFS: erase each reachable near-white pixel and propagate to 4 neighbours
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const pi  = idx * 4;
    pixels[pi + 3] = 0; // transparent

    const x = idx % width;
    const y = (idx / width) | 0;

    if (x > 0)          enqueue(idx - 1);
    if (x < width - 1)  enqueue(idx + 1);
    if (y > 0)          enqueue(idx - width);
    if (y < height - 1) enqueue(idx + width);
  }
}

/**
 * Renders the first page of a PDF to a PNG dataURL for preview display.
 */
export async function pdfToPreview(pdfBytes: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await pdf.getPage(1);
  // High-resolution render for crisp vector preview
  const scale = 6;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Remove background white while preserving intentional white design elements
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  removeBackgroundWhite(imageData.data, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  pdf.destroy();
  return dataUrl;
}
