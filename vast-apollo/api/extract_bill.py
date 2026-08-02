"""Offline bill extraction — reads a GST purchase invoice with no external API.

Replaces the Gemini Vision call in index.js. RapidOCR reads the text and the
geometry below rebuilds the line-item table from the position of each detected
box, so the result maps onto the same JSON shape index.js already validates and
nothing downstream changes.

The table is reconstructed from coordinates rather than by detecting ruled lines.
That keeps the dependency set to base OpenCV — img2table would do this job but
needs cv2.ximgproc from the contrib build, which is ~160MB larger on Linux and
put the function over Vercel's 500MB limit. Reading geometry also copes with
bills whose columns aren't ruled.

Unlike a vision model this does not *understand* a bill; it groups text and
applies rules. The header labels it found land in `_debug` so an unfamiliar
vendor layout can be diagnosed from the response.
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
        from rapidocr import LangRec, RapidOCR

        params = dict(MODEL_PARAMS)
        params["Rec.lang_type"] = LangRec.EN
        _ocr_engine = RapidOCR(params=params)
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


# --------------------------------------------------------- table from geometry


class Box:
    """One OCR detection, reduced to an axis-aligned rectangle plus its text."""

    __slots__ = ("text", "x1", "y1", "x2", "y2")

    def __init__(self, text: str, points):
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
        self.text = text.strip()
        self.x1, self.x2 = min(xs), max(xs)
        self.y1, self.y2 = min(ys), max(ys)

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def height(self) -> float:
        return self.y2 - self.y1


def _group_rows(boxes: list[Box]) -> list[list[Box]]:
    """Cluster boxes into visual rows by vertical overlap."""
    if not boxes:
        return []

    heights = sorted(b.height for b in boxes)
    median_h = heights[len(heights) // 2] or 1.0
    tolerance = median_h * 0.6

    rows: list[list[Box]] = []
    for box in sorted(boxes, key=lambda b: b.cy):
        # Same row when the vertical centre is within tolerance of the row's centre.
        if rows:
            current = rows[-1]
            row_cy = sum(b.cy for b in current) / len(current)
            if abs(box.cy - row_cy) <= tolerance:
                current.append(box)
                continue
        rows.append([box])

    return [sorted(row, key=lambda b: b.x1) for row in rows]


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


def _match_field(label: str, taken: set[str]) -> str | None:
    low = label.strip().lower()
    if not low:
        return None
    for field, keywords in COLUMN_RULES:
        if field in taken:
            continue
        if any(k in low for k in keywords):
            return field
    return None


def _find_header_row(rows: list[list[Box]]) -> int:
    """The row that names the most of our known columns is the table header."""
    best_idx, best_score = -1, 0
    for idx, row in enumerate(rows):
        taken: set[str] = set()
        for box in row:
            field = _match_field(box.text, taken)
            if field:
                taken.add(field)
        score = len(taken) + (2 if "description" in taken else 0)
        if score > best_score:
            best_idx, best_score = idx, score
    # Two named columns is the floor; below that it isn't a table header.
    return best_idx if best_score >= 3 else -1


def _assign_columns(header_row: list[Box]) -> tuple[list[tuple[float, float]], dict[str, int]]:
    """Column x-spans from the header, plus which of our fields each one is."""
    spans = [(b.x1, b.x2) for b in header_row]
    mapping: dict[str, int] = {}
    taken: set[str] = set()
    for idx, box in enumerate(header_row):
        field = _match_field(box.text, taken)
        if field:
            mapping[field] = idx
            taken.add(field)
    return spans, mapping


def _cells_for_row(row: list[Box], spans: list[tuple[float, float]]) -> list[str]:
    """Drop each box into the column it overlaps most."""
    cells: list[list[str]] = [[] for _ in spans]
    for box in row:
        best_idx, best_overlap = None, 0.0
        for idx, (sx1, sx2) in enumerate(spans):
            overlap = min(box.x2, sx2) - max(box.x1, sx1)
            if overlap > best_overlap:
                best_idx, best_overlap = idx, overlap
        if best_idx is None:
            # No overlap at all (a wide wrapped description); fall back to nearest.
            centre = (box.x1 + box.x2) / 2
            best_idx = min(
                range(len(spans)),
                key=lambda i: abs(centre - (spans[i][0] + spans[i][1]) / 2),
            )
        cells[best_idx].append(box.text)
    return [" ".join(parts).strip() for parts in cells]


# Rows at or after these words are totals, not goods.
STOP_WORDS = ("grand total", "sub total", "subtotal", "total amount", "taxable value",
              "cgst", "sgst", "igst", "round off", "amount in words", "e.& o.e")


def _build_items(rows: list[list[Box]], header_idx: int) -> tuple[list[dict], list[str]]:
    spans, mapping = _assign_columns(rows[header_idx])
    header_labels = [b.text for b in rows[header_idx]]

    def cell(cells: list[str], field: str) -> str:
        idx = mapping.get(field)
        if idx is None or idx >= len(cells):
            return ""
        return cells[idx]

    items: list[dict] = []
    for row in rows[header_idx + 1:]:
        joined = " ".join(b.text for b in row).lower()
        if any(word in joined for word in STOP_WORDS):
            break

        cells = _cells_for_row(row, spans)
        if not any(cells):
            continue

        name = cell(cells, "description").strip()
        quantity = int(_clean_number(cell(cells, "quantity")) or 1)
        rate = _clean_number(cell(cells, "rate"))
        amount = _clean_number(cell(cells, "amount"))

        # Some bills print only a line total; derive the per-piece cost from it.
        if rate <= 0 and amount > 0 and quantity > 0:
            rate = round(amount / quantity, 2)

        # A row with neither a name nor a price is a stray line, not an item.
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

    return items, header_labels


# ------------------------------------------------------------------- page input


def _page_images(data: bytes) -> list:
    """Render the upload to a list of numpy images — one per page for PDFs."""
    import numpy as np

    if data[:5] == b"%PDF-":
        import pypdfium2

        pdf = pypdfium2.PdfDocument(data)
        try:
            # 200 dpi keeps small print legible without blowing up memory.
            return [
                np.asarray(page.render(scale=200 / 72).to_pil().convert("RGB"))[:, :, ::-1]
                for page in pdf
            ]
        finally:
            pdf.close()

    import cv2

    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode the uploaded image")
    return [image]


def extract_bill_data(image_bytes: bytes) -> dict:
    """Read an invoice image and return the same JSON shape index.js expects."""
    ocr = _get_ocr()

    all_lines: list[str] = []
    items: list[dict] = []
    header_labels: list[str] = []
    rows_seen = 0

    for page in _page_images(image_bytes):
        result = ocr(page)
        texts = list(result.txts or [])
        boxes_raw = result.boxes if result.boxes is not None else []
        if not texts:
            continue

        all_lines.extend(t for t in texts if t and t.strip())

        boxes = [Box(t, pts) for t, pts in zip(texts, boxes_raw) if t and t.strip()]
        rows = _group_rows(boxes)
        rows_seen += len(rows)

        # Take the line items from the first page that actually has a table.
        if not items:
            header_idx = _find_header_row(rows)
            if header_idx >= 0:
                items, header_labels = _build_items(rows, header_idx)

    header = _parse_header(all_lines)

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
            "text_lines": len(all_lines),
            "rows_detected": rows_seen,
            "detected_columns": header_labels,
        },
    }


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
        """Health check — imports each native library separately.

        A shared try block only reports the first failure, which is useless when
        several wheels carry native code and any one of them can be the problem.
        """
        import importlib

        report: dict[str, str] = {}
        for name in ("numpy", "cv2", "onnxruntime", "PIL", "pypdfium2", "shapely", "rapidocr"):
            try:
                module = importlib.import_module(name)
                report[name] = getattr(module, "__version__", "ok")
            except Exception as err:  # noqa: BLE001 — the reason is the whole point
                report[name] = f"FAILED {type(err).__name__}: {err}"

        models = {os.path.basename(p): os.path.exists(p) for p in MODEL_PARAMS.values()}
        ok = not any(v.startswith("FAILED") for v in report.values())
        self._send(200 if ok else 500, {"ok": ok, "imports": report, "models": models})

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
