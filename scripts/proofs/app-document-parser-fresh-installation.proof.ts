import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { createDocumentParserPort } from "../../platform/runtime/document-parsing/document_parser_core.ts";
import type { DocumentFactKey } from "../../platform/runtime/document-parsing/document_fact_vocabulary.ts";
import { CURRENT_PDF_PARSER_ADAPTER } from "../../supabase/functions/_shared/app_document_parser_pdf_adapter.ts";
import { payloadHash } from "../../supabase/functions/_shared/app_foundation.ts";

declare const Deno: {
  args: string[];
  exit(code: number): never;
  readFile(path: string): Promise<Uint8Array>;
};

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const path = Deno.args[0];
assert(path, "fresh_installation_pdf_path_required");
const bytes = await Deno.readFile(path);
assert(bytes.length > 0, "fresh_installation_pdf_empty");

const raw = await parseInvoicePdfInput(bytes);
assert(raw.ok, "fresh_installation_raw_parse_failed");
const observation = await createDocumentParserPort(
  CURRENT_PDF_PARSER_ADAPTER,
  payloadHash,
).parse(bytes, "installation_invoice_v1", {
  provenanceAuthority: "trusted_server",
  observationRef: "PROOF-CUSTOMER04C3C4-FRESH-INSTALLATION",
  source: {
    kind: "correction_replacement_candidate",
    replacementCandidateId: "00000000-0000-4000-8000-000000000004",
    replacementCandidateRef: "PROOF-CUSTOMER04C3C4-CANDIDATE",
    evidenceVersionRef: "PROOF-CUSTOMER04C3C4-EVIDENCE",
  },
  byteSha256: raw.observation_envelope.contentFingerprint,
  serverObservedAt: "2026-08-22T16:45:00.000Z",
});

assert(
  observation.parserProfile === "installation_invoice_v1",
  "fresh_installation_wrong_profile",
);
assert(
  new Set(observation.observedFacts.map((fact) => fact.factKey)).size ===
    observation.observedFacts.length,
  "fresh_installation_duplicate_fact_keys",
);

const values = new Map(observation.observedFacts.map((fact) => [
  fact.factKey,
  fact.normalizedObservedValue,
]));
const expected = new Map<DocumentFactKey, string>([
  ["partyName", "Dense Browser Testklant"],
  ["structuredAddress", "Dichtestraat 10, 1234AB Proefstad"],
  ["chargerBrand", "Dense Browser Merk"],
  ["chargerModel", "Dense Browser Model"],
  ["midNumber", "123456789"],
  ["serialNumber", "DENSESERIAL2026"],
]);

for (const [factKey, expectedValue] of expected) {
  assert(
    values.get(factKey) === expectedValue,
    `fresh_installation_${factKey}_unexpected:${
      values.get(factKey) ?? "MISSING"
    }`,
  );
}

const normalizedValues = [...values.values()].filter((value): value is string =>
  Boolean(value)
);
const prefixed = normalizedValues.some((value) =>
  /^(?:Klant|Factuuradres|Merk|Model|MID|Serienummer)\s*:/i.test(value)
);
const canonicalExpectedValues = [...expected.values()];
const aggregated = normalizedValues.some((value) =>
  canonicalExpectedValues.filter((expectedValue) =>
    value.includes(expectedValue)
  )
    .length > 1
);
assert(!prefixed, "fresh_installation_prefixed_value");
assert(!aggregated, "fresh_installation_aggregate_value");

console.log("CUSTOMER04C3C4_FRESH_INSTALLATION_PARSER=PASS");
for (const [factKey, expectedValue] of expected) {
  console.log(`FRESH_${factKey}=${expectedValue}`);
}
console.log("PREFIXED_VALUES_IN_FRESH_PARSE=NO");
console.log("AGGREGATED_MULTI_FACT_VALUE_IN_FRESH_PARSE=NO");
Deno.exit(0);
