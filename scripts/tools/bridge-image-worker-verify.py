#!/usr/bin/env python3
# /Users/daankoote/dev/enval/scripts/tools/bridge-image-worker-verify.py

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

CANONICAL_INVOICE_OBSERVED_KEYS: Set[str] = {
    "customer_name",
    "address_line",
    "house_number",
    "postcode_line",
    "city_line",
    "country_line",
    "serial_number",
    "serial_candidate_raw",
    "mid_number",
    "mid_candidate_raw",
    "address_block_ambiguous",
    "brand",
    "model",
}


def fail(msg: str, code: int = 1) -> None:
    print(f"FATAL: {msg}", file=sys.stderr)
    raise SystemExit(code)


def env_required(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        fail(f"Missing required env: {name}")
    return v


def read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"Failed to read JSON from {path}: {e}")


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def http_post_json(
    url: str,
    payload: Dict[str, Any],
    anon_key: str,
    idem_key: str,
    request_id: str,
) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url=url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {anon_key}")
    req.add_header("apikey", anon_key)
    req.add_header("Content-Type", "application/json")
    req.add_header("Idempotency-Key", idem_key)
    req.add_header("X-Request-Id", request_id)

    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw)
        except Exception:
            fail(f"HTTP {e.code} from {url}: {raw}")
    except Exception as e:
        fail(f"POST {url} failed: {e}")


def dossier_get(
    supabase_url: str,
    anon_key: str,
    dossier_id: str,
    session_token: str,
    ts: str,
) -> Dict[str, Any]:
    return http_post_json(
        f"{supabase_url}/functions/v1/api-dossier-get",
        {
            "dossier_id": dossier_id,
            "session_token": session_token,
        },
        anon_key=anon_key,
        idem_key=f"bridge-get-{ts}",
        request_id=f"bridge-get-{ts}",
    )


def verify_run(
    supabase_url: str,
    anon_key: str,
    dossier_id: str,
    session_token: str,
    client_verify_payload: Dict[str, Any],
    ts: str,
) -> Dict[str, Any]:
    return http_post_json(
        f"{supabase_url}/functions/v1/api-dossier-verify",
        {
            "dossier_id": dossier_id,
            "session_token": session_token,
            "mode": "refresh",
            "client_verify_payload": client_verify_payload,
        },
        anon_key=anon_key,
        idem_key=f"bridge-verify-{ts}",
        request_id=f"bridge-verify-{ts}",
    )


def evaluate_full(
    supabase_url: str,
    anon_key: str,
    dossier_id: str,
    session_token: str,
    ts: str,
) -> Dict[str, Any]:
    return http_post_json(
        f"{supabase_url}/functions/v1/api-dossier-evaluate",
        {
            "dossier_id": dossier_id,
            "session_token": session_token,
            "finalize": False,
            "evaluation_mode": "full",
        },
        anon_key=anon_key,
        idem_key=f"bridge-eval-{ts}",
        request_id=f"bridge-eval-{ts}",
    )


def find_document(dossier_get_json: Dict[str, Any], document_id: str) -> Dict[str, Any]:
    for d in dossier_get_json.get("documents", []):
        if str(d.get("id")) == document_id:
            return d
    fail(f"document_id not found in dossier_get: {document_id}")


def get_top_level_chargers(dossier_get_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    top = dossier_get_json.get("chargers", [])
    if isinstance(top, list):
        return top
    return []


def get_dossier_core(dossier_get_json: Dict[str, Any]) -> Dict[str, Any]:
    d = dossier_get_json.get("dossier", {})
    return d if isinstance(d, dict) else {}


def build_declared_snapshot(dossier_get_json: Dict[str, Any]) -> Dict[str, Any]:
    dossier = get_dossier_core(dossier_get_json)
    chargers = get_top_level_chargers(dossier_get_json)

    return {
        "dossier": {
            "dossier_id": dossier.get("id"),
            "address": {
                "postcode": dossier.get("address_postcode"),
                "house_number": dossier.get("address_house_number"),
                "suffix": dossier.get("address_suffix"),
                "street": dossier.get("address_street"),
                "city": dossier.get("address_city"),
            },
            "customer": {
                "first_name": dossier.get("customer_first_name"),
                "last_name": dossier.get("customer_last_name"),
                "email": dossier.get("customer_email"),
                "phone": dossier.get("customer_phone"),
            },
            "status": dossier.get("status"),
            "locked_at": dossier.get("locked_at"),
        },
        "chargers": [
            {
                "charger_id": c.get("id"),
                "brand": c.get("brand"),
                "model": c.get("model"),
                "serial_number": c.get("serial_number"),
                "mid_number": c.get("mid_number"),
                "notes": c.get("notes"),
            }
            for c in chargers
        ],
    }

def build_from_server_docs(dossier_get_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    docs = []
    for row in dossier_get_json.get("documents", []):
        docs.append(
            {
                "document_id": row.get("id"),
                "charger_id": row.get("charger_id"),
                "doc_type": row.get("doc_type"),
                "filename": row.get("filename"),
                "content_type": row.get("content_type"),
                "size_bytes": row.get("size_bytes"),
                "status": row.get("status"),
                "file_sha256": row.get("file_sha256"),
                "source": "server",
            }
        )
    return docs


def parse_map_arg(entries: List[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in entries:
        if "=" not in raw:
            fail(f"Invalid mapping '{raw}'. Expected format: <document_id>=<worker_match_filename>")
        left, right = raw.split("=", 1)
        left = left.strip()
        right = right.strip()
        if not left or not right:
            fail(f"Invalid mapping '{raw}'. Empty side not allowed.")
        if left in out:
            fail(f"Duplicate mapping for document_id: {left}")
        out[left] = right
    return out


def build_doc_lookup(dossier_get_json: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    out = {}
    for d in dossier_get_json.get("documents", []):
        did = str(d.get("id"))
        out[did] = d
    return out


def find_worker_result(worker_json: Dict[str, Any], wanted: str) -> Dict[str, Any]:
    results = worker_json.get("results", [])
    if not isinstance(results, list):
        fail("worker_json.results is not a list")

    exact_hits = []
    basename_hits = []
    contains_hits = []

    wanted_name = wanted.strip()
    wanted_base = Path(wanted_name).name

    for row in results:
        name = str(
            row.get("image_key")
            or row.get("image_path")
            or row.get("filename")
            or ""
        ).strip()

        if not name:
            continue

        base = Path(name).name

        if name == wanted_name:
            exact_hits.append(row)
        if base == wanted_base:
            basename_hits.append(row)
        if wanted_name in name or wanted_base in name:
            contains_hits.append(row)

    if len(exact_hits) == 1:
        return exact_hits[0]
    if len(exact_hits) > 1:
        fail(f"Multiple exact worker matches for: {wanted_name}")

    if len(basename_hits) == 1:
        return basename_hits[0]
    if len(basename_hits) > 1:
        fail(f"Multiple basename worker matches for: {wanted_base}")

    if len(contains_hits) == 1:
        return contains_hits[0]
    if len(contains_hits) > 1:
        fail(f"Multiple contains worker matches for: {wanted_name}")

    fail(f"No worker result match found for: {wanted_name}")

def validate_parser_payload_shape(parser_payload: Dict[str, Any], context: str) -> None:
    if not isinstance(parser_payload, dict):
        fail(f"{context}: parser_payload must be an object")

    required_top_keys = {
        "parser_kind",
        "parser_version",
        "source_kind",
        "observed_fields",
        "confidence",
        "limitations",
        "summary",
    }

    missing_top = sorted(required_top_keys - set(parser_payload.keys()))
    if missing_top:
        fail(f"{context}: parser_payload missing top-level keys: {missing_top}")

    observed = parser_payload.get("observed_fields")
    if not isinstance(observed, dict):
        fail(f"{context}: observed_fields must be an object")

    missing_observed = sorted(CANONICAL_INVOICE_OBSERVED_KEYS - set(observed.keys()))
    extra_observed = sorted(set(observed.keys()) - CANONICAL_INVOICE_OBSERVED_KEYS)

    if missing_observed:
        fail(f"{context}: observed_fields missing canonical keys: {missing_observed}")

    if extra_observed:
        fail(f"{context}: observed_fields contains unexpected keys: {extra_observed}")

    if not isinstance(parser_payload.get("confidence"), dict):
        fail(f"{context}: confidence must be an object")

    if not isinstance(parser_payload.get("limitations"), list):
        fail(f"{context}: limitations must be a list")

    if not isinstance(parser_payload.get("summary"), dict):
        fail(f"{context}: summary must be an object")

def build_bridge_meta(
    *,
    bridge_source: str,
    source_ref: str,
    source_kind: str,
    bridge_tool: str = "bridge-image-worker-verify.py",
    bridge_version: str = "v4",
) -> Dict[str, Any]:
    return {
        "bridge_source": bridge_source,
        "source_ref": source_ref,
        "source_kind": source_kind,
        "bridge_tool": bridge_tool,
        "bridge_version": bridge_version,
    }

def build_parser_payload(worker_row: Dict[str, Any]) -> Dict[str, Any]:
    analysis = ((worker_row.get("payload") or {}).get("document_analysis") or {})
    observed = analysis.get("observed_fields") or {}
    limitations = analysis.get("limitations") or []
    summary = analysis.get("summary") or {}
    confidence = analysis.get("confidence") or {}

    if not isinstance(observed, dict):
        fail("worker_row payload invalid: observed_fields must be an object")
    if not isinstance(limitations, list):
        fail("worker_row payload invalid: limitations must be a list")
    if not isinstance(summary, dict):
        fail("worker_row payload invalid: summary must be an object")
    if not isinstance(confidence, dict):
        fail("worker_row payload invalid: confidence must be an object")

    parser_version = (
        summary.get("mode")
        or confidence.get("parser_version")
        or "invoice_image_extract_local_v1"
    )

    source_ref = str(
        worker_row.get("image_key")
        or worker_row.get("image_path")
        or worker_row.get("filename")
        or ""
    ).strip()

    summary_with_bridge = dict(summary)
    summary_with_bridge["bridge_meta"] = build_bridge_meta(
        bridge_source="worker_result",
        source_ref=source_ref,
        source_kind="image",
    )

    payload = {
        "parser_kind": "internal_worker_ocr",
        "parser_version": str(parser_version),
        "source_kind": "image",
        "observed_fields": observed,
        "confidence": confidence,
        "limitations": limitations,
        "summary": summary_with_bridge,
    }

    validate_parser_payload_shape(payload, "worker_result")
    return payload

def build_parser_payload_from_analysis_file(path: Path) -> Dict[str, Any]:
    data = read_json(path)

    analysis = (
        data.get("payload", {}).get("document_analysis")
        or data.get("document_analysis")
        or {}
    )

    observed = analysis.get("observed_fields") or {}
    confidence = analysis.get("confidence") or {}
    limitations = analysis.get("limitations") or []
    summary = analysis.get("summary") or {}

    if not isinstance(observed, dict):
        fail(f"observed_fields missing/invalid in payload file: {path}")
    if not isinstance(confidence, dict):
        fail(f"confidence missing/invalid in payload file: {path}")
    if not isinstance(limitations, list):
        fail(f"limitations missing/invalid in payload file: {path}")
    if not isinstance(summary, dict):
        fail(f"summary missing/invalid in payload file: {path}")

    parser_kind = "local_analysis_file"
    source_kind = "unknown"

    mode = str(summary.get("mode") or "")
    if "pdf" in mode:
        parser_kind = "internal_pdf_parser"
        source_kind = "pdf"
    elif "image" in mode:
        parser_kind = "internal_worker_ocr"
        source_kind = "image"

    parser_version = mode or "analysis_file_v1"

    summary_with_bridge = dict(summary)
    summary_with_bridge["bridge_meta"] = build_bridge_meta(
        bridge_source="analysis_file",
        source_ref=str(path),
        source_kind=source_kind,
    )

    payload = {
        "parser_kind": parser_kind,
        "parser_version": parser_version,
        "source_kind": source_kind,
        "observed_fields": observed,
        "confidence": confidence,
        "limitations": limitations,
        "summary": summary_with_bridge,
    }

    validate_parser_payload_shape(payload, f"analysis_file:{path}")
    return payload


def parse_payload_file_map(entries: List[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in entries:
        if "=" not in raw:
            fail(f"Invalid payload mapping '{raw}'. Expected format: <document_id>=<json_path>")
        left, right = raw.split("=", 1)
        left = left.strip()
        right = right.strip()
        if not left or not right:
            fail(f"Invalid payload mapping '{raw}'. Empty side not allowed.")
        if left in out:
            fail(f"Duplicate payload mapping for document_id: {left}")
        out[left] = right
    return out

def build_client_invoice_observed_entry_from_parser_payload(
    document_id: str,
    parser_payload: Dict[str, Any],
    source: str,
) -> Dict[str, Any]:
    return {
        "document_id": document_id,
        "source": source,
        "parser_payload": parser_payload,
    }


def build_client_invoice_observed_entry(document_id: str, worker_row: Dict[str, Any]) -> Dict[str, Any]:
    return build_client_invoice_observed_entry_from_parser_payload(
        document_id=document_id,
        parser_payload=build_parser_payload(worker_row),
        source="internal_worker_bridge",
    )

def build_client_verify_payload(
    dossier_get_json: Dict[str, Any],
    bridged_entries: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "version": "enval-client-verify-payload.v1",
        "declared_snapshot": build_declared_snapshot(dossier_get_json),
        "document_snapshot": {
            "from_server": build_from_server_docs(dossier_get_json),
            "from_client_uploads": [],
            "client_invoice_observed": bridged_entries,
        },
    }


def non_null_observed(worker_row: Dict[str, Any]) -> Dict[str, Any]:
    analysis = ((worker_row.get("payload") or {}).get("document_analysis") or {})
    observed = analysis.get("observed_fields") or {}
    return {k: v for k, v in observed.items() if v not in (None, "", [], {})}


def print_worker_match(document_id: str, doc: Dict[str, Any], worker_row: Dict[str, Any]) -> None:
    analysis = ((worker_row.get("payload") or {}).get("document_analysis") or {})
    limitations = analysis.get("limitations") or []
    summary = analysis.get("summary") or {}

    print("\n== WORKER MATCH ==")
    print("document_id:", document_id)
    print("document_filename:", doc.get("filename"))
    print("worker_match_name:", worker_row.get("image_key") or worker_row.get("image_path") or worker_row.get("filename"))
    print("observed_non_null:")
    nn = non_null_observed(worker_row)
    if not nn:
        print("  <none>")
    else:
        for k, v in nn.items():
            print(f"  {k}: {v}")
    print("limitations:", limitations)
    print("summary:", summary)


def print_verify_summary(resp: Dict[str, Any]) -> None:
    print("\n== VERIFY SUMMARY ==")
    print("ok:", resp.get("ok"))
    print("run_id:", resp.get("run_id"))
    print("analysis_status:", resp.get("analysis_status"))
    run = resp.get("analysis_run") or {}
    print("client_invoice_observed_count:", run.get("client_invoice_observed_count"))
    print("document_analyses_completed:", run.get("document_analyses_completed"))
    print("document_analyses_failed:", run.get("document_analyses_failed"))
    print("charger_results_written:", run.get("charger_results_written"))


def print_evaluate_summary(resp: Dict[str, Any]) -> None:
    print("\n== EVALUATE SUMMARY ==")
    print("ok:", resp.get("ok"))
    print("submit_allowed:", resp.get("submit_allowed"))
    print("status:", resp.get("status"))

    checks = resp.get("checks") or []
    target = None
    for c in checks:
        if c.get("check_code") == "analysis_invoice_gate":
            target = c
            break

    if not target:
        print("analysis_invoice_gate: NOT FOUND")
        return

    details = target.get("details") or {}
    print("analysis_invoice_gate.status:", target.get("status"))
    print("analysis_invoice_gate.overall_status:", details.get("overall_status"))
    print("analysis_invoice_gate.run_id:", details.get("run_id"))

    print("blocking_reasons:")
    for x in details.get("blocking_reasons", []):
        print(" -", x)

    print("warnings:")
    for x in details.get("warnings", []):
        print(" -", x)


def print_target_charger_results(verify_resp: Dict[str, Any], target_document_ids: List[str]) -> None:
    wanted = set(str(x) for x in target_document_ids)
    readable = verify_resp.get("analysis_readable") or {}
    chargers = readable.get("chargers") or []

    print("\n== TARGET CHARGER RESULTS FOR BRIDGED DOCUMENTS ==")
    found_any = False

    for charger in chargers:
        rows = charger.get("analysis_results") or []
        matched = [r for r in rows if str(r.get("source_document_id")) in wanted]
        if not matched:
            continue

        found_any = True
        label = charger.get("charger_label") or {}
        print(
            f"charger_id={charger.get('charger_id')} "
            f"brand={label.get('brand')} "
            f"model={label.get('model')} "
            f"serial={label.get('serial_number')} "
            f"mid={label.get('mid_number')}"
        )
        for r in matched:
            print(
                f"  doc={r.get('source_document_id')} "
                f"{r.get('analysis_code')}: "
                f"status={r.get('status')} "
                f"reason={r.get('reason')}"
            )

    if not found_any:
        print("<no charger rows linked to bridged documents>")


def build_compact_summary(
    dossier_id: str,
    verify_resp: Dict[str, Any],
    eval_resp: Dict[str, Any],
    bridged_docs: List[Dict[str, Any]],
) -> Dict[str, Any]:
    checks = eval_resp.get("checks") or []
    gate = None
    for c in checks:
        if c.get("check_code") == "analysis_invoice_gate":
            gate = c
            break

    gate_details = (gate or {}).get("details") or {}
    run = verify_resp.get("analysis_run") or {}

    return {
        "dossier_id": dossier_id,
        "verify": {
            "ok": verify_resp.get("ok"),
            "run_id": verify_resp.get("run_id"),
            "analysis_status": verify_resp.get("analysis_status"),
            "client_invoice_observed_count": run.get("client_invoice_observed_count"),
            "document_analyses_completed": run.get("document_analyses_completed"),
            "document_analyses_failed": run.get("document_analyses_failed"),
            "charger_results_written": run.get("charger_results_written"),
        },
        "evaluate": {
            "ok": eval_resp.get("ok"),
            "submit_allowed": eval_resp.get("submit_allowed"),
            "status": eval_resp.get("status"),
            "analysis_invoice_gate_status": (gate or {}).get("status"),
            "analysis_invoice_gate_overall_status": gate_details.get("overall_status"),
            "analysis_invoice_gate_run_id": gate_details.get("run_id"),
            "blocking_reasons": gate_details.get("blocking_reasons") or [],
            "warnings": gate_details.get("warnings") or [],
        },
        "bridged_documents": bridged_docs,
    }

def build_text_report(
    dossier_id: str,
    verify_resp: Dict[str, Any],
    eval_resp: Dict[str, Any],
    bridged_docs: List[Dict[str, Any]],
) -> str:
    lines: List[str] = []

    run = verify_resp.get("analysis_run") or {}
    checks = eval_resp.get("checks") or []
    gate = None
    for c in checks:
        if c.get("check_code") == "analysis_invoice_gate":
            gate = c
            break
    gate_details = (gate or {}).get("details") or {}

    lines.append("== BRIDGE IMAGE WORKER VERIFY REPORT ==")
    lines.append(f"dossier_id: {dossier_id}")
    lines.append("")
    lines.append("== VERIFY ==")
    lines.append(f"ok: {verify_resp.get('ok')}")
    lines.append(f"run_id: {verify_resp.get('run_id')}")
    lines.append(f"analysis_status: {verify_resp.get('analysis_status')}")
    lines.append(f"client_invoice_observed_count: {run.get('client_invoice_observed_count')}")
    lines.append(f"document_analyses_completed: {run.get('document_analyses_completed')}")
    lines.append(f"document_analyses_failed: {run.get('document_analyses_failed')}")
    lines.append(f"charger_results_written: {run.get('charger_results_written')}")
    lines.append("")
    lines.append("== EVALUATE ==")
    lines.append(f"ok: {eval_resp.get('ok')}")
    lines.append(f"submit_allowed: {eval_resp.get('submit_allowed')}")
    lines.append(f"status: {eval_resp.get('status')}")
    lines.append(f"analysis_invoice_gate_status: {(gate or {}).get('status')}")
    lines.append(f"analysis_invoice_gate_overall_status: {gate_details.get('overall_status')}")
    lines.append(f"analysis_invoice_gate_run_id: {gate_details.get('run_id')}")
    lines.append("")
    lines.append("blocking_reasons:")
    for item in gate_details.get("blocking_reasons", []):
        lines.append(f" - {item}")
    lines.append("")
    lines.append("warnings:")
    for item in gate_details.get("warnings", []):
        lines.append(f" - {item}")
    lines.append("")
    lines.append("== CONTRACT ==")
    lines.append(f"canonical_observed_keys: {sorted(CANONICAL_INVOICE_OBSERVED_KEYS)}")
    lines.append("payload_shape_validation: passed")
    lines.append("")
    lines.append("== BRIDGED DOCUMENTS ==")
    for doc in bridged_docs:
        lines.append(f"document_id: {doc.get('document_id')}")
        lines.append(f"document_filename: {doc.get('document_filename')}")
        lines.append(f"worker_match_name: {doc.get('worker_match_name')}")
        lines.append(f"bridge_source: {doc.get('bridge_source')}")
        lines.append(f"source_kind: {doc.get('source_kind')}")
        lines.append(f"parser_kind: {doc.get('parser_kind')}")
        lines.append(f"parser_version: {doc.get('parser_version')}")
        lines.append(f"bridge_meta: {doc.get('bridge_meta')}")
        lines.append("observed_non_null:")
        observed = doc.get("observed_non_null") or {}
        if not observed:
            lines.append("  <none>")
        else:
            for k, v in observed.items():
                lines.append(f"  {k}: {v}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bridge local invoice-image worker output into api-dossier-verify and api-dossier-evaluate."
    )
    parser.add_argument("--dossier-id", default=os.environ.get("DOSSIER_ID", "").strip())
    parser.add_argument("--session-token", default=os.environ.get("DOSSIER_SESSION_TOKEN", "").strip())
    parser.add_argument(
        "--document-id",
        action="append",
        default=[],
        help="One or more target document IDs. Repeat this flag for multiple documents.",
    )
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        help="Optional explicit mapping: <document_id>=<worker_match_filename>. Repeatable.",
    )
    parser.add_argument(
        "--worker-json",
        default="scripts/analysis_worker/output/invoice_image_batch_results.json",
    )
    parser.add_argument(
        "--payload-file",
        action="append",
        default=[],
        help="Explicit parser payload file mapping: <document_id>=<json_path>. Repeatable.",
    )
    parser.add_argument(
        "--output-dir",
        default="scripts/tools/output/image-worker-verify-bridge",
    )
    parser.add_argument(
        "--summary-json",
        default="",
        help="Optional explicit summary JSON path. Defaults to <output-dir>/summary.json",
    )
    args = parser.parse_args()

    dossier_id = str(args.dossier_id).strip()
    session_token = str(args.session_token).strip()
    document_ids = [str(x).strip() for x in args.document_id if str(x).strip()]
    explicit_map = parse_map_arg(args.map)
    payload_file_map = parse_payload_file_map(args.payload_file)

    if not dossier_id:
        fail("Missing --dossier-id and DOSSIER_ID not set")
    if not session_token:
        fail("Missing --session-token and DOSSIER_SESSION_TOKEN not set")
    if not document_ids:
        fail("At least one --document-id is required")

    for did in explicit_map:
        if did not in document_ids:
            fail(f"--map contains document_id not present in --document-id list: {did}")

    for did in payload_file_map:
        if did not in document_ids:
            fail(f"--payload-file contains document_id not present in --document-id list: {did}")

    overlap = set(explicit_map.keys()) & set(payload_file_map.keys())
    if overlap:
        fail(f"document_id cannot use both --map and --payload-file: {sorted(overlap)}")

    supabase_url = env_required("SUPABASE_URL")
    anon_key = env_required("SUPABASE_ANON_KEY")

    ts = str(int(time.time()))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dossier_get_json = dossier_get(
        supabase_url=supabase_url,
        anon_key=anon_key,
        dossier_id=dossier_id,
        session_token=session_token,
        ts=ts,
    )
    write_json(output_dir / "dossier_get.json", dossier_get_json)

    if not dossier_get_json.get("ok"):
        fail(f"api-dossier-get failed: {json.dumps(dossier_get_json, ensure_ascii=False)}")

    worker_json = read_json(Path(args.worker_json))
    bridged_entries: List[Dict[str, Any]] = []
    bridged_docs_summary: List[Dict[str, Any]] = []

    for document_id in document_ids:
        doc = find_document(dossier_get_json, document_id)

        if str(doc.get("doc_type")) != "factuur":
            fail(f"document_id {document_id} is not a factuur document")

        if document_id in payload_file_map:
            payload_path = Path(payload_file_map[document_id])
            parser_payload = build_parser_payload_from_analysis_file(payload_path)

            print("\n== PAYLOAD FILE MATCH ==")
            print("document_id:", document_id)
            print("document_filename:", doc.get("filename"))
            print("payload_file:", str(payload_path))
            print("observed_non_null:")
            found_any = False
            for k, v in (parser_payload.get("observed_fields") or {}).items():
                if v not in (None, "", [], {}):
                    found_any = True
                    print(f"  {k}: {v}")
            if not found_any:
                print("  <none>")
            print("limitations:", parser_payload.get("limitations"))
            print("summary:", parser_payload.get("summary"))

            bridged_entries.append(
                build_client_invoice_observed_entry_from_parser_payload(
                    document_id=document_id,
                    parser_payload=parser_payload,
                    source="analysis_payload_file_bridge",
                )
            )

            bridged_docs_summary.append(
                {
                    "document_id": document_id,
                    "document_filename": doc.get("filename"),
                    "worker_match_name": str(payload_path),
                    "bridge_source": "analysis_file",
                    "source_kind": parser_payload.get("source_kind"),
                    "parser_kind": parser_payload.get("parser_kind"),
                    "parser_version": parser_payload.get("parser_version"),
                    "bridge_meta": (parser_payload.get("summary") or {}).get("bridge_meta") or {},
                    "observed_non_null": {
                        k: v
                        for k, v in (parser_payload.get("observed_fields") or {}).items()
                        if v not in (None, "", [], {})
                    },
                }
            )
            continue

        explicit_match = explicit_map.get(document_id)
        wanted = explicit_match or str(doc.get("filename") or "").strip()
        if not wanted:
            fail(f"Could not derive filename for document_id {document_id}")

        worker_row = find_worker_result(worker_json, wanted)
        print_worker_match(document_id, doc, worker_row)
        parser_payload = build_parser_payload(worker_row)

        bridged_entries.append(
            build_client_invoice_observed_entry_from_parser_payload(
                document_id=document_id,
                parser_payload=parser_payload,
                source="internal_worker_bridge",
            )
        )

        bridged_docs_summary.append(
            {
                "document_id": document_id,
                "document_filename": doc.get("filename"),
                "worker_match_name": worker_row.get("image_key") or worker_row.get("image_path") or worker_row.get("filename"),
                "bridge_source": "worker_result",
                "source_kind": parser_payload.get("source_kind"),
                "parser_kind": parser_payload.get("parser_kind"),
                "parser_version": parser_payload.get("parser_version"),
                "bridge_meta": (parser_payload.get("summary") or {}).get("bridge_meta") or {},
                "observed_non_null": {
                    k: v
                    for k, v in (parser_payload.get("observed_fields") or {}).items()
                    if v not in (None, "", [], {})
                },
            }
        )

    client_verify_payload = build_client_verify_payload(dossier_get_json, bridged_entries)
    write_json(output_dir / "client_verify_payload.json", client_verify_payload)

    verify_resp = verify_run(
        supabase_url=supabase_url,
        anon_key=anon_key,
        dossier_id=dossier_id,
        session_token=session_token,
        client_verify_payload=client_verify_payload,
        ts=ts,
    )
    write_json(output_dir / "verify_response.json", verify_resp)
    print_verify_summary(verify_resp)

    eval_resp = evaluate_full(
        supabase_url=supabase_url,
        anon_key=anon_key,
        dossier_id=dossier_id,
        session_token=session_token,
        ts=ts,
    )
    write_json(output_dir / "evaluate_response.json", eval_resp)
    print_evaluate_summary(eval_resp)
    print_target_charger_results(verify_resp, document_ids)

    summary_json_path = Path(args.summary_json) if args.summary_json else (output_dir / "summary.json")
    summary = build_compact_summary(dossier_id, verify_resp, eval_resp, bridged_docs_summary)
    write_json(summary_json_path, summary)

    report_txt_path = output_dir / "latest-bridge-report.txt"
    report_txt_path.write_text(
        build_text_report(dossier_id, verify_resp, eval_resp, bridged_docs_summary),
        encoding="utf-8",
    )

    print("\n== OUTPUT FILES ==")
    print(output_dir / "dossier_get.json")
    print(output_dir / "client_verify_payload.json")
    print(output_dir / "verify_response.json")
    print(output_dir / "evaluate_response.json")
    print(summary_json_path)
    print(report_txt_path)


if __name__ == "__main__":
    main()