#! analysis_worker/extract_invoice_image.py

#!/usr/bin/env python3

import argparse
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps
import pytesseract


METHOD_CODE = "invoice_image_worker_v1"
METHOD_VERSION = "2026-03-31-standalone-v1"


def clean_line(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_compare(value: str) -> str:
    return clean_line(value).lower()


def normalize_compact(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def normalize_postcode(value: str) -> str:
    return normalize_compact(value)


def normalize_serial(value: str) -> str:
    return normalize_compact(value)


def normalize_mid(value: str) -> str:
    compact = normalize_compact(value)
    compact = compact.replace("O", "0")
    compact = compact.replace("I", "1")
    compact = compact.replace("L", "1")
    return compact


def split_dutch_street_line(value: str) -> dict:
    s = clean_line(value)
    if not s:
        return {"street": None, "house_number": None, "suffix": None}

    match = re.match(r"^(.*?)[\s]+(\d+)(?:[-\s]*([A-Za-z0-9]+))?$", s)
    if not match:
        return {"street": s or None, "house_number": None, "suffix": None}

    return {
        "street": clean_line(match.group(1)) or None,
        "house_number": match.group(2) or None,
        "suffix": clean_line(match.group(3)) if match.group(3) else None,
    }


def split_dutch_city_line(value: str) -> dict:
    s = clean_line(value)
    if not s:
        return {"postcode": None, "city": None}

    match = re.search(r"(\d{4}\s?[A-Za-z]{2})\s+(.+)$", s)
    if not match:
        return {"postcode": None, "city": s or None}

    return {
        "postcode": normalize_postcode(match.group(1)),
        "city": clean_line(match.group(2)) or None,
    }


def looks_like_name_line(value: str) -> bool:
    s = clean_line(value)
    if not s:
        return False
    if len(s) < 4 or len(s) > 120:
        return False
    if re.search(r"\d", s):
        return False

    banned = [
        "invoice",
        "factuur",
        "bill to",
        "customer",
        "address",
        "city",
        "brand",
        "model",
        "serial",
        "mid",
        "product",
        "amount",
        "description",
        "subtotal",
        "total",
        "vat",
        "invoice no",
        "invoice date",
        "payment terms",
        "device identification",
        "charging system details",
        "service address",
    ]
    lowered = s.lower()
    return not any(x in lowered for x in banned)


def looks_like_street_line(value: str) -> bool:
    s = clean_line(value)
    if not s or not re.search(r"\d", s):
        return False

    banned = [
        "invoice no",
        "invoice date",
        "customer ref",
        "project ref",
        "serial",
        "mid",
        "vat",
        "total",
        "amount",
        "qty",
        "unit price",
        "rate",
    ]
    lowered = s.lower()
    if any(x in lowered for x in banned):
        return False

    split = split_dutch_street_line(s)
    return bool(split["street"] and split["house_number"])


def looks_like_city_line(value: str) -> bool:
    split = split_dutch_city_line(value)
    return bool(split["postcode"] and split["city"])


def looks_like_country_line(value: str) -> bool:
    s = clean_line(value).lower()
    return s in {
        "netherlands",
        "nederland",
        "the netherlands",
        "belgium",
        "belgie",
        "belgië",
        "germany",
        "deutschland",
    }


def collect_address_block_candidates(text: str) -> list[dict]:
    lines = [clean_line(x) for x in text.replace("\r", "\n").split("\n")]
    lines = [x for x in lines if x]

    candidates = []

    for index, line in enumerate(lines):
        if not looks_like_street_line(line):
            continue

        for j in range(index + 1, min(index + 4, len(lines))):
            maybe_city = lines[j]
            if not looks_like_city_line(maybe_city):
                continue

            prev1 = lines[index - 1] if index - 1 >= 0 else None
            prev2 = lines[index - 2] if index - 2 >= 0 else None
            next1 = lines[j + 1] if j + 1 < len(lines) else None

            score = 5
            name_line = None

            if prev1 and looks_like_name_line(prev1):
                name_line = prev1
                score += 3
            elif prev2 and looks_like_name_line(prev2):
                name_line = prev2
                score += 2

            if next1 and looks_like_country_line(next1):
                score += 1

            candidates.append(
                {
                    "score": score,
                    "name_line": name_line,
                    "address_line": line,
                    "city_line": maybe_city,
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


def match_labeled_value(text: str, labels: list[str]) -> str | None:
    lines = [clean_line(x) for x in text.replace("\r", "\n").split("\n")]
    lines = [x for x in lines if x]

    for i, line in enumerate(lines):
        for label in labels:
            pattern = re.compile(rf"^{re.escape(label)}\s*[:#-]?\s*(.*)$", re.IGNORECASE)
            match = pattern.match(line)
            if not match:
                continue

            value = clean_line(match.group(1))
            if value:
                return value

            for j in range(i + 1, min(i + 3, len(lines))):
                candidate = clean_line(lines[j])
                if candidate:
                    return candidate

    return None


def extract_lines(text: str) -> list[str]:
    return [clean_line(x) for x in text.replace("\r", "\n").split("\n") if clean_line(x)]


def looks_like_brand_value(value: str) -> bool:
    s = clean_line(value)
    if not s or len(s) < 2 or len(s) > 60:
        return False
    if re.search(r"\d{4,}", s):
        return False
    return bool(re.search(r"[A-Za-z]", s))


def looks_like_model_value(value: str) -> bool:
    s = clean_line(value)
    if not s or len(s) < 2 or len(s) > 80:
        return False
    return bool(re.search(r"[A-Za-z0-9]", s))


def looks_like_mid_value(value: str) -> bool:
    compact = normalize_mid(value)
    if not compact:
        return False
    if len(compact) < 6 or len(compact) > 30:
        return False
    return bool(
        compact.startswith("MID")
        or re.match(r"^M\d{6,}$", compact)
        or re.match(r"^\d{6,}$", compact)
    )


def looks_like_serial_value(value: str) -> bool:
    s = clean_line(value)
    compact = normalize_serial(s)

    if not s or not compact:
        return False
    if len(compact) < 6 or len(compact) > 40:
        return False
    if compact.startswith("MID"):
        return False
    if not re.search(r"\d", compact):
        return False

    lowered = s.lower()
    garbage = {
        "serial",
        "serial number",
        "serial no",
        "serial no.",
        "serial nr",
        "serial nr.",
        "serienummer",
        "number",
        "nummer",
        "nr",
        "nr.",
        "no",
        "no.",
        "sn",
        "s/n",
    }
    if lowered in garbage:
        return False

    return True


def extract_field_near_label(lines: list[str], labels: list[str], validator) -> str | None:
    for i, line in enumerate(lines):
        for label in labels:
            pattern = re.compile(rf"^{re.escape(label)}\s*[:#-]?\s*(.*)$", re.IGNORECASE)
            match = pattern.match(line)
            if not match:
                continue

            value = clean_line(match.group(1))
            if value and validator(value):
                return value

            for j in range(i + 1, min(i + 3, len(lines))):
                candidate = clean_line(lines[j])
                if candidate and validator(candidate):
                    return candidate

    return None


def find_mid_candidate(lines: list[str]) -> str | None:
    labels = [
        "MID number",
        "MID Number",
        "MID nummer",
        "MID-nummer",
        "MID nr",
        "MID nr.",
        "MID no",
        "MID no.",
        "MID",
    ]

    candidate = extract_field_near_label(lines, labels, looks_like_mid_value)
    if candidate:
        return candidate

    joined = "\n".join(lines)
    regexes = [
        re.compile(r"\b(MID[A-Z0-9]{4,})\b", re.IGNORECASE),
        re.compile(r"\b(M\d{6,})\b", re.IGNORECASE),
        re.compile(r"\b(\d{8,})\b"),
    ]

    found = []
    for regex in regexes:
        for match in regex.finditer(joined):
            raw = match.group(1)
            if looks_like_mid_value(raw):
                found.append(raw)

    if not found:
        return None

    found.sort(key=lambda value: (0 if normalize_mid(value).startswith("MID") else 1, -len(normalize_mid(value))))
    return found[0]


def find_serial_candidate(lines: list[str], reject_mid_value: str | None) -> str | None:
    labels = [
        "Charger serial number",
        "Serial number",
        "Serial Number",
        "Serial no",
        "Serial no.",
        "Serial nr",
        "Serial nr.",
        "Serienummer",
        "S/N",
        "SN",
        "Serial",
    ]

    reject_mid_compact = normalize_mid(reject_mid_value)

    candidate = extract_field_near_label(lines, labels, looks_like_serial_value)
    if candidate:
        if normalize_serial(candidate) != reject_mid_compact:
            return candidate

    joined = "\n".join(lines)
    regexes = [
        re.compile(r"\b(\d{8,})\b"),
        re.compile(r"\b(SN[A-Z0-9]{5,})\b", re.IGNORECASE),
    ]

    found = []
    for regex in regexes:
        for match in regex.finditer(joined):
            raw = match.group(1)
            if not looks_like_serial_value(raw):
                continue
            if normalize_serial(raw) == reject_mid_compact:
                continue
            found.append(raw)

    if not found:
        return None

    found.sort(key=lambda value: -len(normalize_serial(value)))
    return found[0]


def select_best_address_block(address_text: str, full_text: str) -> tuple[str | None, str | None, list[str]]:
    limitations = []

    labeled_address = match_labeled_value(address_text, ["Address", "Adres", "Service address", "Bill to"])
    labeled_city = match_labeled_value(address_text, ["City", "Plaats", "Postcode en plaats"])

    if labeled_address and labeled_city:
        return labeled_address, labeled_city, limitations

    candidates = collect_address_block_candidates(address_text)
    if not candidates:
        candidates = collect_address_block_candidates(full_text)

    if not candidates:
        return None, None, ["address_block_not_found"]

    best = candidates[0]
    limitations.append("address_block_inferred_from_layout")
    return best["address_line"], best["city_line"], limitations


def run_tesseract_on_image(image: Image.Image, config: str) -> str:
    return pytesseract.image_to_string(image, lang="eng", config=config)


def build_variants(image: Image.Image) -> dict[str, Image.Image]:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)

    variants = {
        "gray": gray,
        "gray_2x": gray.resize((gray.width * 2, gray.height * 2)),
        "gray_3x": gray.resize((gray.width * 3, gray.height * 3)),
    }

    variants["sharp_2x"] = variants["gray_2x"].filter(ImageFilter.SHARPEN)
    variants["thresh_2x"] = variants["gray_2x"].point(lambda p: 255 if p > 180 else 0)
    return variants


def score_text(text: str) -> int:
    if not text:
        return 0

    patterns = [
        r"\b\d{4}\s?[A-Z]{2}\b",
        r"\bM\d{6,}\b",
        r"\b\d{8,}\b",
        r"invoice",
        r"brand",
        r"model",
        r"serial",
        r"mid",
        r"total",
    ]

    score = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in patterns)
    score += min(len(text) // 150, 30)
    return score


def pick_best_text_from_region(image: Image.Image, region_name: str) -> dict:
    variants = build_variants(image)
    attempts = []

    configs = {
        "page": ["--oem 3 --psm 11", "--oem 3 --psm 6"],
        "address": ["--oem 3 --psm 6", "--oem 3 --psm 11"],
        "device": ["--oem 3 --psm 11", "--oem 3 --psm 6"],
    }

    for variant_name, variant_img in variants.items():
        for config in configs[region_name]:
            text = run_tesseract_on_image(variant_img, config)
            attempts.append(
                {
                    "variant": variant_name,
                    "config": config,
                    "text": text,
                    "score": score_text(text),
                }
            )

    attempts.sort(key=lambda item: item["score"], reverse=True)
    best = attempts[0] if attempts else {"variant": None, "config": None, "text": "", "score": 0}

    return {
        "best_text": best["text"],
        "best_variant": best["variant"],
        "best_config": best["config"],
        "best_score": best["score"],
        "attempts": [
            {
                "variant": item["variant"],
                "config": item["config"],
                "score": item["score"],
            }
            for item in attempts
        ],
    }


def image_region_crops(image: Image.Image) -> dict[str, Image.Image]:
    width, height = image.size

    return {
        "page": image,
        "address": image.crop((0, int(height * 0.08), int(width * 0.50), int(height * 0.38))),
        "device": image.crop((int(width * 0.50), int(height * 0.08), int(width * 0.98), int(height * 0.38))),
    }


def extract_invoice_observed_fields(page_text: str, address_text: str, device_text: str) -> tuple[dict, dict, list[str]]:
    limitations = []

    address_line, city_line, address_limitations = select_best_address_block(address_text, page_text)
    limitations.extend(address_limitations)

    street_parts = split_dutch_street_line(address_line or "")
    city_parts = split_dutch_city_line(city_line or "")

    device_lines = extract_lines(device_text)
    page_lines = extract_lines(page_text)

    brand = (
        extract_field_near_label(device_lines, ["Brand", "Merk"], looks_like_brand_value)
        or extract_field_near_label(page_lines, ["Brand", "Merk"], looks_like_brand_value)
    )

    model = (
        extract_field_near_label(device_lines, ["Model", "Type"], looks_like_model_value)
        or extract_field_near_label(page_lines, ["Model", "Type"], looks_like_model_value)
    )

    mid_number = find_mid_candidate(device_lines) or find_mid_candidate(page_lines)
    serial_number = find_serial_candidate(device_lines, mid_number) or find_serial_candidate(page_lines, mid_number)

    observed_fields = {
        "address_line": address_line,
        "city_line": city_line,
        "street": street_parts["street"],
        "house_number": street_parts["house_number"],
        "suffix": street_parts["suffix"],
        "postcode": city_parts["postcode"],
        "city": city_parts["city"],
        "brand": brand,
        "model": model,
        "serial_number": serial_number,
        "mid_number": mid_number,
    }

    confidence = {
        "ocr_text_quality": "low",
        "field_quality": "low",
        "has_address": bool(observed_fields["street"] and observed_fields["house_number"] and observed_fields["postcode"] and observed_fields["city"]),
        "has_brand": bool(observed_fields["brand"]),
        "has_model": bool(observed_fields["model"]),
        "has_serial": bool(observed_fields["serial_number"]),
        "has_mid": bool(observed_fields["mid_number"]),
    }

    filled_count = sum(
        1
        for key in ["street", "house_number", "postcode", "city", "brand", "model", "serial_number", "mid_number"]
        if observed_fields.get(key)
    )

    if filled_count >= 7:
        confidence["ocr_text_quality"] = "high"
        confidence["field_quality"] = "high"
    elif filled_count >= 5:
        confidence["ocr_text_quality"] = "medium"
        confidence["field_quality"] = "medium"
    elif filled_count >= 3:
        confidence["ocr_text_quality"] = "medium"
        confidence["field_quality"] = "low"

    if not observed_fields["address_line"] or not observed_fields["city_line"]:
        limitations.append("address_text_not_confident")
    if not observed_fields["brand"]:
        limitations.append("brand_not_found")
    if not observed_fields["model"]:
        limitations.append("model_not_found")
    if not observed_fields["serial_number"]:
        limitations.append("serial_number_not_found")
    if not observed_fields["mid_number"]:
        limitations.append("mid_number_not_found")

    limitations = list(dict.fromkeys(limitations))

    return observed_fields, confidence, limitations


def image_meta(path: Path, image: Image.Image) -> dict:
    mime_type, _ = mimetypes.guess_type(str(path))
    image_format = str(image.format or "").lower()

    if image_format == "jpeg":
        image_kind = "jpeg"
    elif image_format == "png":
        image_kind = "png"
    else:
        image_kind = image_format or "unknown"

    return {
        "mime_type": mime_type,
        "byte_length": path.stat().st_size,
        "image_kind": image_kind,
        "width": image.size[0],
        "height": image.size[1],
    }


def assert_local_ocr_runtime() -> None:
    if not shutil.which("tesseract"):
        raise RuntimeError("Local tesseract binary not found in PATH.")

    try:
        subprocess.run(
            ["tesseract", "--version"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:
        raise RuntimeError(f"Local tesseract runtime check failed: {exc}") from exc


def extract_invoice_image(path: Path) -> dict:
    assert_local_ocr_runtime()

    image = Image.open(path)
    regions = image_region_crops(image)

    page_ocr = pick_best_text_from_region(regions["page"], "page")
    address_ocr = pick_best_text_from_region(regions["address"], "address")
    device_ocr = pick_best_text_from_region(regions["device"], "device")

    page_text = page_ocr["best_text"] or ""
    address_text = address_ocr["best_text"] or ""
    device_text = device_ocr["best_text"] or ""

    observed_fields, confidence, limitations = extract_invoice_observed_fields(
        page_text=page_text,
        address_text=address_text,
        device_text=device_text,
    )

    extracted_text_parts = [
        "=== PAGE OCR ===",
        page_text.strip(),
        "",
        "=== ADDRESS OCR ===",
        address_text.strip(),
        "",
        "=== DEVICE OCR ===",
        device_text.strip(),
    ]
    extracted_text = "\n".join(extracted_text_parts).strip()

    meta = image_meta(path, image)

    summary = {
        "mode": "standalone_invoice_image_extract",
        "reason": "ok" if extracted_text.strip() else "no_text_extracted",
        "filename": path.name,
        "extraction_source": "local_tesseract",
        "content_type": meta["mime_type"],
        "image_kind": meta["image_kind"],
        "width": meta["width"],
        "height": meta["height"],
        "byte_length": meta["byte_length"],
        "page_ocr_variant": page_ocr["best_variant"],
        "page_ocr_config": page_ocr["best_config"],
        "address_ocr_variant": address_ocr["best_variant"],
        "address_ocr_config": address_ocr["best_config"],
        "device_ocr_variant": device_ocr["best_variant"],
        "device_ocr_config": device_ocr["best_config"],
    }

    return {
        "ok": True,
        "method_code": METHOD_CODE,
        "method_version": METHOD_VERSION,
        "input_file": str(path),
        "extracted_text": extracted_text,
        "observed_fields": observed_fields,
        "confidence": confidence,
        "limitations": limitations,
        "summary": summary,
        "debug": {
            "page_region": {
                "best_score": page_ocr["best_score"],
                "attempts": page_ocr["attempts"],
            },
            "address_region": {
                "best_score": address_ocr["best_score"],
                "attempts": address_ocr["attempts"],
            },
            "device_region": {
                "best_score": device_ocr["best_score"],
                "attempts": device_ocr["attempts"],
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Standalone invoice-image extraction worker.")
    parser.add_argument("--input", required=True, help="Absolute or repo-relative path to invoice image.")
    parser.add_argument("--output", help="Optional output JSON file path.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"FATAL: input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        result = extract_invoice_image(input_path)
    except Exception as exc:
        error_payload = {
            "ok": False,
            "method_code": METHOD_CODE,
            "method_version": METHOD_VERSION,
            "input_file": str(input_path),
            "error": str(exc),
        }
        if args.output:
            output_path = Path(args.output).expanduser().resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(error_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(error_payload, ensure_ascii=False, indent=2))
        return 2

    payload = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload, encoding="utf-8")

    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())