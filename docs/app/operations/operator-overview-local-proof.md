# Tenant Operator Overview Local Proof

Status: CURRENT PROVEN — LOCAL ONLY; INDEPENDENT UI REVIEW PASS.

Remote, production, deploy and final human product acceptance are not proven.

## Acceptance

- `/beheer` is a dedicated work-oriented overview, not the full dossier list.
- It shows previews only for server-proven `TO_REVIEW`, `WAITING_CUSTOMER` and
  `REVIEW_COMPLETE` dossier states.
- Each preview contains at most three items. It shows no totals or compliance
  attention section, links each group to the matching complete-list section and
  derives no security authority or business status in the browser.
- Every shown dossier uses the existing validated `/beheer/dossiers/:caseRef`
  route. `/beheer/dossiers` remains the complete authorized current-tenant
  dossier list; `/intern/compliance`, `/intern/dossiers` and
  `/intern/dossiers/:caseRef` remain compatible.
- The complete list partitions every server-projected dossier once into
  `Interne beoordeling`, `Wacht op klant`, `Afgerond` or `Overige actieve
  dossiers`; every group remains visible with a bounded empty state.
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
  review-panel, status-pill and button patterns. Desktop and narrow mobile
  remain usable without horizontal overflow; operator navigation and compact
  actions have at least 44px targets. No inline CSS is introduced.

## Local evidence

- Operator overview UI proof: `OPERATOR_OVERVIEW_UI_Q01_Q10=PASS`.
- Evidence dossier list UI proof: `EVIDENCE_REVIEW_WORKLIST_UI_Q01_Q19=PASS`.
- Evidence detail UI proof: `EVIDENCE_REVIEW_CASE_DETAIL_UI_Q01_Q20=PASS`.
- Operator authority proof: `UI01B_OPERATOR_CONTEXT_Q01_Q14=PASS`.
- Evidence authority/read proof: `EVIDENCE_REVIEW_WORKLIST_READ_Q01_Q14=PASS`,
  `DATABASE_WRITES_ON_GET=0`, `ACTIVE_TENANT_DATABASE_UNCHANGED=PASS`.
- App typecheck and production Vite build: PASS.
- Guarded production-preview browser evidence covers overview, complete list
  and detail at desktop `1440x900` and narrow mobile `375x812`; it records zero
  console errors, runtime errors, horizontal overflow and product-write
  requests.
- Fresh independent reviewer cycle 1: PASS with zero findings and zero
  unreviewed acceptance; no fix cycle was required.
