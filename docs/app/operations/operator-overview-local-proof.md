# Tenant Operator Overview Local Proof

Status: CURRENT PROVEN — LOCAL ONLY; INDEPENDENT UI REVIEW PASS.

Remote, production, deploy and final human product acceptance are not proven.

## Acceptance

- `/beheer` is a dedicated work-oriented overview, not the full dossier list.
- It shows previews only for server-proven `TO_REVIEW` and `WAITING_CUSTOMER`
  dossier states.
- Each preview contains at most three items. It shows no totals, compliance
  attention section or duplicate route to all dossiers and derives no security
  authority or business status in the browser.
- Every shown dossier uses the existing validated `/beheer/dossiers/:caseRef`
  route. `/beheer/dossiers` remains the complete authorized current-tenant
  dossier list; `/intern/compliance`, `/intern/dossiers` and
  `/intern/dossiers/:caseRef` remain compatible.
- Existing server-derived tenant, active-workforce, exact dossier-scope and
  capability boundaries remain unchanged. Non-workforce, inactive workforce,
  missing scope and cross-tenant access remain denied.
- `TO_REVIEW` proves that no exact finalized round covers every current manifest
  subject. `WAITING_CUSTOMER` requires that complete round plus a current
  published, unanswered customer-correction handoff for the same manifest.
- A finalized subject decision takes precedence in the existing fact-status
  presentation, so a row no longer presents `Beoordeling nodig` together with
  the finalized `Geaccepteerd` decision.
- The shared tenant-operator shell, `Overzicht` and `Dossiers` navigation, and
  exactly one `Powered by ENVAL` attribution remain in use.
- Loading, empty and error states reuse the existing portal card, row,
  review-panel, status-pill and button patterns. Desktop and tablet remain
  usable. No inline CSS or new CSS is introduced.

## Local evidence

- Operator overview UI proof: `OPERATOR_OVERVIEW_UI_Q01_Q10=PASS`.
- Evidence dossier list UI proof: `EVIDENCE_REVIEW_WORKLIST_UI_Q01_Q19=PASS`.
- Evidence detail UI proof: `EVIDENCE_REVIEW_CASE_DETAIL_UI_Q01_Q20=PASS`.
- Operator authority proof: `UI01B_OPERATOR_CONTEXT_Q01_Q14=PASS`.
- Evidence authority/read proof: `EVIDENCE_REVIEW_WORKLIST_READ_Q01_Q14=PASS`,
  `DATABASE_WRITES_ON_GET=0`, `ACTIVE_TENANT_DATABASE_UNCHANGED=PASS`.
- App typecheck and production Vite build: PASS.
- Guarded production-preview browser evidence for `/beheer`: desktop `1440x900`,
  tablet `900x1024` and tall desktop `1440x1100`; zero console errors, runtime
  errors and product-write requests.
- Fresh independent reviewer cycle 1: PASS with zero findings and zero
  unreviewed acceptance; no fix cycle was required.
