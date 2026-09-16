import { renderToStaticMarkup } from "react-dom/server";
import { DocumentFactMatrix } from "./DocumentFactMatrix.tsx";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const reviewHtml = renderToStaticMarkup(
  <DocumentFactMatrix
    columns={{
      value: "Huidige waarde",
      sources: "Gevonden in bewijs",
      actions: "Bevestiging / correctie",
      status: "Status",
    }}
    rows={[
      {
        id: "energySupplier",
        label: "Energieleverancier",
        value: "Bestaande leverancier",
        sources: "Gevonden leverancier",
        actions: <button type="button">Corrigeren</button>,
        status: <span>Controle nodig</span>,
      },
      {
        id: "serialNumber",
        label: "Serienummer",
        value: "SERIAL-1",
        sources: "—",
        actions: "Alleen-lezen",
        status: <span>Vastgelegd</span>,
      },
      {
        id: "hidden",
        hidden: true,
        label: "Niet van toepassing",
        value: "verborgen",
      },
    ]}
    variant="review"
  />,
);
assert(
  reviewHtml.includes("fact-table--five-columns") &&
    reviewHtml.includes("Huidige waarde") &&
    reviewHtml.includes("Gevonden in bewijs") &&
    reviewHtml.includes("Corrigeren") && reviewHtml.includes("Vastgelegd") &&
    !reviewHtml.includes("Niet van toepassing"),
  "Q01_review_matrix_projection_invalid",
);

const documentHtml = renderToStaticMarkup(
  <DocumentFactMatrix
    columns={{ actions: null, sources: null, status: null }}
    rows={[{ id: "summary", label: "Merk", value: "Alfen" }]}
    variant="document"
  />,
);
assert(
  documentHtml.includes("fact-table--two-columns") &&
    documentHtml.includes("Merk") && documentHtml.includes("Alfen") &&
    !documentHtml.includes("Bronnen") && !documentHtml.includes("Oordeel"),
  "Q02_document_matrix_projection_invalid",
);

const customerHtml = renderToStaticMarkup(
  <DocumentFactMatrix
    rows={[{
      id: "contract-holder",
      given: "Contracthouder",
      correctionDetails: [{
        id: "contract-holder-correction",
        reason: "Gegeven onjuist",
        instruction: "Controleer de contracthouder.",
      }],
      sources: [{
        id: "direct",
        documentLabel: "Energiedocument",
        fileName: "energie.pdf",
        value: "Daan Koote",
        relationship: "direct",
      }, {
        id: "supporting",
        documentLabel: "Installatiefactuur",
        fileName: "installatie.pdf",
        value: "D. Janssen",
        relationship: "supporting",
      }, {
        id: "missing",
        documentLabel: "Installatiefactuur",
        fileName: "tweede-installatie.pdf",
        value: null,
        relationship: "direct",
      }],
      customer: {
        id: "contract-holder:locked",
        label: "Contracthouder",
        state: "LOCKED",
        emptyValue: "",
        editor: "text",
        isValid: () => false,
      },
      enval: "Nog te beoordelen",
    }]}
    variant="customer"
  />,
);
assert(
  [
    "Gegeven",
    "Bron",
    "Info uit bron",
    "Klant",
    "ENVAL",
    "Reden",
    "Toelichting",
  ].every((label) => customerHtml.includes(`>${label}</span>`)) &&
    customerHtml.includes("Energiedocument") &&
    customerHtml.includes("Installatiefactuur") &&
    customerHtml.includes("Daan Koote") &&
    customerHtml.includes("D. Janssen") &&
    customerHtml.includes("Gegeven ontbreekt") &&
    !customerHtml.includes("energie.pdf") &&
    !customerHtml.includes("installatie.pdf") &&
    !customerHtml.includes("tweede-installatie.pdf") &&
    customerHtml.includes('class="fact-table__row-group"') &&
    customerHtml.includes(
      'aria-labelledby="customer-fact-given-contract-holder"',
    ) &&
    customerHtml.includes('aria-colspan="2"') &&
    customerHtml.includes(
      'aria-label="Energiedocument: Daan Koote"',
    ) &&
    customerHtml.includes(
      'aria-label="Installatiefactuur: D. Janssen"',
    ) &&
    customerHtml.includes(
      'data-label="Reden" role="cell"><span class="fact-review-assessment"><span>Gegeven onjuist</span>',
    ) &&
    customerHtml.includes(
      'data-label="Toelichting" role="cell"><span class="fact-review-assessment"><span>Controleer de contracthouder.</span>',
    ) &&
    !customerHtml.includes("Niet gevonden") &&
    !customerHtml.toLocaleLowerCase("nl-NL").includes("aanvullend"),
  "Q02b_supporting_relationship_visibility_invalid",
);

const [matrix, workflow, controller, signupAdapter, correctionAdapter, css] = await Promise
  .all([
    source("app/src/features/documents/DocumentFactMatrix.tsx"),
    source("app/src/features/documents/DocumentEvidenceWorkflow.tsx"),
    source("app/src/features/documents/CustomerDocumentWorkflowController.ts"),
    source("app/src/features/signup/presentation/FactTable.tsx"),
    source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
    source("app/src/styles/components.css"),
  ]);
assert(
  signupAdapter.includes("DocumentFactMatrix") &&
    correctionAdapter.includes("DocumentEvidenceWorkflow") &&
    workflow.includes("DocumentFactMatrix") &&
    (matrix.match(/export function DocumentFactMatrix/g) || []).length === 1,
  "Q03_shared_matrix_consumers_invalid",
);
assert(
  matrix.includes('role="table"') && matrix.includes('role="columnheader"') &&
    matrix.includes('role="rowgroup"') && matrix.includes('role="row"') &&
    matrix.includes('role="cell"') && matrix.includes("aria-colspan={2}") &&
    matrix.includes("data-label"),
  "Q04_matrix_semantics_or_responsive_labels_missing",
);
assert(
  signupAdapter.includes("FactReviewControls") &&
    signupAdapter.includes("source.sourceLabel") &&
    signupAdapter.includes("source.observedValue") &&
    signupAdapter.includes("judgmentClass") &&
    signupAdapter.includes('variant === "review"'),
  "Q05_signup_actions_sources_or_status_adapter_missing",
);
assert(
  correctionAdapter.includes("createCustomerDocumentWorkflowGroup") &&
    correctionAdapter.includes("actualReviewTruth") &&
    controller.includes("resolveCustomerFactResolutionPolicy") &&
    controller.includes("const directSources = sources.filter") &&
    controller.includes("CustomerDocumentFactInteractionModel") &&
    !correctionAdapter.includes("const directSources") &&
    !correctionAdapter.includes("CustomerDocumentFactInteractionModel") &&
    !correctionAdapter.includes("CorrectionValueControl") &&
    correctionAdapter.includes('"Nog te beoordelen"') &&
    correctionAdapter.includes('"Correctie nodig"'),
  "Q06_correction_matrix_adapter_missing",
);
assert(
  css.includes(".fact-table--five-columns") &&
    css.includes(".fact-table__sources") &&
    css.includes(".fact-table__row-group") &&
    css.includes(
      ".fact-table--customer .fact-table__enval .status-pill",
    ) &&
    css.includes("white-space: normal") &&
    css.includes("@media (max-width: 960px)") &&
    css.includes("@media (max-width: 700px)") &&
    css.includes("content: attr(data-label)"),
  "Q07_existing_matrix_css_or_responsive_contract_missing",
);
assert(
  ![matrix, signupAdapter, correctionAdapter].some((value) =>
    value.includes("style={{")
  ) && !matrix.match(/signing|parser|authority|responseRequirement/i),
  "Q08_inline_style_or_business_authority_in_shared_matrix",
);
assert(
  !matrix.toLocaleLowerCase("nl-NL").includes("aanvullend") &&
    !css.toLocaleLowerCase("nl-NL").includes("aanvullend"),
  "Q09_supporting_relationship_must_not_be_visible",
);

console.log("DOCUMENT_FACT_MATRIX_Q01_Q09=PASS");
console.log("AANVULLEND_VISIBLE=NO");
Deno.exit(0);
