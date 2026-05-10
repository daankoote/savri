// scripts/tools/invoice-image-precheck.mjs

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = "/Users/daankoote/dev/enval";
const DEFAULT_INPUT_DIR = "/Users/daankoote/dev/enval/docs/facturen/facturen_image";
const DEFAULT_OUTPUT_JSON = "/Users/daankoote/dev/enval/scripts/tools/output/invoice-image-precheck-results.json";

function parseArgs(argv) {
  const args = {
    inputDir: DEFAULT_INPUT_DIR,
    outputJson: DEFAULT_OUTPUT_JSON,
    rareOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--input-dir") {
      args.inputDir = String(argv[++i] || "").trim();
      continue;
    }

    if (a === "--output-json") {
      args.outputJson = String(argv[++i] || "").trim();
      continue;
    }

    if (a === "--rare-only") {
      args.rareOnly = true;
      continue;
    }
  }

  return args;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function walkRecursive(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRecursive(full));
    } else {
      out.push(full);
    }
  }

  return out;
}

function isImageFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
}

function isRareInvoice(filePath) {
  return filePath.includes(`${path.sep}rare invoices${path.sep}`);
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function mimeFromPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function readRequiredTextFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.inputDir)) {
    throw new Error(`Input directory not found: ${args.inputDir}`);
  }

  let files = walkRecursive(args.inputDir).filter(isImageFile);

  if (args.rareOnly) {
    files = files.filter(isRareInvoice);
  }

  if (!files.length) {
    throw new Error(`No image files found under: ${args.inputDir}`);
  }

  const constantsJsPath = path.join(ROOT, "assets/js/analyse/analyse_image_step_1_constants.js");
  const precheckJsPath = path.join(ROOT, "assets/js/analyse/analyse_image_step_1_precheck.js");

  const constantsJs = readRequiredTextFile(constantsJsPath);
  const precheckJs = readRequiredTextFile(precheckJsPath);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("data:text/html,<html><body>invoice-precheck-runner</body></html>");

  await page.addScriptTag({
    content: `
      window.ENVAL = window.ENVAL || {};
    `,
  });

  await page.addScriptTag({ content: constantsJs });
  await page.addScriptTag({ content: precheckJs });

  const apiReady = await page.evaluate(() => {
    return !!window.ENVAL?.image_step_1_precheck?.runInvoiceImagePrecheck;
  });

  if (!apiReady) {
    throw new Error("image_step_1_precheck API not available after script injection");
  }

  const results = [];

  for (const filePath of files) {
    const buf = fs.readFileSync(filePath);
    const base64 = buf.toString("base64");
    const filename = path.basename(filePath);
    const mime = mimeFromPath(filePath);

    const result = await page.evaluate(async ({ base64, filename, mime, filePath }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], filename, { type: mime });

      const api = window.ENVAL?.image_step_1_precheck;
      if (!api?.runInvoiceImagePrecheck) {
        throw new Error("image_step_1_precheck API not available in page context");
      }

      const precheck = await api.runInvoiceImagePrecheck(file, { doc_type: "factuur" });
      const summary = api.summarizeInvoiceImagePrecheck(precheck);

      return {
        file_path: filePath,
        filename,
        ok: precheck?.ok === true,
        decision: precheck?.decision || null,
        reason: precheck?.reason || null,
        errors: Array.isArray(precheck?.errors) ? precheck.errors : [],
        warnings: Array.isArray(precheck?.warnings) ? precheck.warnings : [],
        meta: precheck?.meta || null,
        visual_prescan: precheck?.meta?.visual_prescan || null,
        rule_results: Array.isArray(precheck?.rule_results) ? precheck.rule_results : [],
        summary: summary || null,
      };
    }, { base64, filename, mime, filePath });

    results.push(result);
  }

  await browser.close();

  const totals = {
    total: results.length,
    allow: results.filter(r => r.decision === "allow").length,
    warn: results.filter(r => r.decision === "warn").length,
    reject: results.filter(r => r.decision === "reject").length,
    rare_total: results.filter(r => isRareInvoice(r.file_path)).length,
    rare_reject: results.filter(r => isRareInvoice(r.file_path) && r.decision === "reject").length,
  };

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    input_dir: args.inputDir,
    totals,
    results,
  };

  ensureParentDir(args.outputJson);
  fs.writeFileSync(args.outputJson, JSON.stringify(payload, null, 2), "utf-8");

  console.log("");
  console.log("== INVOICE IMAGE PRECHECK ==");
  console.log(`input_dir   : ${args.inputDir}`);
  console.log(`output_json : ${args.outputJson}`);
  console.log(`total       : ${totals.total}`);
  console.log(`allow       : ${totals.allow}`);
  console.log(`warn        : ${totals.warn}`);
  console.log(`reject      : ${totals.reject}`);
  console.log(`rare_total  : ${totals.rare_total}`);
  console.log(`rare_reject : ${totals.rare_reject}`);

  console.log("");
  console.log("== RARE INVOICES ==");
  for (const row of results.filter(r => isRareInvoice(r.file_path))) {
    console.log(
      `${String(row.decision || "-").toUpperCase().padEnd(6)} | ${rel(row.file_path)} | ` +
      `errors=${row.errors.join(",") || "-"} | warnings=${row.warnings.join(",") || "-"}`
    );
  }

  console.log("");
  console.log("== REJECTS ==");
  for (const row of results.filter(r => r.decision === "reject")) {
    console.log(
      `REJECT | ${rel(row.file_path)} | ` +
      `errors=${row.errors.join(",") || "-"} | warnings=${row.warnings.join(",") || "-"}`
    );
  }

  console.log("");
  console.log("Done.");
}

run().catch((err) => {
  console.error("");
  console.error("FATAL:", err?.message || err);
  process.exit(1);
});