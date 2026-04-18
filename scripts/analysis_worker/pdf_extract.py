#! /Users/daankoote/dev/enval/scripts/analysis_worker/pdf_extract.py

#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# Reuse the proven text->fields parser from the image lane.
from ocr_extract import extract_invoice_observed_fields_from_text


# ============================================================
# PDF text extraction helpers (local mirror of edge approach)
# ============================================================

def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def bytes_to_latin1(data: bytes) -> str:
    return data.decode("latin-1", errors="ignore")


def extract_pdf_streams(raw: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    pattern = re.compile(r"<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream", re.S)

    for match in pattern.finditer(raw):
        out.append({
            "dict": match.group(1) or "",
            "body": match.group(2) or "",
        })

    return out


def ascii85_decode(input_raw: str) -> bytes:
    s = str(input_raw or "")
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"^<~", "", s)
    s = re.sub(r"~>$", "", s)

    try:
        return base64.a85decode(s, adobe=False)
    except Exception:
        try:
            return base64.a85decode(s, adobe=True)
        except Exception:
            return b""


def flate_decode(data: bytes) -> bytes:
    if not data:
        return b""

    for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
        try:
            return zlib.decompress(data, wbits)
        except Exception:
            pass

    return b""


def extract_literal_strings(pdf_content: str) -> List[str]:
    out: List[str] = []
    i = 0

    while i < len(pdf_content):
        if pdf_content[i] != "(":
            i += 1
            continue

        i += 1
        buf = []
        depth = 1

        while i < len(pdf_content) and depth > 0:
            ch = pdf_content[i]

            if ch == "\\":
                nxt = pdf_content[i + 1] if i + 1 < len(pdf_content) else ""

                if nxt == "n":
                    buf.append("\n")
                    i += 2
                    continue
                if nxt == "r":
                    buf.append("\r")
                    i += 2
                    continue
                if nxt == "t":
                    buf.append("\t")
                    i += 2
                    continue
                if nxt == "b":
                    buf.append("\b")
                    i += 2
                    continue
                if nxt == "f":
                    buf.append("\f")
                    i += 2
                    continue
                if nxt in ("(", ")", "\\"):
                    buf.append(nxt)
                    i += 2
                    continue

                octal_match = re.match(r"[0-7]{1,3}", pdf_content[i + 1:i + 4])
                if octal_match:
                    buf.append(chr(int(octal_match.group(0), 8)))
                    i += 1 + len(octal_match.group(0))
                    continue

                buf.append(nxt)
                i += 2
                continue

            if ch == "(":
                depth += 1
                buf.append(ch)
                i += 1
                continue

            if ch == ")":
                depth -= 1
                if depth == 0:
                    i += 1
                    break
                buf.append(ch)
                i += 1
                continue

            buf.append(ch)
            i += 1

        cleaned = re.sub(r"\s+", " ", "".join(buf)).strip()
        if cleaned:
            out.append(cleaned)

    return out


def normalize_extracted_pdf_text(input_text: str) -> str:
    return (
        str(input_text or "")
        .replace("\r", "\n")
        .replace("\x0c", "\n")
        .replace("\u0000", " ")
        .replace("\xa0", " ")
        .replace("€", "€")
    )


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    raw = bytes_to_latin1(pdf_bytes)
    streams = extract_pdf_streams(raw)

    text_parts: List[str] = []

    for stream in streams:
        dict_text = stream["dict"]
        body = stream["body"]

        has_ascii85 = "/ASCII85Decode" in dict_text
        has_flate = "/FlateDecode" in dict_text

        if not (has_ascii85 and has_flate):
            continue

        ascii85 = ascii85_decode(body)
        inflated = flate_decode(ascii85)
        if not inflated:
            continue

        content = bytes_to_latin1(inflated)
        strings = extract_literal_strings(content)
        if strings:
            text_parts.append("\n".join(strings))

    return normalize_extracted_pdf_text("\n".join(text_parts)).strip()


# ============================================================
# Output contract
# ============================================================

@dataclass
class PDFResult:
    ok: bool
    extracted_text: str
    observed_fields: Dict[str, Optional[str]]
    confidence: Dict[str, Any]
    limitations: List[str]
    summary: Dict[str, Any]


def run_pdf_extract(pdf_path: Path, expected_customer_name: Optional[str] = None) -> PDFResult:
    limitations: List[str] = []

    try:
        pdf_bytes = pdf_path.read_bytes()
    except Exception as exc:
        return PDFResult(
            ok=False,
            extracted_text="",
            observed_fields={},
            confidence={},
            limitations=["pdf_read_failed", "pdf_text_extraction_not_performed"],
            summary={
                "mode": "invoice_pdf_extract_failed",
                "reason": "pdf_read_failed",
                "error": str(exc),
            },
        )

    extracted_text = extract_text_from_pdf_bytes(pdf_bytes)

    if not extracted_text:
        limitations.append("pdf_text_extraction_empty")

    observed_fields = extract_invoice_observed_fields_from_text(
        extracted_text,
        expected_customer_name=expected_customer_name,
    )

    if observed_fields.get("address_block_ambiguous") is True:
        limitations.append("address_block_ambiguous")

    mid_raw = observed_fields.get("mid_candidate_raw")
    if mid_raw and observed_fields.get("mid_number") is None:
        limitations.append("mid_candidate_rejected")

    serial_raw = observed_fields.get("serial_candidate_raw")
    if serial_raw and observed_fields.get("serial_number") is None:
        limitations.append("serial_candidate_rejected")

    observed_non_null = sum(
        1
        for k, v in observed_fields.items()
        if k != "address_block_ambiguous" and v not in (None, "", {})
    )

    confidence = {
        "pdf_text_length": len(extracted_text or ""),
        "observed_non_null_fields": observed_non_null,
    }
    if expected_customer_name:
        confidence["expected_customer_name"] = expected_customer_name

    summary = {
        "mode": "invoice_pdf_extract_local_v1",
        "reason": "local_pdf_text_extract_completed",
        "byte_length": len(pdf_bytes),
        "pdf_text_length": len(extracted_text or ""),
        "observed_non_null_fields": observed_non_null,
    }

    return PDFResult(
        ok=True,
        extracted_text=extracted_text,
        observed_fields=observed_fields,
        confidence=confidence,
        limitations=limitations,
        summary=summary,
    )


def build_output(args: argparse.Namespace, result: PDFResult) -> Dict[str, Any]:
    return {
        "ok": result.ok,
        "worker": {
            "name": "analysis_worker",
            "version": "phase1_local_invoice_pdf_extract_v1",
        },
        "input": {
            "pdf_path": str(args.pdf),
            "doc_type": args.doc_type,
            "document_id": args.document_id,
            "charger_id": args.charger_id,
        },
        "document_analysis": {
            "doc_type": args.doc_type,
            "analysis_kind": "factuur_extract_v1",
            "status": "completed" if result.ok else "failed",
            "method_code": "analysis_worker_local_pdf_v1",
            "method_version": "2026-04-01-phase1",
            "observed_fields": result.observed_fields,
            "confidence": result.confidence,
            "limitations": result.limitations,
            "summary": result.summary,
        },
        "debug": {
            "extracted_text": result.extracted_text,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Standalone Enval invoice PDF text extractor")
    parser.add_argument("--pdf", required=True, type=Path, help="Absolute or relative path to PDF")
    parser.add_argument("--out", required=True, type=Path, help="Output JSON path")
    parser.add_argument("--doc-type", default="factuur", help="Document type")
    parser.add_argument("--document-id", default=None, help="Optional document id for traceability")
    parser.add_argument("--charger-id", default=None, help="Optional charger id for traceability")
    parser.add_argument("--expected-customer-name", default=None, help="Optional expected customer name")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.pdf.exists():
        print(f"ERROR: pdf not found: {args.pdf}", file=sys.stderr)
        return 1

    if args.doc_type != "factuur":
        print(f"ERROR: unsupported doc_type for phase 1: {args.doc_type}", file=sys.stderr)
        return 1

    result = run_pdf_extract(args.pdf, expected_customer_name=args.expected_customer_name)
    payload = build_output(args, result)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"OK: wrote {args.out}")
    print(f"observed_non_null_fields={payload['document_analysis']['confidence'].get('observed_non_null_fields', 0)}")
    print(f"limitations={payload['document_analysis']['limitations']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())