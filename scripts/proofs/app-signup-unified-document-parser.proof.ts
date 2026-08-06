import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type { DocumentFactObservation } from "../../app/src/features/signup/documentFactRegistry.ts";
import { projectDocumentFacts } from "../../app/src/features/signup/documentSemanticProjector.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function fixture(variable: string): Promise<Uint8Array> {
  const path = Deno.env.get(variable);
  assert(path, `required_fixture_env_missing:${variable}`);
  return await Deno.readFile(path);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function withoutSource(facts: ReadonlyArray<DocumentFactObservation>) {
  return facts.map((
    { sourceDocumentId: _id, sourceDocumentType: _type, ...fact },
  ) => fact);
}

const adapterSource = await source(
  "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts",
);
const envelopeSource = await source(
  "app/src/features/invoice-analysis/documentObservationEnvelope.ts",
);
const documentsSource = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const matrixSource = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
const matrixUiSource = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);

assert(
  (adapterSource.match(/export async function parseInvoicePdfInput\(/g) || [])
        .length === 1 &&
    parseInvoicePdfInput.length === 1 &&
    documentsSource.match(/parseInvoicePdfInput\(document\.file\)/g)?.length ===
      3,
  "single_parser_entrypoint_missing",
);
for (
  const field of [
    "parserVersion",
    "contentFingerprint",
    "pageCount",
    "documentTypeCandidates",
    "factCandidates",
    "extractionWarnings",
    "rejectedCandidates",
  ]
) assert(envelopeSource.includes(field), `envelope_field_missing:${field}`);
for (
  const forbidden of [
    "checkDocumentSlotCompatibility",
    "classifyDocumentType",
    "wrong_document_type",
    "unknown_document_type",
    "Verkeerd documenttype",
    "Documenttype niet herkend",
  ]
) {
  assert(
    ![documentsSource, matrixSource, matrixUiSource].join("\n").includes(
      forbidden,
    ),
    `customer_document_type_gate_remains:${forbidden}`,
  );
}

for (
  const bytes of [
    await fixture("ENVAL_EAN_REAL_PDF"),
    await fixture("ENVAL_CHARGER_REAL_PDF"),
  ]
) {
  const left = await parseInvoicePdfInput(bytes);
  const right = await parseInvoicePdfInput(bytes);
  assert(left.ok && right.ok, "real_fixture_parse_failed");
  assert(
    left.parser_version === right.parser_version &&
      await digest(left.observation_envelope) ===
        await digest(right.observation_envelope),
    "same_bytes_same_version_envelope_drift",
  );
  const energyColumn = projectDocumentFacts(
    left.observation_envelope,
    "energy-document",
    "energy_bill_or_contract",
  );
  const chargerColumn = projectDocumentFacts(
    right.observation_envelope,
    "charger-document",
    "installation_invoice",
  );
  assert(
    await digest(withoutSource(energyColumn)) ===
      await digest(withoutSource(chargerColumn)),
    "same_bytes_generic_fact_projection_drift",
  );
}

const proofSource = await source(
  "scripts/proofs/app-signup-unified-document-parser.proof.ts",
);
assert(
  (proofSource.match(/console\.log\(/g) || []).length === 1 &&
    !/\b\d{18}\b/.test(proofSource) && !matrixUiSource.includes("style={{"),
  "proof_privacy_or_inline_css_boundary_failed",
);

console.log("signup-unified-document-parser-04-proof-ok");
