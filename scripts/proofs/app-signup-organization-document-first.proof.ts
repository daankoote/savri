import {
  parseInvoicePdfInput,
  UNIFIED_DOCUMENT_PARSER_VERSION,
} from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type {
  DocumentObservationEnvelope,
  GenericDocumentFactCandidate,
} from "../../app/src/features/invoice-analysis/documentObservationEnvelope.ts";
import {
  createDocumentFirstSignupDraftFromLegacy,
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
  documentFirstSignupToLegacyDraft,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import { selectStepCompleteness } from "../../app/src/features/signup/documentFirstSignupSelectors.ts";
import {
  selectDocumentReviewMatrix,
  selectOrganizationDocumentReviewRows,
} from "../../app/src/features/signup/documentReviewMatrix.ts";
import { projectDocumentFacts } from "../../app/src/features/signup/documentSemanticProjector.ts";
import { transitionSignupAccountType } from "../../app/src/features/signup/signupAccountTypeTransition.ts";

const marker = "signup-organization-document-first-07-proof-ok";
const organizationFactKeys = [
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
] as const;
const visibleOrganizationFactKeys = organizationFactKeys.filter((factKey) =>
  factKey !== "directorTitle"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../${path}`, import.meta.url));
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(path: string): Promise<string> {
  return await digest(
    await Deno.readFile(new URL(`../../${path}`, import.meta.url)),
  );
}

async function valueDigest(value: string): Promise<string> {
  return await digest(new TextEncoder().encode(value));
}

function candidate(
  factKey: GenericDocumentFactCandidate["factKey"],
  normalizedValue: string,
): GenericDocumentFactCandidate {
  return {
    factKey,
    rawValue: normalizedValue,
    normalizedValue,
    sourcePage: 1,
    sourceRegion: `page:1:organization_extract_${factKey}`,
    confidence: "high",
    extractionMethod: `organization_extract_${factKey}`,
    displayable: true,
    rejectionReason: null,
  };
}

function organizationEnvelope(): DocumentObservationEnvelope {
  return {
    parserVersion: UNIFIED_DOCUMENT_PARSER_VERSION,
    contentFingerprint: "organization-proof-fingerprint",
    pageCount: 2,
    documentTypeCandidates: [{
      documentType: "organization_extract",
      score: 16,
      indicators: ["registration_number", "registered_address"],
    }],
    factCandidates: [
      candidate("organizationName", "Voorbeeld Organisatie"),
      candidate("kvkNumber", "12345678"),
      candidate("registeredAddress", "Voorbeeldstraat 1, 1234 AB Plaats"),
      candidate("legalForm", "Besloten vennootschap"),
      candidate("tradeName", "Voorbeeld Handelsnaam"),
      candidate("directorOrBoardMember", "Waargenomen persoon"),
      candidate("directorTitle", "Directeur"),
      candidate(
        "representationAuthorityText",
        "Gezamenlijke vertegenwoordiging",
      ),
    ],
    extractionWarnings: [],
    rejectedCandidates: [],
  };
}

const expectedDutchMethods = {
  organizationName: "organization_extract_dutch_statutaire_naam",
  kvkNumber: "organization_extract_dutch_kvk_nummer",
  registeredAddress: "organization_extract_dutch_bezoekadres",
  legalForm: "organization_extract_dutch_rechtsvorm",
  tradeName: "organization_extract_dutch_handelsnaam",
  directorOrBoardMember: "organization_extract_dutch_bestuurder_naam",
  directorTitle: "organization_extract_dutch_titel",
  representationAuthorityText: "organization_extract_dutch_bevoegdheid",
} as const;

const expectedDutchValueDigests = {
  organizationName:
    "8d88da44f3a5e9274efeef6b9630d1ac63fe50057238db4212d595262d953600",
  kvkNumber:
    "fb1d2f9e0f0425e245232f3d818e9349c4e207ecaab14baff244fa5f4f9b8705",
  registeredAddress:
    "3950a13ff6be403612fdd65e1e3afbe9ab60b86fde063b0c748e77bf493fee7d",
  legalForm:
    "3494680efdc1d1cec4f65b41e28b3f3427dd14a8ba4e416f42ac639cb66e55c6",
  tradeName:
    "8d88da44f3a5e9274efeef6b9630d1ac63fe50057238db4212d595262d953600",
  directorOrBoardMember:
    "bf970919ecddaacaceb8c2a3fc5cd069e72e51d4c51e4ac82a6e5745878e6aeb",
  directorTitle:
    "0da2b4df49d5d0d48015613ece980d352c153d736202e02b1a9d0f51acf95bb2",
  representationAuthorityText:
    "f2363e103c4ccd7f9f32c27e856fb3f194e706a35c41de6a5ca64c6d62cdd497",
} as const;

async function proveDutchFixture(path: string) {
  assert(path, "Nederlandse KvK-fixture ontbreekt");
  const bytes = await Deno.readFile(path);
  const first = await parseInvoicePdfInput(bytes);
  const second = await parseInvoicePdfInput(bytes);
  assert(first.ok && second.ok, "Nederlandse KvK-fixture parseert niet");
  assert(
    first.parser_version === UNIFIED_DOCUMENT_PARSER_VERSION &&
      first.observation_envelope.parserVersion ===
        UNIFIED_DOCUMENT_PARSER_VERSION,
    "Nederlandse fixture gebruikt niet de ene actuele parser",
  );
  assert(
    first.observation_envelope.contentFingerprint ===
      second.observation_envelope.contentFingerprint,
    "Nederlandse fixture is niet deterministisch",
  );
  const candidates = first.observation_envelope.factCandidates.filter((fact) =>
    fact.displayable && organizationFactKeys.includes(
      fact.factKey as (typeof organizationFactKeys)[number],
    )
  );
  for (const factKey of organizationFactKeys) {
    const matches = candidates.filter((fact) => fact.factKey === factKey);
    assert(matches.length === 1, `Nederlandse fixture mist exact ${factKey}`);
    const fact = matches[0];
    assert(
      fact.extractionMethod === expectedDutchMethods[factKey],
      `${factKey} komt niet uit het exacte Nederlandse label`,
    );
    assert(
      await valueDigest(fact.normalizedValue) ===
        expectedDutchValueDigests[factKey],
      `${factKey} is ten opzichte van zijn label verschoven`,
    );
    assert(
      fact.sourcePage ===
        (factKey === "directorTitle" ||
            factKey === "representationAuthorityText"
          ? 2
          : 1),
      `${factKey} heeft de verkeerde paginabinding`,
    );
  }
  const byKey = new Map(candidates.map((fact) => [fact.factKey, fact]));
  const kvk = byKey.get("kvkNumber")?.normalizedValue || "";
  const address = byKey.get("registeredAddress")?.normalizedValue || "";
  const legalForm = byKey.get("legalForm")?.normalizedValue || "";
  const tradeName = byKey.get("tradeName")?.normalizedValue || "";
  const director = byKey.get("directorOrBoardMember")?.normalizedValue || "";
  const title = byKey.get("directorTitle")?.normalizedValue || "";
  const authority = byKey.get("representationAuthorityText")?.normalizedValue ||
    "";
  assert(/^\d{8}$/.test(kvk), "KvK-nummer is geen begrensd achtcijferig veld");
  assert(
    /\b\d{4}\s?[A-Z]{2}\b/i.test(address),
    "Bezoekadres is niet als volledig adres begrensd",
  );
  assert(
    !/^\d+$/.test(legalForm.replace(/\s/g, "")),
    "RSIN is als rechtsvorm gebruikt",
  );
  assert(
    !/^\d+$/.test(tradeName.replace(/\s/g, "")),
    "Vestigingsnummer is als handelsnaam gebruikt",
  );
  assert(
    !/\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}/.test(director) &&
      !/\d/.test(director),
    "Datum of geboortedatum is als bestuurder gebruikt",
  );
  assert(
    title !== authority && /directeur/i.test(title) &&
      !/^directeur$/i.test(authority),
    "Titel en bevoegdheid zijn verschoven",
  );
  assert(
    first.observation_envelope.factCandidates.every((fact) =>
      fact.sourcePage !== null && fact.extractionMethod !== "filename"
    ),
    "Nederlandse fixture bevat ongebonden of filename-afgeleide feiten",
  );
}

async function proveOptionalEnglishFixture(path: string) {
  if (!path) return;
  const bytes = await Deno.readFile(path);
  const first = await parseInvoicePdfInput(bytes);
  const second = await parseInvoicePdfInput(bytes);
  assert(first.ok && second.ok, "Engelse registerfixture parseert niet");
  assert(
    first.observation_envelope.contentFingerprint ===
      second.observation_envelope.contentFingerprint,
    "Engelse registerfixture is niet deterministisch",
  );
  assert(
    first.observation_envelope.factCandidates.every((fact) =>
      fact.extractionMethod !== "filename"
    ),
    "Engelse registerfixture gebruikt bestandsnaamafleiding",
  );
}

const dutchFixture = Deno.env.get("ENVAL_KVK_DUTCH_PDF") || "";
const englishFixture = Deno.env.get("ENVAL_KVK_ENGLISH_PDF") || "";
await proveDutchFixture(dutchFixture);
await proveOptionalEnglishFixture(englishFixture);

const nonDocument = await parseInvoicePdfInput(
  new TextEncoder().encode("organizationName kvkNumber registeredAddress"),
);
assert(nonDocument.ok, "Niet-PDF bytes moeten veilig zonder facts eindigen");
assert(
  nonDocument.observation_envelope.factCandidates.every((fact) =>
    !organizationFactKeys.includes(
      fact.factKey as (typeof organizationFactKeys)[number],
    )
  ),
  "Organisatiefeiten mogen niet uit bytes of uploadslot ontstaan",
);

let business = createFreshDocumentFirstSignupDraft("zakelijk");
business = documentFirstSignupReducer(business, {
  type: "update_account_basis",
  value: { accountType: "zakelijk", email: "pilot@example.test" },
});
assert(
  !selectStepCompleteness(business).account,
  "Zakelijk mag zonder KvK-document en kernbevestigingen niet verder",
);
const locationId = business.locationOrder[0];
const chargerId = business.chargerOrderByLocationId[locationId][0];
let accountRows = selectOrganizationDocumentReviewRows(business);
let matrix = selectDocumentReviewMatrix(business, locationId, chargerId);
assert(
  visibleOrganizationFactKeys.every((factKey) =>
    accountRows.some((row) => row.factKey === factKey)
  ),
  "Stap 1 mist de begrensde organizationfactset",
);
assert(
  !matrix.showOrganizationDocument &&
    matrix.rows.every((row) => !organizationFactKeys.includes(
      row.factKey as (typeof organizationFactKeys)[number],
    )),
  "Stap 2 bevat accountgebonden organisatiegegevens",
);

for (
  const [factKey, value] of [
    ["organizationName", "Handmatig Organisatie"],
    ["kvkNumber", "87654321"],
    ["registeredAddress", "Handmatig adres"],
  ] as const
) {
  business = documentFirstSignupReducer(business, {
    type: "set_manual_correction",
    factKey: `account:${factKey}`,
    canonicalFactKey: factKey,
    value,
    sourceDocumentId: business.organizationDocument.clientId,
    sourceDocumentType: "organization_extract",
    observedFact: null,
    correctionType: "parser_correction",
    confirmedAt: "2026-08-04T00:00:00.000Z",
    pendingPersistence: false,
  });
  business = documentFirstSignupReducer(business, {
    type: "confirm_fact",
    factKey: `account:${factKey}`,
    canonicalFactKey: factKey,
    value,
    sourceDocuments: [{
      documentId: business.organizationDocument.clientId,
      documentType: "organization_extract",
    }],
    confirmedAt: "2026-08-04T00:00:00.000Z",
    decisionStatus: "review_required",
    normalizationApplied: false,
    pendingPersistence: false,
  });
}
assert(
  !selectStepCompleteness(business).account,
  "Handmatige waarden mogen het KvK-documentvereiste niet omzeilen",
);

const selectedFile = new File([new Uint8Array([1, 2, 3])], "document.pdf", {
  type: "application/pdf",
});
business = documentFirstSignupReducer(business, {
  type: "update_organization_document",
  document: {
    ...business.organizationDocument,
    file: selectedFile,
    status: "selected",
    parseStatus: "parsed",
  },
});
business = documentFirstSignupReducer(business, {
  type: "set_document_observation",
  documentId: business.organizationDocument.clientId,
  value: {
    documentId: business.organizationDocument.clientId,
    contentFingerprint: "organization-proof-fingerprint",
    parserVersion: UNIFIED_DOCUMENT_PARSER_VERSION,
    envelope: organizationEnvelope(),
  },
});
accountRows = selectOrganizationDocumentReviewRows(business);
for (const factKey of [
  "organizationName",
  "kvkNumber",
  "registeredAddress",
] as const) {
  const row = accountRows.find((candidate) => candidate.factKey === factKey);
  assert(row?.proposedValue, `Bevestigingswaarde ontbreekt voor ${factKey}`);
  business = documentFirstSignupReducer(business, {
    type: "confirm_fact",
    factKey: row.scopeKey,
    canonicalFactKey: row.factKey,
    value: row.proposedValue,
    sourceDocuments: row.sourceDocuments,
    confirmedAt: "2026-08-04T00:00:00.000Z",
    decisionStatus: "clean_match",
    normalizationApplied: false,
    pendingPersistence: false,
  });
}
assert(
  selectStepCompleteness(business).account,
  "Document plus drie bevestigde kernfacts opent Stap 2 niet",
);

accountRows = selectOrganizationDocumentReviewRows(business);
const originalObservation = accountRows.find((row) =>
  row.factKey === "organizationName"
)?.observations[0];
business = documentFirstSignupReducer(business, {
  type: "set_manual_correction",
  factKey: "account:organizationName",
  canonicalFactKey: "organizationName",
  value: "Handmatig aangepast",
  sourceDocumentId: business.organizationDocument.clientId,
  sourceDocumentType: "organization_extract",
  observedFact: originalObservation || null,
  correctionType: "parser_correction",
  confirmedAt: "2026-08-04T00:00:00.000Z",
  pendingPersistence: false,
});
business = documentFirstSignupReducer(business, {
  type: "confirm_fact",
  factKey: "account:organizationName",
  canonicalFactKey: "organizationName",
  value: "Handmatig aangepast",
  sourceDocuments: [{
    documentId: business.organizationDocument.clientId,
    documentType: "organization_extract",
  }],
  confirmedAt: "2026-08-04T00:00:00.000Z",
  decisionStatus: "review_required",
  normalizationApplied: false,
  pendingPersistence: false,
});
accountRows = selectOrganizationDocumentReviewRows(business);
const correctedOrganization = accountRows.find((row) =>
  row.factKey === "organizationName"
);
assert(
  correctedOrganization?.decisionStatus === "review_required" &&
    correctedOrganization.correctedManually &&
    correctedOrganization.observations.some((observation) =>
      observation.value === originalObservation?.value
    ),
  "Manual correction bewaart observation/review_required niet",
);

const projected = projectDocumentFacts(
  organizationEnvelope(),
  "account-document",
  "organization_extract",
);
assert(
  projected.find((fact) => fact.factKey === "directorTitle")?.semanticRole ===
      "director_title" &&
    projected.every((fact) => fact.factKey !== ("birthDate" as never)),
  "Titel ontbreekt of geboortedatum bereikt het generic model",
);

const privateTransition = transitionSignupAccountType(
  documentFirstSignupToLegacyDraft(business),
  "particulier",
  true,
);
assert(privateTransition.changed, "Zakelijk naar Particulier wisselt niet");
const privateDraft = createDocumentFirstSignupDraftFromLegacy(
  privateTransition.draft,
);
assert(
  privateDraft.organizationDocument.file === null &&
    Object.keys(privateDraft.parserObservations.byDocumentId).length === 0 &&
    Object.keys(privateDraft.customerConfirmations).length === 0 &&
    Object.keys(privateDraft.manualCorrections).length === 0 &&
    !privateDraft.legalParty.legalName && !privateDraft.legalParty.kvkNumber,
  "Zakelijk naar Particulier wist organizationstate niet volledig",
);
const businessAgain = createDocumentFirstSignupDraftFromLegacy(
  transitionSignupAccountType(
    documentFirstSignupToLegacyDraft(privateDraft),
    "vve",
    true,
  ).draft,
);
assert(
  businessAgain.organizationDocument.file === null &&
    Object.keys(businessAgain.parserObservations.byDocumentId).length === 0 &&
    Object.keys(businessAgain.customerConfirmations).length === 0 &&
    Object.keys(businessAgain.manualCorrections).length === 0,
  "Particulier naar VvE herstelt verborgen organizationstate",
);

const parserSource = await source(
  "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const personalInfo = await source(
  "app/src/features/signup/PersonalInfoSection.tsx",
);
const organizationPanel = await source(
  "app/src/features/signup/OrganizationDocumentStepPanel.tsx",
);
const documentsStep = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const matrixUi = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const modelSource = await source(
  "app/src/features/signup/documentFirstSignupModel.ts",
);
const mapper = await source("app/src/features/signup/signupSubmitMapper.ts");
const englishAliasBlock = parserSource.slice(
  parserSource.indexOf("const ENGLISH_ORGANIZATION_LABELS"),
  parserSource.indexOf("const ORGANIZATION_SECTION_LABELS"),
);
for (
  const alias of [
    "legal name",
    "company name",
    "trade register number",
    "chamber of commerce number",
    "registered address",
    "legal form",
    "trade name",
    "director",
    "board member",
    "title",
    "authority",
    "signing authority",
  ]
) assert(englishAliasBlock.includes(`"${alias}"`), `Engelse alias mist: ${alias}`);
assert(
  !/"(?:entity name|legal entity|registration|powers?|authori[sz]ed|visiting address)"/
    .test(englishAliasBlock),
  "Fuzzy Engelse organisatiealias is teruggekeerd",
);
assert(
  personalInfo.includes("<span>E-mail</span>") &&
    shell.includes("OrganizationDocumentStepPanel") &&
    shell.includes('accountType !== "particulier"') &&
    organizationPanel.includes("KvK-uittreksel") &&
    organizationPanel.includes("Controleer de organisatiegegevens") &&
    !organizationPanel.includes("parseInvoicePdfInput"),
  "Stap 1 presenteert de accountgebonden KvK-flow niet begrensd",
);
assert(
  !documentsStep.includes("KvK-uittreksel") &&
    !documentsStep.includes("organizationDocument") &&
    !matrixUi.includes("KvK-uittreksel") &&
    !matrixUi.includes("organizationDocument") &&
    !matrixUi.includes("document-first-matrix-with-organization"),
  "Stap 2 bevat nog KvK-upload, KvK-kolom of organizationdata",
);
assert(
  ![shell, personalInfo, organizationPanel, documentsStep, matrixUi].some(
    (text) => text.includes("style={{"),
  ),
  "Signup organization UI bevat inline CSS",
);
assert(
  ![shell, personalInfo, organizationPanel, documentsStep, matrixUi, modelSource]
    .some((text) => /geboortedatum|birth\s*date/i.test(text)),
  "Geboortedatum bereikt model of UI",
);
assert(
  !/bevoegd ondertekenaar|geverifieerd|goedgekeurd|bevoegdheid bevestigd/i
    .test([shell, personalInfo, organizationPanel, documentsStep, matrixUi].join(
      "\n",
    )),
  "Niet-toegestane organisatiecopy is aanwezig",
);
assert(
  !mapper.includes("organizationDocument") &&
    !mapper.includes("directorTitle") &&
    !mapper.includes("representationAuthorityText") &&
    !mapper.includes("registeredAddress"),
  "Accountdocument of parserfacts lekken naar de submitmapper",
);

const protectedHashes = {
  "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql":
    "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
  "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql":
    "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
  "supabase/functions/api-app-signup-submit/index.ts":
    "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
} as const;
for (const [path, expected] of Object.entries(protectedHashes)) {
  assert(
    await sha256(path) === expected,
    `Beschermd backendbestand gewijzigd: ${path}`,
  );
}

console.log(marker);
