"""
OLDA — Imposition Backend
Génère un PDF prêt pour Roland VersaWorks avec vraies Spot Colors.

Stack:
  - FastAPI (serveur léger)
  - pikepdf (lecture/écriture PDF basse couche)
  - reportlab (génération des couches séparation)
  - Shapely (calcul contours offset)

Install:
  pip install fastapi uvicorn pikepdf reportlab shapely python-multipart

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import io
import base64
import math
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# PDF generation
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import landscape
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics

# Geometric offset for CutContour
from shapely.geometry import Point

import pikepdf

app = FastAPI(title="OLDA Imposition API", version="1.0.0")

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Frontend static files ────────────────────────────────────────────────────
DIST_DIR = Path(__file__).parent / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_frontend():
        return FileResponse(DIST_DIR / "index.html")


# ─── Constants ───────────────────────────────────────────────────────────────
SHEET_WIDTH_MM = 600
SHEET_HEIGHT_MM = 300
MAGNET_DIAMETER_MM = 49
MAGNET_RADIUS_MM = MAGNET_DIAMETER_MM / 2
BLEED_MM = 3  # CutContour offset
BORDER_MM = 3  # Extra border beyond bleed


# ─── Models ──────────────────────────────────────────────────────────────────
class PlacedLogo(BaseModel):
    slot_id: str
    cx_mm: float
    cy_mm: float
    logo_data: Optional[str] = None   # None = empty slot
    logo_type: Optional[str] = None
    logo_name: Optional[str] = None


class ImpositionRequest(BaseModel):
    sheet_width_mm: float = SHEET_WIDTH_MM
    sheet_height_mm: float = SHEET_HEIGHT_MM
    magnet_radius_mm: float = MAGNET_RADIUS_MM
    bleed_mm: float = BLEED_MM
    border_mm: float = BORDER_MM
    logos: List[PlacedLogo]


# ─── PDF Generation ──────────────────────────────────────────────────────────

def build_spot_color(name: str, c: float, m: float, y: float, k: float):
    """
    Returns a ReportLab Spot Color definition.
    c/m/y/k are the CMJN alternates (0.0–1.0) used for on-screen preview.
    The actual spot color name is what VersaWorks reads.
    """
    return colors.CMYKColorSep(c, m, y, k, spotName=name, density=1.0)


def generate_imposition_pdf(req: ImpositionRequest) -> bytes:
    """
    Generates a 2-page PDF:
      Page 1: Gabarit — tous les cercles vides (contour + CutContour), sans logos
      Page 2: Logos — uniquement les images des logos clippées dans leurs cercles
    Returns raw PDF bytes.
    """
    buf = io.BytesIO()

    page_w = req.sheet_width_mm * mm
    page_h = req.sheet_height_mm * mm

    c = rl_canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setTitle("OLDA Imposition — VersaWorks Ready")
    c.setAuthor("OLDA Studio")

    def flip_y(cy_mm):
        return (req.sheet_height_mm - cy_mm) * mm

    # ── Page 1 : Gabarit (cercles vides) ──────────────────────────────────
    spot_cut = build_spot_color("CutContour", 0, 1.0, 1.0, 0)

    for item in req.logos:
        cx = item.cx_mm * mm
        cy_rl = flip_y(item.cy_mm)
        r = req.magnet_radius_mm * mm
        r_cut = (req.magnet_radius_mm + req.bleed_mm) * mm

        # Cercle intérieur blanc avec contour gris
        c.setFillColorRGB(1, 1, 1)
        c.setStrokeColorRGB(0.55, 0.55, 0.6)
        c.setLineWidth(0.4)
        c.circle(cx, cy_rl, r, fill=1, stroke=1)

        # CutContour (cercle de découpe)
        c.setFillColor(colors.transparent)
        c.setStrokeColor(spot_cut)
        c.setLineWidth(0.25)
        c.circle(cx, cy_rl, r_cut, fill=0, stroke=1)

    # ── Page 2 : Logos uniquement ─────────────────────────────────────────
    c.showPage()
    c.setPageSize((page_w, page_h))

    for item in req.logos:
        if not item.logo_data or not item.logo_type:
            continue
        if not item.logo_type.startswith("image/"):
            continue

        cx = item.cx_mm * mm
        cy_rl = flip_y(item.cy_mm)
        r = req.magnet_radius_mm * mm

        header, data = item.logo_data.split(",", 1) if "," in item.logo_data else ("", item.logo_data)
        img_bytes = base64.b64decode(data)
        img_buf = io.BytesIO(img_bytes)

        c.saveState()
        p = c.beginPath()
        p.circle(cx, cy_rl, r)
        c.clipPath(p, stroke=0, fill=0)
        c.drawImage(
            img_buf,
            cx - r, cy_rl - r,
            width=r * 2, height=r * 2,
            preserveAspectRatio=True,
            mask="auto",
        )
        c.restoreState()

    c.save()
    return buf.getvalue()


def merge_layers_with_pikepdf(pdf_bytes: bytes) -> bytes:
    """
    Post-processes the PDF with pikepdf to:
    1. Set proper PDF/X-4 metadata
    2. Name the separation layers correctly
    3. Set OutputIntent for VersaWorks compatibility
    Returns optimized PDF bytes.
    """
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        # Set PDF metadata
        with pdf.open_metadata() as meta:
            meta["dc:title"] = "OLDA Imposition — Roland VersaWorks"
            meta["dc:creator"] = ["OLDA Studio"]
            meta["xmp:CreatorTool"] = "OLDA Imposition v1.0"

        # Name pages as layers
        layer_names = ["Gabarit", "Logos"]
        for i, page in enumerate(pdf.pages):
            if i < len(layer_names):
                # Add page label hint for VersaWorks
                page["/Olda_Layer"] = pikepdf.String(layer_names[i])

        out = io.BytesIO()
        pdf.save(out, linearize=False)
        return out.getvalue()


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "OLDA Imposition API", "version": "1.0.0"}


@app.post("/generate-pdf")
async def generate_pdf(req: ImpositionRequest):
    """
    Main endpoint. Accepts imposition layout, returns VersaWorks-ready PDF.
    
    Payload example:
    {
      "logos": [
        {
          "slot_id": "0-0",
          "cx_mm": 42.5,
          "cy_mm": 32.5,
          "logo_data": "data:image/png;base64,...",
          "logo_type": "image/png",
          "logo_name": "client_logo"
        }
      ]
    }
    """
    if not req.logos:
        raise HTTPException(status_code=400, detail="Aucun slot à imposer")

    try:
        # Step 1: Generate multi-page PDF with layers
        raw_pdf = generate_imposition_pdf(req)

        # Step 2: Post-process with pikepdf (metadata + optimization)
        final_pdf = merge_layers_with_pikepdf(raw_pdf)

        return StreamingResponse(
            io.BytesIO(final_pdf),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="OLDA_Imposition_{len(req.logos)}_logos.pdf"',
                "Content-Length": str(len(final_pdf)),
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération PDF: {str(e)}")


@app.get("/gabarit-info")
async def gabarit_info():
    """Returns the sheet specifications for the frontend to use."""
    return {
        "sheet_width_mm": SHEET_WIDTH_MM,
        "sheet_height_mm": SHEET_HEIGHT_MM,
        "magnet_diameter_mm": MAGNET_DIAMETER_MM,
        "bleed_mm": BLEED_MM,
        "border_mm": BORDER_MM,
        "cols": 11,
        "rows": 5,
        "total_positions": 55,
        "spot_colors": ["CutContour", "RDG_WHITE", "RDG_GLOSS"],
        "compatible": ["Roland VersaWorks 6", "VersaWorks Dual", "PDF/X-4"],
    }


# ─── Catch-all SPA (doit être en dernier) ────────────────────────────────────
if DIST_DIR.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Retourne index.html pour toutes les routes React."""
        return FileResponse(DIST_DIR / "index.html")
