#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`
Usage:
  node scripts/tools/retention-storage-cleanup.mjs --dossier-id <uuid> [--now <iso>] [--apply --yes]

Default:
  Dry-run only. No storage delete. No DB delete.

Examples:
  node scripts/tools/retention-storage-cleanup.mjs --dossier-id <uuid> --now 2099-01-01T00:00:00Z

  node scripts/tools/retention-storage-cleanup.mjs --dossier-id <uuid> --now 2099-01-01T00:00:00Z --apply --yes
`);
}

function parseArgs(argv) {
  const args = {
    dossierId: "",
    now: new Date().toISOString(),
    apply: false,
    yes: false,
    envFile: ".env.local",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];

    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }

    if (a === "--dossier-id") {
      args.dossierId = argv[++i] || "";
      continue;
    }

    if (a === "--now") {
      args.now = argv[++i] || "";
      continue;
    }

    if (a === "--env-file") {
      args.envFile = argv[++i] || "";
      continue;
    }

    if (a === "--apply") {
      args.apply = true;
      continue;
    }

    if (a === "--yes") {
      args.yes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${a}`);
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    let key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (key.startsWith("export ")) {
      key = key.slice("export ".length).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function needEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function uniqObjects(items) {
  const seen = new Set();
  const out = [];

  for (const item of items || []) {
    const bucket = String(item?.bucket || "");
    const p = String(item?.path || "");
    const key = `${bucket}\n${p}`;
    if (!bucket || !p) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bucket, path: p });
  }

  out.sort((a, b) => {
    const ak = `${a.bucket}/${a.path}`;
    const bk = `${b.bucket}/${b.path}`;
    return ak.localeCompare(bk);
  });

  return out;
}

function intersectPaths(a, b) {
  const protectedSet = new Set((b || []).map((x) => `${x.bucket}\n${x.path}`));
  return (a || []).filter((x) => protectedSet.has(`${x.bucket}\n${x.path}`));
}

function groupByBucket(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!map.has(item.bucket)) map.set(item.bucket, []);
    map.get(item.bucket).push(item.path);
  }
  return map;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function restJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const printable = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${printable}`);
  }

  return body;
}

async function rpc(supabaseUrl, serviceKey, fnName, payload) {
  return restJson(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function removeStorageBatch(supabaseUrl, serviceKey, bucket, paths) {
  return restJson(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/remove`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function countRows(supabaseUrl, serviceKey, table, dossierId) {
  const filterColumn = table === "dossiers" ? "id" : "dossier_id";
  const url = `${supabaseUrl}/rest/v1/${table}?select=id&${filterColumn}=eq.${encodeURIComponent(dossierId)}`;

  const rows = await restJson(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  return Array.isArray(rows) ? rows.length : -1;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.dossierId) {
    usage();
    throw new Error("--dossier-id is required");
  }

  assertUuid(args.dossierId, "dossier id");

  if (args.apply && !args.yes) {
    throw new Error("--apply requires --yes");
  }

  loadEnvFile(path.resolve(process.cwd(), args.envFile));

  const supabaseUrl = needEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = needEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log("ENVAL retention storage cleanup");
  console.log(`dossier_id: ${args.dossierId}`);
  console.log(`now:        ${args.now}`);
  console.log(`apply:      ${args.apply ? "YES" : "NO"}`);

  const dryRows = await rpc(supabaseUrl, serviceKey, "enval_retention_cleanup", {
    p_apply: false,
    p_now: args.now,
    p_target_dossier_id: args.dossierId,
    p_limit: 1,
  });

  if (!Array.isArray(dryRows) || dryRows.length === 0) {
    console.log("NO_CANDIDATE: retention cleanup returned no row.");
    return;
  }

  const row = dryRows[0];

  const runtimeStoragePaths = uniqObjects(row.runtime_storage_paths || []);
  const preservedStoragePaths = uniqObjects(row.preserved_storage_paths || []);
  const deletableStoragePaths = uniqObjects(row.deletable_storage_paths || []);
  const overlap = intersectPaths(deletableStoragePaths, preservedStoragePaths);

  console.log("");
  console.log("DRY RUN RESULT");
  console.log(`retention_class:          ${row.retention_class}`);
  console.log(`preserved:                ${row.preserved}`);
  console.log(`runtime_documents:        ${row.runtime_documents}`);
  console.log(`runtime_chargers:         ${row.runtime_chargers}`);
  console.log(`runtime_audit_events:     ${row.runtime_audit_events}`);
  console.log(`runtime_storage_paths:    ${runtimeStoragePaths.length}`);
  console.log(`preserved_storage_paths:  ${preservedStoragePaths.length}`);
  console.log(`deletable_storage_paths:  ${deletableStoragePaths.length}`);

  if (overlap.length > 0) {
    console.error("");
    console.error("FATAL: deletable storage intersects preserved storage.");
    console.error(JSON.stringify(overlap, null, 2));
    process.exit(1);
  }

  if (!args.apply) {
    console.log("");
    console.log("DRY_RUN_ONLY: no storage deleted and no DB cleanup applied.");
    if (deletableStoragePaths.length > 0) {
      console.log("");
      console.log("Would delete storage:");
      for (const item of deletableStoragePaths) {
        console.log(`- ${item.bucket}/${item.path}`);
      }
    }
    return;
  }

  console.log("");
  console.log("APPLY");

  if (deletableStoragePaths.length > 0) {
    const grouped = groupByBucket(deletableStoragePaths);

    for (const [bucket, paths] of grouped.entries()) {
      for (const part of chunk(paths, 1000)) {
        console.log(`Deleting storage batch: bucket=${bucket} count=${part.length}`);
        await removeStorageBatch(supabaseUrl, serviceKey, bucket, part);
      }
    }

    console.log("Storage deletion complete.");
  } else {
    console.log("No deletable storage paths. Skipping storage delete.");
  }

  const applyRows = await rpc(supabaseUrl, serviceKey, "enval_retention_cleanup_apply_after_storage", {
    p_target_dossier_id: args.dossierId,
    p_now: args.now,
    p_confirmed_deleted_storage_paths: deletableStoragePaths,
  });

  if (!Array.isArray(applyRows) || applyRows.length !== 1) {
    throw new Error(`Expected 1 apply row, got ${Array.isArray(applyRows) ? applyRows.length : "non-array"}`);
  }

  const applied = applyRows[0];

  console.log("");
  console.log("DB CLEANUP RESULT");
  console.log(`retention_class:           ${applied.retention_class}`);
  console.log(`deleted_runtime_dossier:   ${applied.deleted_runtime_dossier}`);
  console.log(`preserved:                 ${applied.preserved}`);
  console.log(`export_id:                 ${applied.export_id || ""}`);

  const proof = {
    dossiers: await countRows(supabaseUrl, serviceKey, "dossiers", args.dossierId),
    dossier_documents: await countRows(supabaseUrl, serviceKey, "dossier_documents", args.dossierId),
    dossier_chargers: await countRows(supabaseUrl, serviceKey, "dossier_chargers", args.dossierId),
    dossier_audit_events: await countRows(supabaseUrl, serviceKey, "dossier_audit_events", args.dossierId),
    dossier_sessions: await countRows(supabaseUrl, serviceKey, "dossier_sessions", args.dossierId),
    dossier_analysis_runs: await countRows(supabaseUrl, serviceKey, "dossier_analysis_runs", args.dossierId),
  };

  console.log("");
  console.log("POST CLEANUP DB PROOF");
  for (const [k, v] of Object.entries(proof)) {
    console.log(`${k}: ${v}`);
  }

  const failed = Object.entries(proof).filter(([, v]) => v !== 0);
  if (failed.length > 0) {
    throw new Error(`Runtime rows remain after cleanup: ${JSON.stringify(Object.fromEntries(failed))}`);
  }

  console.log("");
  console.log("PASS retention storage+DB cleanup");
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
