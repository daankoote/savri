#! /Users/daankoote/dev/enval/scripts/analysis_worker/aggregate_invoice_image_multipage.py

#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


LOAD_BEARING_FIELDS = {
    "customer_name",
    "address_line",
    "postcode_line",
    "city_line",
    "serial_number",
    "mid_number",
}

ALL_FIELDS = [
    "customer_name",
    "address_line",
    "postcode_line",
    "city_line",
    "country_line",
    "brand",
    "model",
    "serial_number",
    "serial_candidate_raw",
    "mid_number",
    "mid_candidate_raw",
]


def clean_line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_compact(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper()).strip()


def image_key_from_result(result: Dict[str, Any]) -> str:
    image_path = str(result.get("image_path") or "")
    marker_image = "/docs/facturen/facturen_image/"
    if marker_image in image_path:
        return image_path.split(marker_image, 1)[1]

    marker_generic = "/docs/facturen/"
    if marker_generic in image_path:
        return image_path.split(marker_generic, 1)[1]

    return Path(image_path).name


def split_page_suffix(image_key: str) -> Tuple[str, Optional[int]]:
    m = re.match(r"^(.*)_p(\d{2})\.(jpg|jpeg|png)$", image_key, flags=re.IGNORECASE)
    if not m:
        return image_key, None
    return f"{m.group(1)}.{m.group(3)}", int(m.group(2))


def sort_key_for_page(result: Dict[str, Any]) -> Tuple[int, str]:
    image_key = image_key_from_result(result)
    _doc_key, page_num = split_page_suffix(image_key)
    if page_num is None:
        return (9999, image_key)
    return (page_num, image_key)


def is_non_empty(value: Any) -> bool:
    return value not in (None, "", [])


def field_score(field_name: str, value: Any, page_num: Optional[int], limitations: List[str]) -> int:
    if not is_non_empty(value):
        return -1

    score = 10

    if page_num is not None:
        score += max(0, 10 - page_num)

    if field_name in LOAD_BEARING_FIELDS:
        score += 10

    if field_name in {"serial_number", "mid_number"}:
        score += 10
    elif field_name in {"brand", "model"}:
        score += 6
    elif field_name in {"address_line", "postcode_line", "city_line"}:
        score += 8
    elif field_name == "country_line":
        score += 2

    if "address_block_ambiguous" in limitations and field_name in {"customer_name", "address_line", "postcode_line", "city_line"}:
        score -= 3

    return score


def choose_best_value(
    field_name: str,
    pages: List[Dict[str, Any]],
) -> Tuple[Any, Optional[Dict[str, Any]]]:
    best_value = None
    best_meta = None
    best_score = -10_000

    for page in pages:
        observed = page["observed_fields"]
        limitations = page["limitations"]
        value = observed.get(field_name)
        score = field_score(field_name, value, page["page_num"], limitations)

        if score > best_score:
            best_score = score
            best_value = value
            best_meta = {
                "image_key": page["image_key"],
                "page_num": page["page_num"],
                "score": score,
            }

    if best_score < 0:
        return None, None

    return best_value, best_meta


def choose_best_raw_candidate(
    raw_field_name: str,
    approved_field_name: str,
    pages: List[Dict[str, Any]],
) -> Tuple[Any, Optional[Dict[str, Any]]]:
    best_value = None
    best_meta = None
    best_score = -10_000

    for page in pages:
        observed = page["observed_fields"]
        limitations = page["limitations"]
        approved = observed.get(approved_field_name)
        raw_value = observed.get(raw_field_name)

        if approved is not None and raw_value is not None:
            score = 30
        elif raw_value is not None:
            score = 15
        else:
            score = -1

        if page["page_num"] is not None:
            score += max(0, 10 - page["page_num"])

        if raw_field_name == "mid_candidate_raw" and "mid_candidate_rejected" in limitations:
            score += 3
        if raw_field_name == "serial_candidate_raw" and "serial_candidate_rejected" in limitations:
            score += 3

        if score > best_score:
            best_score = score
            best_value = raw_value
            best_meta = {
                "image_key": page["image_key"],
                "page_num": page["page_num"],
                "score": score,
            }

    if best_score < 0:
        return None, None

    return best_value, best_meta


def aggregate_group(doc_key: str, page_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    ordered_pages = sorted(page_results, key=sort_key_for_page)

    ok_pages = []
    for result in ordered_pages:
        if not result.get("ok"):
            continue

        payload = result["payload"]
        observed_fields = payload["document_analysis"]["observed_fields"]
        limitations = payload["document_analysis"]["limitations"]

        image_key = image_key_from_result(result)
        _base, page_num = split_page_suffix(image_key)

        ok_pages.append({
            "image_key": image_key,
            "page_num": page_num,
            "observed_fields": observed_fields,
            "limitations": limitations,
            "expected_customer_name": result.get("expected_customer_name"),
        })

    aggregated_observed_fields: Dict[str, Any] = {}
    field_sources: Dict[str, Optional[Dict[str, Any]]] = {}

    for field_name in [
        "customer_name",
        "address_line",
        "postcode_line",
        "city_line",
        "country_line",
        "brand",
        "model",
        "serial_number",
        "mid_number",
    ]:
        value, meta = choose_best_value(field_name, ok_pages)
        aggregated_observed_fields[field_name] = value
        field_sources[field_name] = meta

    serial_raw, serial_raw_meta = choose_best_raw_candidate(
        "serial_candidate_raw",
        "serial_number",
        ok_pages,
    )
    mid_raw, mid_raw_meta = choose_best_raw_candidate(
        "mid_candidate_raw",
        "mid_number",
        ok_pages,
    )

    aggregated_observed_fields["serial_candidate_raw"] = serial_raw
    aggregated_observed_fields["mid_candidate_raw"] = mid_raw
    field_sources["serial_candidate_raw"] = serial_raw_meta
    field_sources["mid_candidate_raw"] = mid_raw_meta

    combined_limitations: List[str] = []
    for page in ok_pages:
        for limitation in page["limitations"]:
            if limitation not in combined_limitations:
                combined_limitations.append(limitation)

    expected_customer_names = [
        page["expected_customer_name"]
        for page in ok_pages
        if page.get("expected_customer_name")
    ]
    expected_customer_name = expected_customer_names[0] if expected_customer_names else None

    observed_non_null_fields = sum(
        1 for field_name, value in aggregated_observed_fields.items()
        if value not in (None, "", [])
    )

    return {
        "document_key": doc_key,
        "page_count": len(ok_pages),
        "expected_customer_name": expected_customer_name,
        "observed_fields": aggregated_observed_fields,
        "field_sources": field_sources,
        "limitations": combined_limitations,
        "summary": {
            "mode": "invoice_image_multipage_aggregate_v1",
            "observed_non_null_fields": observed_non_null_fields,
            "source_pages": [page["image_key"] for page in ok_pages],
        },
        "pages": [
            {
                "image_key": page["image_key"],
                "page_num": page["page_num"],
                "limitations": page["limitations"],
            }
            for page in ok_pages
        ],
    }


def build_report(batch_data: Dict[str, Any]) -> Dict[str, Any]:
    groups: Dict[str, List[Dict[str, Any]]] = {}

    for result in batch_data.get("results", []):
        image_key = image_key_from_result(result)
        doc_key, _page_num = split_page_suffix(image_key)
        groups.setdefault(doc_key, []).append(result)

    aggregated_results: List[Dict[str, Any]] = []
    for doc_key in sorted(groups.keys()):
        aggregated_results.append(aggregate_group(doc_key, groups[doc_key]))

    return {
        "ok": True,
        "aggregate_version": "invoice_image_multipage_aggregate_v1",
        "source_batch_total": batch_data.get("total_files"),
        "document_count": len(aggregated_results),
        "results": aggregated_results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Aggregate multipage invoice image batch results into document-level results")
    parser.add_argument(
        "--batch-json",
        default="scripts/analysis_worker/output/invoice_image_batch_results_pdf_derived.json",
        help="Path to source image batch results JSON",
    )
    parser.add_argument(
        "--out",
        default="scripts/analysis_worker/output/invoice_image_batch_results_pdf_derived_aggregated.json",
        help="Path to write aggregated document-level results JSON",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    batch_path = Path(args.batch_json)
    out_path = Path(args.out)

    if not batch_path.exists():
        print(f"ERROR: batch json not found: {batch_path}", file=sys.stderr)
        return 1

    batch_data = json.loads(batch_path.read_text(encoding="utf-8"))
    report = build_report(batch_data)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"OK: wrote {out_path}")
    print(f"document_count={report['document_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())