import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { createDocumentParserPort } from "../../platform/runtime/document-parsing/document_parser_core.ts";
import type {
  DocumentParserProfileKey,
  ParserObservationEnvelopeV1,
} from "../../platform/runtime/document-parsing/document_parser_contract.ts";
import { CURRENT_PDF_PARSER_ADAPTER } from "../../supabase/functions/_shared/app_document_parser_pdf_adapter.ts";
import { payloadHash } from "../../supabase/functions/_shared/app_foundation.ts";
import {
  customerDocumentEvidenceBindingFor,
  customerDocumentSemanticRoleFor,
  selectCustomerDocumentFactRows,
} from "../../app/src/features/signup/documentFactRegistry.ts";
import { projectCustomerDocumentFactActiveSources } from "../../app/src/features/documents/customerDocumentFactActiveSourceProjector.ts";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function pdf(lines: readonly string[]): Uint8Array {
  const hex = (value: string) =>
    Array.from(new TextEncoder().encode(value))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const stream = [
    "BT",
    "/F1 12 Tf",
    ...lines.flatMap((line, index) => [
      `1 0 0 1 72 ${720 - index * 20} Tm`,
      `<${hex(line)}> Tj`,
    ]),
    "ET",
  ].join("\n");
  return new TextEncoder().encode([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "endobj",
    "4 0 obj",
    `<< /Length ${stream.length} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "5 0 obj",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "endobj",
    "%%EOF",
  ].join("\n"));
}

async function observation(
  profile: DocumentParserProfileKey,
  lines: readonly string[],
  suffix = "default",
): Promise<ParserObservationEnvelopeV1> {
  const bytes = pdf(lines);
  const raw = await parseInvoicePdfInput(bytes);
  assert(raw.ok, `${profile}_raw_parse_failed`);
  const result = await createDocumentParserPort(
    CURRENT_PDF_PARSER_ADAPTER,
    payloadHash,
  ).parse(bytes, profile, {
    provenanceAuthority: "trusted_server",
    observationRef: `proof-${profile}-${suffix}`,
    source: {
      kind: "evidence_version",
      evidenceVersionId: "00000000-0000-4000-8000-000000000001",
      evidenceVersionRef: `proof-${profile}-${suffix}`,
    },
    byteSha256: raw.observation_envelope.contentFingerprint,
    serverObservedAt: "2026-08-22T12:00:00.000Z",
  });
  assert(
    new Set(result.observedFacts.map((fact) => fact.factKey)).size ===
      result.observedFacts.length,
    `${profile}_duplicate_fact_key_projection`,
  );
  return result;
}

async function observed(
  profile: DocumentParserProfileKey,
  lines: readonly string[],
  suffix = "default",
): Promise<Map<string, string | null>> {
  const result = await observation(profile, lines, suffix);
  return new Map(result.observedFacts.map((fact) => [
    fact.factKey,
    fact.normalizedObservedValue,
  ]));
}

const energy = await observed("energy_document_v1", [
  "Energieleverancier:Dense Energie Correct B.V.",
  "Contracthouder:Dense Browser Testklant",
  "Leveradres:Dichtestraat 10",
  "Postcode:1234AB Proefstad",
  "Elektriciteit 871685900012345678",
]);
const installation = await observed("installation_invoice_v1", [
  "Installateur:Dense Installatie Correct B.V.",
  "Klant:Dense Browser Testklant",
  "Factuuradres:Dichtestraat 10",
  "Postcode:1234AB Proefstad",
  "Merk:Dense Browser Merk",
  "Model:Dense Browser Model",
  "MID:123456789",
  "Serienummer:DENSESERIAL2026",
]);

const expectedEnergy = {
  partyName: "Dense Browser Testklant",
  structuredAddress: "Dichtestraat 10, 1234AB Proefstad",
  energySupplier: "Dense Energie Correct B.V.",
  electricityEan: "871685900012345678",
};
const expectedInstallation = {
  partyName: "Dense Browser Testklant",
  structuredAddress: "Dichtestraat 10, 1234AB Proefstad",
  chargerBrand: "Dense Browser Merk",
  chargerModel: "Dense Browser Model",
  midNumber: "123456789",
  serialNumber: "DENSESERIAL2026",
};
for (const [factKey, value] of Object.entries(expectedEnergy)) {
  assert(energy.get(factKey) === value, `energy_${factKey}_not_normalized`);
}
for (const [factKey, value] of Object.entries(expectedInstallation)) {
  assert(
    installation.get(factKey) === value,
    `installation_${factKey}_not_normalized`,
  );
}
assert(
  ![...energy.values(), ...installation.values()].some((value) =>
    /^(?:Contracthouder|Klant|Leveradres|Factuuradres)\s*:/i.test(value || "")
  ),
  "prefixed_parser_value_survived_shared_projection",
);

const installationCrossProfile = await observation(
  "installation_invoice_v1",
  [
    "Installateur:Dense Installatie Correct B.V.",
    "Klant:Dense Browser Testklant",
    "Installatieadres:Corroboratieweg 7",
    "Postcode/plaats:5678CD Teststad",
    "Elektriciteit EAN:871685900012345678",
    "Merk:Dense Browser Merk",
    "Model:Dense Browser Model",
    "MID:123456789",
    "Serienummer:DENSESERIAL2026",
  ],
  "installation-cross-profile",
);
const installationFacts = new Map(
  installationCrossProfile.observedFacts.map((fact) => [fact.factKey, fact]),
);
assert(
  installationFacts.get("electricityEan")?.normalizedObservedValue ===
      "871685900012345678" &&
    installationFacts.get("structuredAddress")?.sourceLocator
        ?.extractionMethod === "explicit_installation_address_block" &&
    !installationFacts.has("energySupplier") &&
    installationFacts.get("installerOrSupplier")?.normalizedObservedValue ===
      "Dense Installatie Correct B.V.",
  "installation_cross_profile_or_semantic_false_positive_invalid",
);

const energyCrossProfile = await observed(
  "energy_document_v1",
  [
    "Energieleverancier:Dense Energie Correct B.V.",
    "Contracthouder:Dense Browser Testklant",
    "Leveradres:Corroboratieweg 7",
    "Postcode:5678CD Teststad",
    "Elektriciteit EAN:871685900012345678",
    "Merk:Cross Profile Merk",
    "Model:Cross Profile Model",
    "MID:987654321",
    "Serienummer:CROSSSERIAL2026",
  ],
  "energy-cross-profile",
);
for (
  const [factKey, expected] of Object.entries({
    chargerBrand: "Cross Profile Merk",
    chargerModel: "Cross Profile Model",
    midNumber: "987654321",
    serialNumber: "CROSSSERIAL2026",
  })
) {
  assert(
    energyCrossProfile.get(factKey) === expected,
    `energy_cross_profile_${factKey}_missing`,
  );
}
assert(
  installationCrossProfile.profileVersion === "2" &&
    installationCrossProfile.providerAdapterVersion ===
      "2026-08-23-unified-document-v7",
  "parser_or_profile_version_not_bumped",
);

console.log("CUSTOMER04C3C3_PARSER_NORMALIZATION=PASS");
console.log("PROFILE_OUTPUT_EXCLUSIVE_ALLOWLIST_AFTER=NO");
console.log("INSTALLATION_EAN_CROSS_PROFILE_PARSE=PASS");
console.log("ENERGY_CHARGER_FACT_CROSS_PROFILE_PARSE=PASS");
console.log("SEMANTIC_FALSE_POSITIVE_REJECTION=PASS");
console.log("EXPLICIT_INSTALLATION_ADDRESS_EXTRACTOR=PASS");

if (Deno.args.length === 2) {
  async function parseCurrent(
    profile: DocumentParserProfileKey,
    path: string,
    suffix: string,
  ) {
    const bytes = await Deno.readFile(path);
    const raw = await parseInvoicePdfInput(bytes);
    assert(raw.ok, `${suffix}_current_pdf_parse_failed`);
    return await createDocumentParserPort(
      CURRENT_PDF_PARSER_ADAPTER,
      payloadHash,
    ).parse(bytes, profile, {
      provenanceAuthority: "trusted_server",
      observationRef: `proof-current-${suffix}`,
      source: {
        kind: "evidence_version",
        evidenceVersionId: suffix === "energy"
          ? "00000000-0000-4000-8000-000000000011"
          : "00000000-0000-4000-8000-000000000012",
        evidenceVersionRef: `proof-current-${suffix}`,
      },
      byteSha256: raw.observation_envelope.contentFingerprint,
      serverObservedAt: "2026-08-23T12:00:00.000Z",
    });
  }
  const currentEnergy = await parseCurrent(
    "energy_document_v1",
    Deno.args[0],
    "energy",
  );
  const currentInstallation = await parseCurrent(
    "installation_invoice_v1",
    Deno.args[1],
    "installation",
  );
  const currentDocuments = [{
    envelope: currentEnergy,
    sourceDocumentType: "energy_bill_or_contract" as const,
    sourceRef: "current-energy",
    fileName: "energy-correction.pdf",
  }, {
    envelope: currentInstallation,
    sourceDocumentType: "installation_invoice" as const,
    sourceRef: "current-installation",
    fileName: "installation-correction.pdf",
  }];
  const relationshipCounts = new Map<
    string,
    { direct: number; supporting: number }
  >();
  for (
    const definition of [
      ...selectCustomerDocumentFactRows("location"),
      ...selectCustomerDocumentFactRows("charger"),
    ]
  ) {
    const scopeRef = definition.group === "location"
      ? "location:current"
      : "charger:current";
    const projection = projectCustomerDocumentFactActiveSources(
      currentDocuments.flatMap((document) =>
        document.envelope.observedFacts.flatMap((fact) => {
          if (
            fact.status !== "observed" || fact.factKey !== definition.factKey
          ) return [];
          const semanticRole = customerDocumentSemanticRoleFor(
            fact.factKey,
            fact.sourceLocator?.extractionMethod,
          );
          const relationship = customerDocumentEvidenceBindingFor(definition, {
            sourceDocumentType: document.sourceDocumentType,
            semanticRole,
          })?.relationship || null;
          return [Object.freeze({
            sourceRef: `${document.sourceRef}:${definition.id}`,
            evidenceRootRef: document.sourceRef,
            fileName: document.fileName,
            canonicalFactKey: fact.factKey,
            scopeRef,
            comparisonRole: definition.id,
            sourceDocumentType: document.sourceDocumentType,
            semanticRole,
            relationship,
            observedValue: fact.normalizedObservedValue,
            current: true,
          })];
        })
      ),
    );
    relationshipCounts.set(definition.id, {
      direct: projection.directSources.length,
      supporting: projection.supportingSources.length,
    });
  }
  assert(
    relationshipCounts.get("location:party-name")?.direct === 1 &&
      relationshipCounts.get("location:party-name")?.supporting === 1 &&
      relationshipCounts.get("location:structured-address")?.direct === 1 &&
      relationshipCounts.get("location:structured-address")?.supporting === 1 &&
      relationshipCounts.get("location:electricity-ean")?.direct === 1 &&
      relationshipCounts.get("location:energy-supplier")?.direct === 1 &&
      [
        "charger:brand",
        "charger:model",
        "charger:serial-number",
        "charger:mid-number",
      ]
        .every((id) => relationshipCounts.get(id)?.direct === 1),
    "current_two_pdf_relationship_pattern_invalid",
  );
  const parserOnlyMetadata = new Set(
    [
      ...currentEnergy.observedFacts,
      ...currentInstallation.observedFacts,
    ].filter((fact) => fact.status === "observed").map((fact) => fact.factKey),
  );
  const customerRowFacts = new Set([
    ...selectCustomerDocumentFactRows("location"),
    ...selectCustomerDocumentFactRows("charger"),
  ].map((row) => row.factKey));
  assert(
    parserOnlyMetadata.has("contractStart") &&
      parserOnlyMetadata.has("installerOrSupplier") &&
      parserOnlyMetadata.has("invoiceDate") &&
      !customerRowFacts.has("contractStart") &&
      !customerRowFacts.has("installerOrSupplier") &&
      !customerRowFacts.has("invoiceDate"),
    "parser_only_metadata_retention_or_matrix_boundary_invalid",
  );
  console.log("CURRENT_TWO_PDFS_RELATIONSHIP_PATTERN=PASS");
  console.log("CURRENT_TWO_PDFS_CLEAN_CONFIRM_EXPECTED=NONE");
  console.log("PARSER_ONLY_METADATA_RETAINED=PASS");
  console.log("PARSER_ONLY_METADATA_FORCED_INTO_CUSTOMER_MATRIX=NO");
}
