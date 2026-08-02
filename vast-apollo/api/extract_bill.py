"""Offline bill extraction — reads a GST purchase invoice with no external API.

Replaces the Gemini Vision call in index.js. RapidOCR reads the text, img2table
recovers the line-item grid, and the rules below map columns onto the same JSON
shape index.js already validates, so nothing downstream changes.

Unlike a vision model this does not *understand* a bill; it finds text and grid
lines and applies rules. Column names it doesn't recognise land in `_debug` so a
new vendor layout can be diagnosed from the response.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_models")

# Vercel's runtime filesystem is read-only, so RapidOCR must never try to fetch
# these. They are committed to the repo and pointed at explicitly.
MODEL_PARAMS = {
    "Det.model_path": os.path.join(MODEL_DIR, "PP-OCRv6_det_small.onnx"),
    "Cls.model_path": os.path.join(MODEL_DIR, "ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
    "Rec.model_path": os.path.join(MODEL_DIR, "PP-OCRv6_rec_small.onnx"),
}

# Built once and reused — a warm function shouldn't reload 30MB of ONNX per request.
_ocr_engine = None


def _get_ocr():
    global _ocr_engine
    if _ocr_engine is None:
        from img2table.ocr import RapidOCR

        _ocr_engine = RapidOCR(params=dict(MODEL_PARAMS))
    return _ocr_engine


# ---------------------------------------------------------------- header fields

# 15 chars: 2 state digits, 5 PAN letters, 4 digits, letter, entity char, Z, checksum.
GSTIN_RE = re.compile(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b")

BILL_NO_RE = re.compile(
    r"(?:invoice|bill|inv|challan)\s*(?:no|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/\-]{2,})",
    re.IGNORECASE,
)

_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
DATE_RES = [
    re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b"),          # 2026-07-28
    re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b"),          # 28-07-2026
    re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b"),          # 28-07-26
    re.compile(rf"\b(\d{{1,2}})\s*[-\s]\s*({_MONTHS})[a-z]*\s*[-\s]\s*(\d{{4}})\b", re.IGNORECASE),
]
_MONTH_NUM = {m: i + 1 for i, m in enumerate(_MONTHS.split("|"))}


def _normalise_date(text: str) -> str | None:
    """Return the first date in `text` as YYYY-MM-DD, or None."""
    for i, pattern in enumerate(DATE_RES):
        m = pattern.search(text)
        if not m:
            continue
        try:
            if i == 0:
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif i == 3:
                d = int(m.group(1))
                mo = _MONTH_NUM[m.group(2).lower()[:3]]
                y = int(m.group(3))
            else:
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if y < 100:  # two-digit year
                    y += 2000
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except (ValueError, KeyError):
            continue
    return None


def _clean_number(value: str) -> float:
    """Pull a number out of an OCR cell: '₹ 2,450.00' -> 2450.0, '' -> 0.0."""
    if not value:
        return 0.0
    text = value.replace(",", "").replace("|", "")
    m = re.search(r"-?\d+(?:\.\d+)?", text)
    if not m:
        return 0.0
    try:
        return float(m.group(0))
    except ValueError:
        return 0.0


def _parse_header(lines: list[str]) -> dict:
    blob = "\n".join(lines)

    gst = ""
    gst_match = GSTIN_RE.search(blob.replace(" ", ""))
    if gst_match:
        gst = gst_match.group(1)

    bill_number = ""
    for line in lines:
        m = BILL_NO_RE.search(line)
        if m:
            candidate = m.group(1).strip(" .:-")
            # "INVOICE NO DATE" style headers yield junk words; require a digit.
            if any(ch.isdigit() for ch in candidate):
                bill_number = candidate
                break

    bill_date = None
    for line in lines:
        if re.search(r"date", line, re.IGNORECASE):
            bill_date = _normalise_date(line)
            if bill_date:
                break
    if not bill_date:
        bill_date = _normalise_date(blob)

    # Company name: the first substantial line that isn't a label, id or date.
    company = ""
    for line in lines[:8]:
        stripped = line.strip()
        if len(stripped) < 4:
            continue
        low = stripped.lower()
        if GSTIN_RE.search(stripped.replace(" ", "")):
            continue
        if any(w in low for w in ("tax invoice", "invoice", "bill no", "gstin", "date", "original")):
            continue
        if _normalise_date(stripped):
            continue
        company = stripped
        break

    lower_blob = blob.lower()
    has_igst = "igst" in lower_blob
    has_local = "cgst" in lower_blob or "sgst" in lower_blob
    # Local (CGST+SGST) is the common case, so only call it interstate when IGST
    # is the only tax mentioned.
    is_local = has_local or not has_igst

    return {
        "company_name": company,
        "gst_number": gst,
        "bill_number": bill_number,
        "bill_date": bill_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "is_local": is_local,
    }


# ------------------------------------------------------------------ item table

# Checked in order — "HSN Code" must match hsn before it can match cost_code.
COLUMN_RULES = [
    ("hsn", ("hsn", "sac")),
    ("description", ("description", "particular", "goods", "item", "product", "details", "name")),
    ("quantity", ("qty", "quantity", "pcs", "nos", "piece", "pack")),
    ("discount", ("disc",)),
    ("selling", ("mrp", "sell", "retail")),
    ("rate", ("rate", "price", "value")),
    ("amount", ("amount", "total")),
    ("cost_code", ("code",)),
]


def _map_columns(header_cells: list[str]) -> dict[str, int]:
    """Map our field names onto column indexes using the table's header row."""
    mapping: dict[str, int] = {}
    for idx, raw in enumerate(header_cells):
        label = (raw or "").strip().lower()
        if not label:
            continue
        for field, keywords in COLUMN_RULES:
            if field in mapping:
                continue
            if any(k in label for k in keywords):
                mapping[field] = idx
                break
    return mapping


def _cells(row) -> list[str]:
    return [(c.value or "").replace("\n", " ").strip() for c in row]


def _score_table(table) -> int:
    """How much this table looks like a list of purchased goods."""
    if not table.content:
        return -1
    header = _cells(next(iter(table.content.values())))
    mapping = _map_columns(header)
    score = len(mapping) * 2
    if "description" in mapping:
        score += 5
    if len(table.content) >= 2:
        score += len(table.content)
    return score


def _build_items(table) -> tuple[list[dict], list[str]]:
    rows = list(table.content.values())
    header = _cells(rows[0])
    mapping = _map_columns(header)

    def cell(cells: list[str], field: str) -> str:
        idx = mapping.get(field)
        if idx is None or idx >= len(cells):
            return ""
        return cells[idx]

    items = []
    for row in rows[1:]:
        cells = _cells(row)
        if not any(cells):
            continue

        name = cell(cells, "description").strip()
        quantity = int(_clean_number(cell(cells, "quantity")) or 1)
        rate = _clean_number(cell(cells, "rate"))
        amount = _clean_number(cell(cells, "amount"))

        # Some bills print only a line total; derive the per-piece cost from it.
        if rate <= 0 and amount > 0 and quantity > 0:
            rate = round(amount / quantity, 2)

        # A row with neither a name nor a price is a total/footer line, not an item.
        if not name and rate <= 0:
            continue

        hsn = re.sub(r"\D", "", cell(cells, "hsn"))
        code = re.sub(r"[^A-Za-z]", "", cell(cells, "cost_code")).upper()

        items.append({
            "saree_name": name or "Not specified",
            "material": "Not specified",
            "quantity": quantity if quantity > 0 else 1,
            "cost_price": rate,
            "hsn_code": hsn or "5407",
            "cost_code": code,
            "selling_price": _clean_number(cell(cells, "selling")),
            "discount_percent": _clean_number(cell(cells, "discount")),
        })

    return items, header


def extract_bill_data(image_bytes: bytes) -> dict:
    """Read an invoice image and return the same JSON shape index.js expects."""
    import tempfile

    from img2table.document import PDF as TablePDF
    from img2table.document import Image as TableImage

    ocr = _get_ocr()

    # The uploader accepts PDFs as well as photos, and they need different readers.
    is_pdf = image_bytes[:5] == b"%PDF-"

    # img2table wants a path or file object; /tmp is the only writable place here.
    with tempfile.NamedTemporaryFile(suffix=".pdf" if is_pdf else ".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        doc = TablePDF(tmp_path) if is_pdf else TableImage(tmp_path)

        # Read every page image for the header fields, not just the first.
        lines: list[str] = []
        for page in doc.images:
            page_result = ocr.engine(page)
            lines.extend(t for t in (page_result.txts or []) if t and t.strip())
        header = _parse_header(lines)
        tables = doc.extract_tables(
            ocr=ocr,
            implicit_rows=False,
            borderless_tables=True,
            min_confidence=50,
        )

        items: list[dict] = []
        detected_header: list[str] = []
        if tables:
            best = max(tables, key=_score_table)
            items, detected_header = _build_items(best)

        return {
            "vendor": {
                "company_name": header["company_name"],
                "gst_number": header["gst_number"],
                "bill_number": header["bill_number"],
                "bill_date": header["bill_date"],
            },
            "transaction": {"is_local": header["is_local"]},
            "items": items,
            # Surfaced so an unrecognised vendor layout can be diagnosed from the
            # response instead of guessed at.
            "_debug": {
                "tables_found": len(tables),
                "detected_columns": detected_header,
                "mapped_fields": sorted(_map_columns(detected_header).keys()),
                "text_lines": len(lines),
            },
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ------------------------------------------------------------------- http entry


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Health check — confirms the native libraries actually import."""
        try:
            import cv2
            import onnxruntime

            models = {
                os.path.basename(p): os.path.exists(p) for p in MODEL_PARAMS.values()
            }
            self._send(200, {
                "ok": True,
                "cv2": cv2.__version__,
                "onnxruntime": onnxruntime.__version__,
                "models": models,
            })
        except Exception as err:  # noqa: BLE001 — report the import failure verbatim
            self._send(500, {"ok": False, "error": f"{type(err).__name__}: {err}"})

    def do_POST(self):
        secret = os.environ.get("INTERNAL_API_SECRET")
        if secret and self.headers.get("X-Internal-Secret") != secret:
            self._send(401, {"error": "Unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._send(400, {"error": "No image supplied"})
            return

        try:
            data = self.rfile.read(length)
            self._send(200, extract_bill_data(data))
        except Exception as err:  # noqa: BLE001 — surface the reason to the caller
            self._send(500, {"error": f"{type(err).__name__}: {err}"})
