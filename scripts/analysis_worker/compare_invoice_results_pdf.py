#! /Users/daankoote/dev/enval/scripts/analysis_worker/compare_invoice_results_pdf.py

#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List


# ============================================================
# Normalization helpers
# ============================================================

def clean_line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_compact(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper()).strip()


def normalize_name(value: Any) -> str:
    s = clean_line(value).lower()
    s = re.sub(r"[^a-zà-ÿ\s\-']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_address_line(value: Any) -> str:
    return clean_line(value).lower()


def normalize_city(value: Any) -> str:
    return clean_line(value).lower()


def normalize_postcode(value: Any) -> str:
    return normalize_compact(value)


def normalize_serial(value: Any) -> str:
    return normalize_compact(value)


def normalize_mid(value: Any) -> str:
    return normalize_compact(value)


def values_equal(field_name: str, expected: Any, observed: Any) -> bool:
    if expected is None or observed is None:
        return False

    if field_name == "customer_name":
        return normalize_name(expected) == normalize_name(observed)

    if field_name == "address_line":
        return normalize_address_line(expected) == normalize_address_line(observed)

    if field_name == "postcode_line":
        return normalize_postcode(expected) == normalize_postcode(observed)

    if field_name == "city_line":
        return normalize_city(expected) == normalize_city(observed)

    if field_name == "serial_number":
        return normalize_serial(expected) == normalize_serial(observed)

    if field_name == "mid_number":
        return normalize_mid(expected) == normalize_mid(observed)

    if field_name in {"brand", "model", "country_line"}:
        return clean_line(expected).lower() == clean_line(observed).lower()

    return clean_line(expected) == clean_line(observed)


# ============================================================
# Expected fixture mapping for PDF lane
# ============================================================

EXPECTED_BY_PDF: Dict[str, Dict[str, Any]] = {
    "invoice_daan_pdf_02.pdf": {
        "customer_name": "Daan Koote",
        "address_line": "Geulstraat 28-1H",
        "postcode_line": "1078LA",
        "city_line": "Amsterdam",
        "country_line": None,
        "serial_number": "1234567890",
        "mid_number": "M123456789",
        "brand": "Test Brand",
        "model": "Model A",
    },
    "invoice_daan_pdf_03.pdf": {
        "customer_name": "Daan Koote",
        "address_line": "Geulstraat 28-1H",
        "postcode_line": "1078LA",
        "city_line": "Amsterdam",
        "country_line": None,
        "serial_number": "1234567890",
        "mid_number": "M123456789",
        "brand": None,
        "model": None,
    },
    "invoice_paul_pdf_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": None,
        "model": None,
    },
    "invoice_paul_pdf_03 brand_model_variant_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_04 brand_model_variant_02.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": "Nederland",
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_05 brand_model_variant_03.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_06 MID_wrong_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654999",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_07_brand_wrong_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "ABB",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_08_model_wrong_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Double Pro-line",
    },
    "invoice_paul_pdf_09_address_wrong_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 67",
        "postcode_line": "2042PD",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_10_serial_wrong_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654999",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_11_all_correct_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_12_chaos_01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_13 multi-page 01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
    "invoice_paul_pdf_14_multi-page_+_chaos 01.pdf": {
        "customer_name": "Paul Koote",
        "address_line": "Kostverlorenstraat 65",
        "postcode_line": "2042PC",
        "city_line": "Zandvoort",
        "country_line": None,
        "serial_number": "0987654321",
        "mid_number": "M0987654321",
        "brand": "Alfen",
        "model": "Eve Single Pro-line",
    },
}


FIELDS_TO_COMPARE: List[str] = [
    "customer_name",
    "address_line",
    "postcode_line",
    "city_line",
    "country_line",
    "serial_number",
    "mid_number",
    "brand",
    "model",
]

LOAD_BEARING_FIELDS = {
    "customer_name",
    "address_line",
    "postcode_line",
    "city_line",
    "serial_number",
    "mid_number",
}

SECONDARY_FIELDS = {
    "country_line",
    "brand",
    "model",
}


# ============================================================
# Compare logic
# ============================================================

@dataclass
class FieldAssessment:
    field_name: str
    expected: Any
    observed_raw: Any
    observed_approved: Any
    status: str
    reason: str
    is_load_bearing: bool


def assess_field(field_name: str, expected: Any, observed_fields: Dict[str, Any], limitations: List[str]) -> FieldAssessment:
    observed_approved = observed_fields.get(field_name)

    raw_map = {
        "serial_number": observed_fields.get("serial_candidate_raw"),
        "mid_number": observed_fields.get("mid_candidate_raw"),
    }
    observed_raw = raw_map.get(field_name, observed_approved)
    is_load_bearing = field_name in LOAD_BEARING_FIELDS

    if expected is None:
        if observed_approved is None:
            return FieldAssessment(
                field_name=field_name,
                expected=None,
                observed_raw=observed_raw,
                observed_approved=observed_approved,
                status="not_expected",
                reason="no_expected_value",
                is_load_bearing=is_load_bearing,
            )
        return FieldAssessment(
            field_name=field_name,
            expected=None,
            observed_raw=observed_raw,
            observed_approved=observed_approved,
            status="extra_observed",
            reason="value_observed_but_not_expected",
            is_load_bearing=is_load_bearing,
        )

    if observed_approved is not None:
        if values_equal(field_name, expected, observed_approved):
            return FieldAssessment(
                field_name=field_name,
                expected=expected,
                observed_raw=observed_raw,
                observed_approved=observed_approved,
                status="pass",
                reason="expected_matches_observed",
                is_load_bearing=is_load_bearing,
            )
        return FieldAssessment(
            field_name=field_name,
            expected=expected,
            observed_raw=observed_raw,
            observed_approved=observed_approved,
            status="fail",
            reason="value_mismatch",
            is_load_bearing=is_load_bearing,
        )

    if field_name == "mid_number" and observed_raw:
        if "mid_candidate_rejected" in limitations:
            return FieldAssessment(
                field_name=field_name,
                expected=expected,
                observed_raw=observed_raw,
                observed_approved=None,
                status="inconclusive",
                reason="candidate_rejected_noisy_or_invalid",
                is_load_bearing=is_load_bearing,
            )

    if field_name == "serial_number" and observed_raw:
        if "serial_candidate_rejected" in limitations:
            return FieldAssessment(
                field_name=field_name,
                expected=expected,
                observed_raw=observed_raw,
                observed_approved=None,
                status="inconclusive",
                reason="candidate_rejected_noisy_or_invalid",
                is_load_bearing=is_load_bearing,
            )

    if observed_raw:
        return FieldAssessment(
            field_name=field_name,
            expected=expected,
            observed_raw=observed_raw,
            observed_approved=None,
            status="inconclusive",
            reason="raw_candidate_present_but_not_approved",
            is_load_bearing=is_load_bearing,
        )

    return FieldAssessment(
        field_name=field_name,
        expected=expected,
        observed_raw=None,
        observed_approved=None,
        status="not_found",
        reason="no_candidate_found",
        is_load_bearing=is_load_bearing,
    )


def determine_overall_status(field_results: List[FieldAssessment]) -> str:
    load_bearing = [r for r in field_results if r.is_load_bearing]
    secondary = [r for r in field_results if not r.is_load_bearing]

    lb_fail = [r for r in load_bearing if r.status == "fail"]
    lb_inconclusive = [r for r in load_bearing if r.status == "inconclusive"]
    lb_not_found = [r for r in load_bearing if r.status == "not_found"]

    sec_fail = [r for r in secondary if r.status == "fail"]
    sec_inconclusive = [r for r in secondary if r.status == "inconclusive"]

    if lb_fail and (lb_inconclusive or lb_not_found):
        return "mixed"

    if lb_fail:
        return "fail"

    if lb_inconclusive:
        return "inconclusive"

    if lb_not_found:
        return "partial"

    if sec_fail and sec_inconclusive:
        return "mixed"

    if sec_fail:
        return "fail"

    if sec_inconclusive:
        return "inconclusive"

    return "pass"


def determine_overall_reason(field_results: List[FieldAssessment], limitations: List[str]) -> str:
    by_name = {r.field_name: r for r in field_results}

    customer = by_name.get("customer_name")
    address = by_name.get("address_line")
    postcode = by_name.get("postcode_line")
    city = by_name.get("city_line")
    serial = by_name.get("serial_number")
    mid = by_name.get("mid_number")

    load_bearing_fails = [r for r in field_results if r.is_load_bearing and r.status == "fail"]
    load_bearing_inconclusive = [r for r in field_results if r.is_load_bearing and r.status == "inconclusive"]
    load_bearing_not_found = [r for r in field_results if r.is_load_bearing and r.status == "not_found"]

    if len(load_bearing_fails) >= 2:
        return "multiple_load_bearing_mismatches"

    if "customer_name_company_like" in limitations:
        return "seller_or_company_block_detected"

    if serial and serial.status == "fail":
        return "serial_value_mismatch"

    if mid and mid.status == "fail":
        return "mid_value_mismatch"

    if mid and mid.status == "inconclusive":
        return "mid_candidate_rejected"

    if serial and serial.status == "inconclusive":
        return "serial_candidate_rejected"

    if address and address.status == "fail":
        return "address_value_mismatch"

    if customer and customer.status == "fail":
        return "customer_name_mismatch"

    if (
        postcode and postcode.status == "not_found"
        and city and city.status == "not_found"
    ):
        return "postcode_and_city_not_found"

    if len(load_bearing_not_found) >= 2:
        return "multiple_load_bearing_fields_not_found"

    if serial and serial.status == "not_found":
        return "serial_not_found"

    if mid and mid.status == "not_found":
        return "mid_not_found"

    if load_bearing_inconclusive and load_bearing_not_found:
        return "mixed_inconclusive_and_missing_load_bearing_fields"

    if any(r.status == "fail" for r in field_results):
        return "one_or_more_field_mismatches"

    if any(r.status == "inconclusive" for r in field_results):
        return "one_or_more_fields_inconclusive"

    if any(r.status == "not_found" for r in field_results):
        return "one_or_more_fields_not_found"

    return "all_expected_fields_match"


def pdf_key_from_result(result: Dict[str, Any]) -> str:
    pdf_path = str(result.get("pdf_path") or "")
    marker = "/docs/facturen/facturen_pdf/"
    if marker in pdf_path:
        return pdf_path.split(marker, 1)[1]
    return Path(pdf_path).name


def build_compare_report(batch_data: Dict[str, Any]) -> Dict[str, Any]:
    report_results: List[Dict[str, Any]] = []

    for result in batch_data.get("results", []):
        pdf_key = pdf_key_from_result(result)

        if not result.get("ok"):
            report_results.append({
                "pdf_key": pdf_key,
                "expected_customer_name": result.get("expected_customer_name"),
                "worker_ok": False,
                "overall_status": "worker_failed",
                "overall_reason": result.get("error") or "worker_failed",
                "field_results": [],
            })
            continue

        payload = result["payload"]
        observed_fields = payload["document_analysis"]["observed_fields"]
        limitations = payload["document_analysis"]["limitations"]
        expected_fields = EXPECTED_BY_PDF.get(pdf_key)

        if expected_fields is None:
            report_results.append({
                "pdf_key": pdf_key,
                "expected_customer_name": result.get("expected_customer_name"),
                "worker_ok": True,
                "overall_status": "no_fixture",
                "overall_reason": "no_expected_fixture_for_pdf",
                "field_results": [],
            })
            continue

        field_results = [
            assess_field(field_name, expected_fields.get(field_name), observed_fields, limitations)
            for field_name in FIELDS_TO_COMPARE
        ]

        report_results.append({
            "pdf_key": pdf_key,
            "expected_customer_name": result.get("expected_customer_name"),
            "worker_ok": True,
            "overall_status": determine_overall_status(field_results),
            "overall_reason": determine_overall_reason(field_results, limitations),
            "field_results": [
                {
                    "field_name": fr.field_name,
                    "expected": fr.expected,
                    "observed_raw": fr.observed_raw,
                    "observed_approved": fr.observed_approved,
                    "status": fr.status,
                    "reason": fr.reason,
                    "is_load_bearing": fr.is_load_bearing,
                }
                for fr in field_results
            ],
            "limitations": limitations,
        })

    summary_counts: Dict[str, int] = {}
    for item in report_results:
        key = item["overall_status"]
        summary_counts[key] = summary_counts.get(key, 0) + 1

    return {
        "ok": True,
        "compare_version": "invoice_pdf_compare_v1",
        "source_batch_total": batch_data.get("total_files"),
        "summary_counts": summary_counts,
        "results": report_results,
    }


# ============================================================
# CLI
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare expected invoice PDF extraction results against batch PDF output")
    parser.add_argument(
        "--batch-json",
        default="scripts/analysis_worker/output/invoice_pdf_batch_results.json",
        help="Path to invoice pdf batch results JSON",
    )
    parser.add_argument(
        "--out",
        default="scripts/analysis_worker/output/invoice_pdf_compare_results.json",
        help="Path to write compare results JSON",
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
    report = build_compare_report(batch_data)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"OK: wrote {out_path}")
    print(f"summary_counts={report['summary_counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())