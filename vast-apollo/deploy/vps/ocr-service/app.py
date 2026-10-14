import base64
import io
import json
import os
import urllib.request
import re
import tempfile
import subprocess
from datetime import datetime

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import Response


app = FastAPI(
    title="Lakshmi Sarees OCR",
    docs_url=None,
    redoc_url=None
)

OCR_LANGS = os.getenv("OCR_LANGS", "eng+tel")
MAX_UPLOAD = 10 * 1024 * 1024


# ============================================================
# BASIC HELPERS
# ============================================================

def clean_text(text: str) -> str:
    text = text.replace("\x0c", "")
    text = text.replace("₹", " Rs ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def money(value):
    if value is None:
        return None

    value = str(value)
    value = value.replace(",", "")
    value = value.replace("₹", "")
    value = re.sub(r"(?i)\b(?:rs|inr)\.?\b", "", value)
    value = value.strip()

    try:
        return round(float(value), 2)
    except Exception:
        return None


def first_money(line):
    matches = re.findall(
        r"(?:₹|Rs\.?|INR)?\s*"
        r"[-()]?\s*"
        r"\d[\d,]*(?:\.\d{1,2})?",
        line,
        re.I
    )

    values = []

    for item in matches:
        negative = "(" in item or item.strip().startswith("-")
        number = money(
            item.replace("(", "")
                .replace(")", "")
                .replace("-", "")
        )

        if number is not None:
            values.append(
                -number if negative else number
            )

    return values


def parse_date_value(value):
    if not value:
        return None

    value = value.strip()

    formats = (
        "%d-%b-%y",
        "%d-%b-%Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        "%Y-%m-%d",
        "%Y/%m/%d"
    )

    for fmt in formats:
        try:
            return datetime.strptime(
                value,
                fmt
            ).strftime("%Y-%m-%d")
        except ValueError:
            pass

    return None


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def decode_image(data: bytes):
    arr = np.frombuffer(data, np.uint8)

    image = cv2.imdecode(
        arr,
        cv2.IMREAD_COLOR
    )

    if image is None:
        raise ValueError("Unable to decode image")

    return image


def resize_for_ocr(image):
    height, width = image.shape[:2]

    longest = max(height, width)

    if longest > 3000:
        scale = 3000 / longest

        image = cv2.resize(
            image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA
        )

    elif longest < 1800:
        scale = min(
            2.0,
            2000 / longest
        )

        image = cv2.resize(
            image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC
        )

    return image


def deskew(image):
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    threshold = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY_INV +
        cv2.THRESH_OTSU
    )[1]

    coords = np.column_stack(
        np.where(threshold > 0)
    )

    if len(coords) < 500:
        return image

    angle = cv2.minAreaRect(
        coords
    )[-1]

    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    # Do not rotate wildly because tables can confuse detection.
    if abs(angle) > 8:
        return image

    height, width = image.shape[:2]

    matrix = cv2.getRotationMatrix2D(
        (width // 2, height // 2),
        angle,
        1.0
    )

    return cv2.warpAffine(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )


def preprocess_ocr(image):
    image = resize_for_ocr(image)
    image = deskew(image)

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    gray = cv2.fastNlMeansDenoising(
        gray,
        None,
        7,
        7,
        21
    )

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    gray = clahe.apply(gray)

    blur = cv2.GaussianBlur(
        gray,
        (0, 0),
        1.0
    )

    sharpened = cv2.addWeighted(
        gray,
        1.6,
        blur,
        -0.6,
        0
    )

    return sharpened


# ============================================================
# OCR
# ============================================================

def run_ocr(image):
    processed = preprocess_ocr(image)

    # Main structured pass.
    pass1 = pytesseract.image_to_string(
        processed,
        lang=OCR_LANGS,
        config="--oem 1 --psm 6"
    )

    # Sparse-text pass helps with invoice headers and totals.
    pass2 = pytesseract.image_to_string(
        processed,
        lang=OCR_LANGS,
        config="--oem 1 --psm 11"
    )

    combined = clean_text(
        pass1 + "\n" + pass2
    )

    return combined


def pdf_images(data: bytes, last_page: int = 5):
    """Render a PDF to page images.

    A vendor bill is one or two pages, so five is a generous ceiling and keeps a mistaken
    200-page upload from burning the whole request. A colour sheet is a different thing:
    one saree per page, so a ten-page sheet must give ten pictures, not five.
    """
    result = []

    with tempfile.TemporaryDirectory() as tmp:
        pdf = os.path.join(
            tmp,
            "invoice.pdf"
        )

        with open(pdf, "wb") as f:
            f.write(data)

        prefix = os.path.join(
            tmp,
            "page"
        )

        subprocess.run(
            [
                "pdftoppm",
                "-jpeg",
                "-r",
                "250",
                "-f",
                "1",
                "-l",
                str(last_page),
                pdf,
                prefix
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        for name in sorted(
            os.listdir(tmp)
        ):
            if not (
                name.startswith("page-")
                and name.endswith(".jpg")
            ):
                continue

            page = cv2.imread(
                os.path.join(tmp, name)
            )

            if page is not None:
                result.append(page)

    return result


# ============================================================
# INVOICE EXTRACTION
# ============================================================

GSTIN = re.compile(
    r"\b"
    r"\d{2}"
    r"[A-Z]{5}"
    r"\d{4}"
    r"[A-Z]"
    r"[1-9A-Z]"
    r"Z"
    r"[0-9A-Z]"
    r"\b",
    re.I
)


def split_before_buyer(text):
    match = re.search(
        r"buyer\s*(?:\(|bill\s*to|:)",
        text,
        re.I
    )

    if match:
        return text[:match.start()]

    return text


def find_vendor_gstin(text):
    header = split_before_buyer(text)

    matches = GSTIN.findall(
        header.upper()
    )

    return (
        matches[0].upper()
        if matches else None
    )


def find_vendor_name(lines):
    invoice_words = (
        "invoice",
        "credit bill",
        "tax invoice",
        "gstin",
        "phone",
        "ack no",
        "ack date",
        "irn",
        "buyer"
    )

    best = None

    for line in lines[:25]:
        candidate = line.strip()

        if len(candidate) < 5:
            continue

        lower = candidate.lower()

        if any(
            x in lower
            for x in invoice_words
        ):
            continue

        if re.search(
            r"\b(textiles?|sarees?|silks?|fabrics?|traders?|enterprises?|stores?)\b",
            lower
        ):
            return candidate[:150]

        if (
            candidate.upper() == candidate
            and re.search(
                r"[A-Z]{3}",
                candidate
            )
            and len(candidate) <= 150
        ):
            best = candidate

    return best


def find_bill_number(text):
    patterns = (
        r"(?:invoice\s*(?:no|number)?|bill\s*(?:no|number)?)"
        r"\s*[:.#-]?\s*"
        r"([A-Z0-9][A-Z0-9/_-]{2,30})",

        r"\b(INV[-/A-Z0-9]{3,30})\b"
    )

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            re.I
        )

        if match:
            value = match.group(1)

            if not value.lower().startswith(
                ("date", "dated")
            ):
                return value

    return None


def find_bill_date(text):
    patterns = (
        r"(?:dated|invoice\s*date|bill\s*date|date)"
        r"\s*[:.-]?\s*"
        r"(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4})",

        r"(?:dated|invoice\s*date|bill\s*date|date)"
        r"\s*[:.-]?\s*"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",

        r"\b(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b",

        r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b"
    )

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            re.I
        )

        if match:
            parsed = parse_date_value(
                match.group(1)
            )

            if parsed:
                return parsed

    return None


def find_value_near(lines, keywords):
    for keyword in keywords:
        for line in reversed(lines):
            if keyword in line.lower():
                values = first_money(line)

                if values:
                    return abs(values[-1])

    return None


def find_discount(lines):
    for line in lines:
        if "discount" not in line.lower():
            continue

        values = first_money(line)

        if values:
            return abs(values[-1])

    return 0


def find_items(lines):
    items = []

    skip = (
        "cgst",
        "sgst",
        "igst",
        "discount",
        "packing",
        "taxable",
        "grand total",
        "invoice total",
        "total tax",
        "amount chargeable"
    )

    for line in lines:
        lower = line.lower()

        if any(
            word in lower
            for word in skip
        ):
            continue

        hsn = re.search(
            r"\b(\d{4,8})\b",
            line
        )

        values = first_money(line)

        if not hsn or len(values) < 2:
            continue

        after_hsn = line[
            hsn.end():
        ]

        qty_match = re.search(
            r"\b(\d+)\s*"
            r"(?:NO'?S?|NOS|PCS?|PIECES?)\b",
            after_hsn,
            re.I
        )

        quantity = (
            int(qty_match.group(1))
            if qty_match else 1
        )

        description = line[
            :hsn.start()
        ].strip(" |:-")

        description = re.sub(
            r"^\d+\s+",
            "",
            description
        ).strip()

        # Usually the final two numbers in an invoice row
        # are rate and amount.
        rate = values[-2]
        amount = values[-1]

        if rate <= 0 or amount <= 0:
            continue

        items.append({
            "saree_name":
                description[:150]
                if description else None,

            "material": None,

            "quantity": quantity,

            "cost_price": rate,

            "hsn_code": hsn.group(1),

            "line_amount": amount
        })

        if len(items) >= 100:
            break

    return items


def parse_invoice(text):
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    vendor_gst = find_vendor_gstin(
        text
    )

    subtotal = find_value_near(
        lines,
        (
            "subtotal",
            "gross amount"
        )
    )

    discount_amount = find_discount(
        lines
    )

    packing_charges = find_value_near(
        lines,
        (
            "packing charges",
            "packing charge",
            "packing"
        )
    ) or 0

    taxable_value = find_value_near(
        lines,
        (
            "taxable value",
            "taxable"
        )
    )

    cgst_amount = find_value_near(
        lines,
        ("cgst",)
    ) or 0

    sgst_amount = find_value_near(
        lines,
        ("sgst", "utgst")
    ) or 0

    igst_amount = find_value_near(
        lines,
        ("igst",)
    ) or 0

    total_amount = find_value_near(
        lines,
        (
            "grand total",
            "invoice total",
            "amount payable",
            "amount chargeable",
            "net amount"
        )
    )

    # Fallback to a plain "Total" near the end.
    if total_amount is None:
        for line in reversed(
            lines[-30:]
        ):
            if re.search(
                r"\btotal\b",
                line,
                re.I
            ):
                values = first_money(
                    line
                )

                if values:
                    total_amount = abs(
                        values[-1]
                    )
                    break

    items = find_items(
        lines
    )

    # If subtotal isn't clearly printed,
    # derive it from line amounts.
    if subtotal is None and items:
        subtotal = round(
            sum(
                item["line_amount"]
                for item in items
            ),
            2
        )

    gst_amount = round(
        cgst_amount +
        sgst_amount +
        igst_amount,
        2
    )

    return {
        "company_name":
            find_vendor_name(lines),

        "vendor_gst_number":
            vendor_gst,

        "bill_number":
            find_bill_number(text),

        "bill_date":
            find_bill_date(text),

        "subtotal":
            subtotal or 0,

        "discount_amount":
            discount_amount or 0,

        "packing_charges":
            packing_charges or 0,

        "taxable_value":
            taxable_value or 0,

        "cgst_amount":
            cgst_amount,

        "sgst_amount":
            sgst_amount,

        "igst_amount":
            igst_amount,

        "gst_amount":
            gst_amount,

        "total_amount":
            total_amount or 0,

        "items":
            items,

        "raw_text":
            text
    }



# ============================================================
# AI READER (DeepSeek vision)
# Tesseract loses table columns on a tilted or shadowed photo. The vision model
# reads the bill as a human would. Tesseract stays as the fallback, so a missing
# key, no credit or an API outage still gives the old behaviour.
# ============================================================

AI_URL = os.getenv("AI_URL", "https://api.deepseek.com/chat/completions")
AI_MODEL = os.getenv("AI_MODEL", "deepseek-flash")
OWN_GSTIN_NOTE = os.getenv("OWN_GSTIN", "37ATTPK6588R1Z6")

AI_PROMPT = (
    "Read this Indian textile purchase invoice. Return ONLY JSON: "
    '{"company_name":str,"vendor_gst_number":str|null,"bill_number":str|null,'
    '"bill_date":"YYYY-MM-DD"|null,"is_local_transaction":bool,"discount_amount":num,'
    '"packing_charges":num,"taxable_value":num,"cgst_amount":num,"sgst_amount":num,'
    '"igst_amount":num,"total_amount":num,"items":[{"saree_name":str,"hsn_code":str,'
    '"quantity":int,"cost_price":num,"line_amount":num}]}. '
    "quantity = pieces (Qty/Pcs/Nos), cost_price = rate per piece, line_amount = row amount. "
    "is_local_transaction = true when CGST+SGST are charged, false for IGST. "
    f"Seller GST only, never the buyer {OWN_GSTIN_NOTE}. Use 0 or null when a value is absent. "
    "No markdown, no explanation."
)


def _ai_key():
    for path in ("/run/secrets/deepseek_key", os.path.expanduser("~/.deepseek_key")):
        try:
            key = open(path).read().strip()
            if key:
                return key
        except OSError:
            pass
    return os.getenv("DEEPSEEK_API_KEY") or None


AI_MAX_SIDE = int(os.getenv("AI_MAX_SIDE", "2400"))


def ai_jpeg(image):
    """JPEG small enough for the vision API: a 250 dpi scan is far bigger than
    it can take, and an oversized picture comes back as 400 Bad Request."""
    height, width = image.shape[:2]
    scale = AI_MAX_SIDE / max(height, width)

    if scale < 1:
        image = cv2.resize(
            image,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_AREA,
        )

    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()


def ai_invoice(data: bytes, mime: str):
    """Invoice read by the vision model, or None when it is unavailable."""
    key = _ai_key()

    if not key:
        return None

    body = {
        "model": AI_MODEL,
        "temperature": 0,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": AI_PROMPT},
                {"type": "image_url", "image_url": {
                    "url": f"data:{mime};base64,{base64.b64encode(data).decode()}"
                }},
            ],
        }],
    }

    request = urllib.request.Request(
        AI_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        reply = json.load(response)

    content = reply["choices"][0]["message"]["content"].strip()
    content = re.sub(r"^```(?:json)?|```$", "", content).strip()
    raw = json.loads(content)

    items = []

    for item in raw.get("items") or []:
        quantity = int(money(item.get("quantity")) or 0)
        rate = money(item.get("cost_price")) or 0
        amount = money(item.get("line_amount")) or round(quantity * rate, 2)

        if quantity <= 0 or rate <= 0:
            continue

        items.append({
            "saree_name": (item.get("saree_name") or "").strip()[:150] or None,
            "material": None,
            "quantity": quantity,
            "cost_price": round(rate, 2),
            "hsn_code": str(item.get("hsn_code") or "").strip(),
            "line_amount": round(amount, 2),
        })

    if not items:
        return None

    local = bool(raw.get("is_local_transaction", True))
    subtotal = round(sum(i["line_amount"] for i in items), 2)
    discount = money(raw.get("discount_amount")) or 0
    packing = money(raw.get("packing_charges")) or 0
    taxable = money(raw.get("taxable_value")) or round(subtotal - discount + packing, 2)
    cgst = money(raw.get("cgst_amount")) or 0
    sgst = money(raw.get("sgst_amount")) or 0
    igst = money(raw.get("igst_amount")) or 0

    if local and not (cgst or sgst):
        cgst = sgst = round(taxable * 2.5 / 100, 2)
    if not local and not igst:
        igst = round(taxable * 5 / 100, 2)

    gst = round(cgst + sgst + igst, 2)
    gstin = fix_gstin(str(raw.get("vendor_gst_number") or "").strip())

    return {
        "company_name": (raw.get("company_name") or "").strip() or None,
        "vendor_gst_number": gstin if gstin != OWN_GSTIN else None,
        "bill_number": (str(raw.get("bill_number")).strip() if raw.get("bill_number") else None),
        "bill_date": parse_date_value(str(raw.get("bill_date") or "")) or raw.get("bill_date"),
        "is_local_transaction": local,
        "subtotal": subtotal,
        "discount_amount": round(discount, 2),
        "packing_charges": round(packing, 2),
        "taxable_value": round(taxable, 2),
        "cgst_rate": 2.5 if local else 0,
        "sgst_rate": 2.5 if local else 0,
        "igst_rate": 0 if local else 5.0,
        "cgst_amount": round(cgst, 2),
        "sgst_amount": round(sgst, 2),
        "igst_amount": round(igst, 2),
        "gst_amount": gst,
        "total_amount": money(raw.get("total_amount")) or round(taxable + gst, 2),
        "items": items,
        "ocr_warnings": [],
        "raw_text": "",
        "read_by": "ai",
    }

# ============================================================
# IMAGE OPTIMIZATION
# ============================================================

def optimize_webp(
    data: bytes,
    kind: str
):
    image = Image.open(
        io.BytesIO(data)
    )

    image = ImageOps.exif_transpose(
        image
    )

    if image.mode == "RGBA":
        background = Image.new(
            "RGB",
            image.size,
            "white"
        )

        background.paste(
            image,
            mask=image.getchannel("A")
        )

        image = background

    elif image.mode != "RGB":
        image = image.convert("RGB")

    max_dimension = (
        2000
        if kind == "product"
        else 2400
    )

    image.thumbnail(
        (
            max_dimension,
            max_dimension
        ),
        Image.Resampling.LANCZOS
    )

    target = (
        450 * 1024
        if kind == "product"
        else 700 * 1024
    )

    best = None

    # High quality first. Only reduce quality
    # when the resulting file is unnecessarily large.
    for quality in (
        94,
        92,
        90,
        88,
        86
    ):
        out = io.BytesIO()

        image.save(
            out,
            format="WEBP",
            quality=quality,
            method=6
        )

        candidate = out.getvalue()
        best = candidate

        if len(candidate) <= target:
            break

    return best


# ============================================================
# ROUTES
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "tesseract",
        "languages": OCR_LANGS
    }


SPLIT_MIN_AREA = 0.02      # a photo smaller than 2% of the page is noise
SPLIT_MIN_SIDE = 0.25      # ...and one narrower or shorter than a quarter of the page is a sliver
SPLIT_MIN_ASPECT = 1 / 3   # a crop thinner than 1:3 is a door frame, not a saree
SPLIT_MAX_ASPECT = 3
SPLIT_MAX_PHOTOS = 30
SPLIT_MAX_PAGES = 30       # a sheet is one saree per page, unlike a bill


def photo_blocks(page):
    """Cut a catalogue page into its separate photos.

    The sheets are photos printed on white paper, so anything clearly darker
    than the paper is treated as a picture, and each blob becomes one crop.
    """
    height, width = page.shape[:2]
    gray = cv2.cvtColor(page, cv2.COLOR_BGR2GRAY)

    ink = cv2.threshold(
        cv2.GaussianBlur(gray, (5, 5), 0),
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )[1]

    # Close the gaps inside a photo so it comes out as one blob, not many.
    step = max(8, int(min(height, width) * 0.02))
    ink = cv2.morphologyEx(
        ink,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (step, step)),
    )

    boxes = []

    for contour in cv2.findContours(ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        x, y, w, h = cv2.boundingRect(contour)

        if w * h < SPLIT_MIN_AREA * height * width:
            continue

        # A model photo fills a good part of the page. The slivers this used to return -
        # a door frame beside the model, a strip of wall, the shadow under a plinth - are
        # all narrow or squat, so a crop must be at least a quarter of the page each way
        # and roughly photo-shaped rather than a ribbon.
        if w < width * SPLIT_MIN_SIDE or h < height * SPLIT_MIN_SIDE:
            continue

        aspect = w / float(h)
        if aspect < SPLIT_MIN_ASPECT or aspect > SPLIT_MAX_ASPECT:
            continue

        boxes.append((x, y, w, h))

    # Reading order: top to bottom, then left to right within a row.
    row = max(20, int(height * 0.05))
    boxes.sort(key=lambda b: (b[1] // row, b[0]))

    crops = [page[y:y + h, x:x + w] for x, y, w, h in boxes]

    # A full-page photo has nothing to cut, so keep the page itself.
    return crops or [page]


def crop_jpeg(image):
    """One crop, small enough to send to a browser."""
    height, width = image.shape[:2]
    scale = 1200 / max(height, width)

    if scale < 1:
        image = cv2.resize(
            image,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_AREA,
        )

    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()


@app.post("/split")
async def split(file: UploadFile = File(...)):
    """A colour sheet (PDF or photo) split into one picture per colour."""
    data = await file.read()

    if not data:
        raise HTTPException(400, "Empty file")

    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Maximum file size is 10MB")

    content_type = (file.content_type or "").lower()

    try:
        pages = (
            pdf_images(data, last_page=SPLIT_MAX_PAGES)
            if content_type == "application/pdf"
            else [decode_image(data)]
        )
    except Exception as exc:
        raise HTTPException(400, "Could not read the file: %s" % str(exc)[:120])

    photos = []

    for page in pages:
        for crop in photo_blocks(page):
            photos.append(
                "data:image/jpeg;base64," + base64.b64encode(crop_jpeg(crop)).decode()
            )

            if len(photos) >= SPLIT_MAX_PHOTOS:
                break

        if len(photos) >= SPLIT_MAX_PHOTOS:
            break

    return {"success": True, "photos": photos}


@app.post("/ocr")
async def ocr_bill(
    file: UploadFile = File(...)
):
    data = await file.read()

    if not data:
        raise HTTPException(
            400,
            "Empty file"
        )

    if len(data) > MAX_UPLOAD:
        raise HTTPException(
            413,
            "Maximum file size is 10MB"
        )

    content_type = (
        file.content_type or ""
    ).lower()

    try:
        # The vision model takes images, so a PDF bill is rendered first.
        try:
            if content_type.startswith("image/"):
                # Phones label photos in ways the vision API refuses (HEIC and
                # friends), so the picture always goes out re-encoded as JPEG.
                by_ai = ai_invoice(ai_jpeg(decode_image(data)), "image/jpeg")
            elif content_type == "application/pdf":
                page = pdf_images(data)[:1]
                by_ai = ai_invoice(ai_jpeg(page[0]), "image/jpeg") if page else None
            else:
                by_ai = None

            if by_ai:
                return {"success": True, "extracted_data": by_ai}
        except Exception as exc:
            print("AI reader unavailable, using Tesseract:", content_type, str(exc)[:200])

        if (
            content_type ==
            "application/pdf"
        ):
            pages = pdf_images(
                data
            )

            if not pages:
                raise ValueError(
                    "No readable PDF pages"
                )

            text = "\n\n".join(
                run_ocr(page)
                for page in pages
            )

        elif content_type in (
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ):
            text = run_ocr(
                decode_image(data)
            )

        else:
            raise HTTPException(
                400,
                "Only JPG, PNG, WebP or PDF is supported"
            )

        extracted = parse_invoice(
            text
        )
        extracted["read_by"] = "tesseract"

        return {
            "success": True,
            "extracted_data":
                extracted
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            422,
            f"OCR failed: {exc}"
        )


@app.post("/optimize")
async def optimize(
    file: UploadFile = File(...),
    kind: str = Query(
        "product",
        pattern="^(product|bill)$"
    )
):
    data = await file.read()

    if not data:
        raise HTTPException(
            400,
            "Empty file"
        )

    if len(data) > MAX_UPLOAD:
        raise HTTPException(
            413,
            "Maximum file size is 10MB"
        )

    content_type = (
        file.content_type or ""
    ).lower()

    if content_type == "application/pdf":
        return Response(
            content=data,
            media_type="application/pdf",
            headers={
                "X-Original-Bytes":
                    str(len(data)),

                "X-Optimized-Bytes":
                    str(len(data))
            }
        )

    if content_type not in (
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp"
    ):
        raise HTTPException(
            400,
            "Unsupported image type"
        )

    try:
        output = optimize_webp(
            data,
            kind
        )

        return Response(
            content=output,
            media_type="image/webp",
            headers={
                "X-Original-Bytes":
                    str(len(data)),

                "X-Optimized-Bytes":
                    str(len(output))
            }
        )

    except Exception as exc:
        raise HTTPException(
            422,
            f"Image optimization failed: {exc}"
        )


# ============================================================
# PARSER V2 OVERRIDES
# Better invoice/accounting extraction.
# These definitions override the earlier parser functions.
# ============================================================

def _buyer_start(text):
    match = re.search(
        r"(?im)^\s*buyer\b",
        text
    )

    if not match:
        match = re.search(
            r"(?i)buyer\s*(?:\(|bill\s*to|:)",
            text
        )

    return (
        match.start()
        if match
        else len(text)
    )


# Our own GSTIN is always the buyer on purchase bills, never the vendor.
OWN_GSTIN = os.getenv("OWN_GSTIN", "37ATTPK6588R1Z6").upper()

GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Position types of a GSTIN: 2 digits, 5 letters, 4 digits, letter, alnum, 'Z', check.
GST_KINDS = "DDLLLLLDDDDLAZA"

TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "G": "6", "B": "8"}
TO_LETTER = {v: k for k, v in TO_DIGIT.items() if k not in "DQL"}
LOOKALIKE = {"I": "JLT", "J": "I", "L": "I", "T": "I", "O": "DQ", "D": "O", "Q": "O",
             "P": "R", "R": "P", "U": "V", "V": "UY", "Y": "V", "M": "N", "N": "M",
             "C": "G", "G": "C", "E": "F", "F": "E"}


def gst_check_char(first14):
    total = 0
    for i, ch in enumerate(first14):
        product = GST_CHARS.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return GST_CHARS[(36 - total % 36) % 36]


def gst_valid(value):
    return (
        len(value) == 15
        and all(ch in GST_CHARS for ch in value)
        and gst_check_char(value[:14]) == value[14]
    )


def fix_gstin(token):
    """Snap OCR look-alikes to each GSTIN position, then repair one wrong letter
    using the check character. Returns a checksum-valid GSTIN or None."""
    token = token.upper()
    if len(token) != 15:
        return None

    chars = []
    for kind, ch in zip(GST_KINDS, token):
        if kind == "D":
            ch = TO_DIGIT.get(ch, ch)
        elif kind == "L":
            ch = TO_LETTER.get(ch, ch)
        elif kind == "Z":
            ch = "Z"
        chars.append(ch)

    value = "".join(chars)
    if not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]", value):
        return None
    if gst_valid(value):
        return value

    for i, kind in enumerate(GST_KINDS[:14]):
        if kind not in "LA":
            continue
        for alt in LOOKALIKE.get(value[i], ""):
            candidate = value[:i] + alt + value[i + 1:]
            if gst_valid(candidate):
                return candidate

    return None


def find_vendor_gstin(text):
    # Seller/header area first; our own GSTIN (the buyer) is never the vendor.
    upper = text.upper()
    header = upper[:_buyer_start(text)]

    for area in (header, upper):
        for token in re.findall(r"\b\d{2}[A-Z0-9]{13}\b", area):
            fixed = fix_gstin(token)
            if fixed and fixed != OWN_GSTIN:
                return fixed

    return None


def find_vendor_name(lines):
    text = "\n".join(lines)
    header = text[:_buyer_start(text)]

    business_words = (
        "TEXTILE",
        "TEXTILES",
        "SAREE",
        "SAREES",
        "SILK",
        "SILKS",
        "FABRIC",
        "FABRICS",
        "TRADERS",
        "ENTERPRISES",
        "STORES"
    )

    for line in header.splitlines():
        candidate = re.sub(
            r"\s+",
            " ",
            line
        ).strip(" ,|-")

        if len(candidate) < 5:
            continue

        upper = candidate.upper()

        for word in business_words:
            match = re.search(
                rf"^(.*?\b{word}\b)",
                upper
            )

            if match:
                name = candidate[:match.end(1)].split()
                # Drop OCR noise before an all-caps name ("Se ANNAPURNA SAREES").
                while len(name) > 1 and not name[0].isupper():
                    name.pop(0)
                return " ".join(name).upper()

    return None


def _invoice_candidates(segment):
    results = []

    pattern = re.compile(
        r"\b"
        r"[A-Z]{2,}[A-Z0-9]*"
        r"(?:[/\-][A-Z0-9]+){1,5}"
        r"\b",
        re.I
    )

    for match in pattern.finditer(segment):
        value = match.group(0).upper()

        if len(value) > 35:
            continue

        if not any(
            ch.isdigit()
            for ch in value
        ):
            continue

        if GSTIN.fullmatch(value):
            continue

        results.append(value)

    return results


def find_bill_number(text):
    # Value printed right after "Invoice No" / "Bill No" ("Invoice No, : 1805").
    direct = re.search(
        r"(?i)\b(?:invoice|bill)\s*(?:no|number)\b[\s.,:;#]*([A-Z0-9][A-Z0-9/\-]{0,30})",
        text
    )

    if direct:
        value = direct.group(1).upper()
        if (
            any(ch.isdigit() for ch in value)
            and not parse_date_value(value)
            and not GSTIN.fullmatch(value)
        ):
            return value

    # Otherwise inspect the text following any "Invoice" label.
    invoice_labels = list(
        re.finditer(
            r"(?i)invoice\s*(?:no|wo|number)?",
            text
        )
    )

    for label in invoice_labels:
        segment = text[
            label.end():
            label.end() + 300
        ]

        candidates = _invoice_candidates(
            segment
        )

        if candidates:
            # Prefer invoice-like value with slash.
            candidates.sort(
                key=lambda value: (
                    "/" not in value,
                    len(value)
                )
            )

            return candidates[0]

    # Fallback to Bill No.
    bill_labels = list(
        re.finditer(
            r"(?i)bill\s*(?:no|number)",
            text
        )
    )

    for label in bill_labels:
        candidates = _invoice_candidates(
            text[
                label.end():
                label.end() + 200
            ]
        )

        if candidates:
            return candidates[0]

    return None


def find_items(lines):
    items = []
    seen = set()

    for line in lines:
        # Require:
        # HSN -> quantity + unit -> rate -> amount
        hsn_match = re.search(
            r"\b(?P<hsn>\d{4,8})\b",
            line
        )

        if not hsn_match:
            continue

        tail = line[
            hsn_match.end():
        ]

        # Numbers after the HSN, skipping percentages. The last one is the
        # line amount; a product row has a whole-number quantity and a rate
        # with quantity × rate ≈ amount, with or without a "NOS"/"PCS" unit
        # ("40 NO'S 650.00 26,000.00" and "24 6.30 151.20 380.00 P 9120.00").
        # A photographed bill often loses the decimal point: "421 00" is 421.00 and
        # "18120," is 18120. Join a bare 2-digit group back onto the number before it.
        tail = re.sub(r"(\d)\s+(\d{2})(?!\s*[.,]?\d)", r".", tail)
        numbers = [
            m.group(0).rstrip(",.")
            for m in re.finditer(r"\d[\d,]*(?:\.\d+)?(?!\s*%)", tail)
        ]

        if len(numbers) < 3:
            continue

        # Rate and amount are printed in rupees and paise ("650.00"), which
        # keeps stray numbers (phone, email, UDYAM ids) out of the items.
        # No paise requirement: OCR drops decimals. The qty x rate = amount check
        # below is what keeps phone numbers and ids out of the item list.
        amount = money(numbers[-1]) or 0
        if amount < 50:
            continue
        found = None

        for qi, q in enumerate(numbers[:-2]):
            if "." in q or "," in q or len(q) > 4 or int(q) <= 0:
                continue
            for r in numbers[qi + 1:-1]:
                rate_value = money(r) or 0
                if rate_value > 0 and abs(int(q) * rate_value - amount) <= max(5, amount * 0.02):
                    found = (int(q), rate_value)
                    break
            if found:
                break

        if not found or amount <= 0:
            continue

        quantity, rate = found

        description = line[
            :hsn_match.start()
        ].strip(" |:-")

        description = re.sub(
            r"^[^A-Za-z\u0C00-\u0C7F]+",
            "",
            description
        )

        # Remove isolated OCR garbage such as "y IENNI..."
        description = re.sub(
            r"^[A-Za-z]\s+(?=[A-Z])",
            "",
            description
        )

        description = re.sub(
            r"\s+",
            " ",
            description
        ).strip()

        key = (
            hsn_match.group("hsn"),
            quantity,
            round(rate, 2),
            round(amount, 2)
        )

        if key in seen:
            continue

        seen.add(key)

        items.append({
            "saree_name":
                description[:150]
                if description else None,

            "material": None,

            "quantity": quantity,

            "cost_price":
                round(rate, 2),

            "hsn_code":
                hsn_match.group("hsn"),

            "line_amount":
                round(amount, 2)
        })

    return items


def _find_tax_summary(lines):
    # Example:
    # 540730 24,820.00 2.50% 620.50 2.50% 620.50 1,241.00

    pattern = re.compile(
        r"\b(?P<hsn>\d{4,8})\b"
        r"\s+"
        r"(?P<taxable>\d[\d,]*\.\d{2})"
        r".*?"
        r"(?P<rate1>\d+(?:\.\d+)?)\s*%"
        r".*?"
        r"(?P<tax1>\d[\d,]*\.\d{2})"
        r".*?"
        r"(?P<rate2>\d+(?:\.\d+)?)\s*%"
        r".*?"
        r"(?P<tax2>\d[\d,]*\.\d{2})"
        r".*?"
        r"(?P<tax_total>\d[\d,]*\.\d{2})",
        re.I
    )

    for line in lines:
        match = pattern.search(line)

        if not match:
            continue

        return {
            "taxable_value":
                money(match.group("taxable")) or 0,

            "cgst_rate":
                money(match.group("rate1")) or 0,

            "cgst_amount":
                money(match.group("tax1")) or 0,

            "sgst_rate":
                money(match.group("rate2")) or 0,

            "sgst_amount":
                money(match.group("tax2")) or 0,

            "tax_total":
                money(match.group("tax_total")) or 0
        }

    return None


def _find_tax(lines, keys):
    # (rate, amount) for a tax line such as "IGST 5.00% 948.00". The "5.00%"
    # is the rate, never the amount; when the amount was OCR'd onto the next
    # line ("IGST 5.00%" / "948.00") it is taken from there.
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i]
        if not any(key in line.lower() for key in keys):
            continue

        rate = re.search(r"(\d+(?:\.\d+)?)\s*%", line)
        amounts = [
            money(m.group(0))
            for m in re.finditer(r"\d[\d,]*\.\d{2}(?!\s*%)", line)
        ]
        amounts = [a for a in amounts if a]

        if not amounts and i + 1 < len(lines) and not re.search(r"[A-Za-z]", lines[i + 1]):
            amounts = [a for a in first_money(lines[i + 1]) if a > 0]

        if amounts:
            return (
                money(rate.group(1)) if rate else None,
                abs(amounts[-1])
            )

    return None, 0


def _find_total_candidates(lines):
    candidates = []

    for line in lines:
        lower = line.lower()

        if "total" not in lower:
            continue

        values = first_money(
            line
        )

        for value in values:
            value = abs(value)

            if value >= 100:
                candidates.append(
                    value
                )

    return candidates


def parse_invoice(text):
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    items = find_items(
        lines
    )

    subtotal = (
        round(
            sum(
                item["line_amount"]
                for item in items
            ),
            2
        )
        if items
        else 0
    )

    discount_amount = (
        find_discount(lines)
        or 0
    )

    packing_charges = (
        find_value_near(
            lines,
            (
                "packing charges",
                "packing charge",
                "packing"
            )
        )
        or 0
    )

    tax_summary = _find_tax_summary(
        lines
    )

    if tax_summary:
        taxable_value = tax_summary[
            "taxable_value"
        ]

        cgst_amount = tax_summary[
            "cgst_amount"
        ]

        sgst_amount = tax_summary[
            "sgst_amount"
        ]

        igst_amount = 0

        cgst_rate = tax_summary[
            "cgst_rate"
        ]

        sgst_rate = tax_summary[
            "sgst_rate"
        ]

        igst_rate = 0

    else:
        taxable_value = (
            find_value_near(
                lines,
                (
                    "taxable value",
                    "taxable"
                )
            )
            or 0
        )

        cgst_rate, cgst_amount = _find_tax(lines, ("cgst",))
        sgst_rate, sgst_amount = _find_tax(lines, ("sgst", "utgst"))
        igst_rate, igst_amount = _find_tax(lines, ("igst",))

        cgst_rate = (cgst_rate or 2.5) if cgst_amount > 0 else 0
        sgst_rate = (sgst_rate or 2.5) if sgst_amount > 0 else 0
        igst_rate = (igst_rate or 5.0) if igst_amount > 0 else 0

    gst_amount = round(
        cgst_amount +
        sgst_amount +
        igst_amount,
        2
    )

    # If taxable value wasn't OCR'd but accounting components exist,
    # derive it safely.
    if (
        taxable_value <= 0
        and subtotal > 0
    ):
        taxable_value = round(
            subtotal
            - discount_amount
            + packing_charges,
            2
        )

    expected_total = 0

    if taxable_value > 0:
        expected_total = round(
            taxable_value +
            gst_amount,
            2
        )

    elif subtotal > 0:
        expected_total = round(
            subtotal
            - discount_amount
            + packing_charges
            + gst_amount,
            2
        )

    total_candidates = (
        _find_total_candidates(lines)
    )

    total_amount = expected_total

    if expected_total > 0:
        # Accounting components are more reliable than an OCR-read
        # printed grand total. Example:
        # taxable_value + CGST + SGST + IGST.
        total_amount = expected_total

    elif total_candidates:
        total_amount = max(
            total_candidates
        )

    # A smudged totals box reads as nonsense ("3932765.40" on a 39,308 bill). Trust the
    # rows instead when the printed total is nowhere near items - discount + packing.
    if subtotal > 0:
        sane = subtotal - discount_amount + packing_charges
        if total_amount > sane * 3 or (taxable_value > sane * 3):
            taxable_value = round(sane, 2)
            gst_amount = round(taxable_value * (cgst_rate + sgst_rate + igst_rate) / 100, 2)
            cgst_amount = round(taxable_value * cgst_rate / 100, 2)
            sgst_amount = round(taxable_value * sgst_rate / 100, 2)
            igst_amount = round(taxable_value * igst_rate / 100, 2)
            total_amount = round(taxable_value + gst_amount, 2)

    is_local_transaction = None

    if (
        cgst_amount > 0
        or sgst_amount > 0
    ):
        is_local_transaction = True

    elif igst_amount > 0:
        is_local_transaction = False

    warnings = []

    vendor_gst = find_vendor_gstin(
        text
    )

    if not vendor_gst:
        warnings.append(
            "Seller GSTIN was not confidently detected. Buyer GSTIN was intentionally ignored."
        )

    return {
        "company_name":
            find_vendor_name(lines),

        "vendor_gst_number":
            vendor_gst,

        "bill_number":
            find_bill_number(text),

        "bill_date":
            find_bill_date(text),

        "is_local_transaction":
            is_local_transaction,

        "subtotal":
            round(subtotal, 2),

        "discount_amount":
            round(
                discount_amount,
                2
            ),

        "packing_charges":
            round(
                packing_charges,
                2
            ),

        "taxable_value":
            round(
                taxable_value,
                2
            ),

        "cgst_rate":
            cgst_rate,

        "sgst_rate":
            sgst_rate,

        "igst_rate":
            igst_rate,

        "cgst_amount":
            round(
                cgst_amount,
                2
            ),

        "sgst_amount":
            round(
                sgst_amount,
                2
            ),

        "igst_amount":
            round(
                igst_amount,
                2
            ),

        "gst_amount":
            round(
                gst_amount,
                2
            ),

        "total_amount":
            round(
                total_amount,
                2
            ),

        "items":
            items,

        "ocr_warnings":
            warnings,

        "raw_text":
            text
    }

