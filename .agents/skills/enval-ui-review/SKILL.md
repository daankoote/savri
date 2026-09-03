---
name: enval-ui-review
description: Apply ENVAL-specific route, surface, authorization, presentation, white-label, terminology, and acceptance truth during an independent UI review. Use together with independent-ui-review; this adapter does not authorize product changes.
---

# ENVAL UI Review Adapter

Apply `$independent-ui-review` and the batch's supplied acceptance. This file
adds ENVAL-specific truth only.

## Authority and status

- Start at `docs/app/00_CANON.md`, then read only the relevant CURRENT contract,
  architecture section, proof, and implementation.
- Current code, schema, tests, and green proofs outrank stale documentation.
- `TARGET`, `DRAFT`, `UNKNOWN`, `LEGACY`, and `PROOF ONLY` are not implemented
  acceptance unless the supplied batch contract explicitly makes them so.
- ENVAL is desktop/tablet-first. Review supplied smaller viewports for safe
  responsive behavior without inventing a mobile product requirement.

## Routes and surfaces

- Review only the routes named by the supplied acceptance. Interpret current
  routes through the shared surface model and `SurfaceShell` patterns.
- Current customer routes include `/aanmelden`, `/account`, and `/dashboard`.
- The canonical current Tenant Operator routes are `/beheer`,
  `/beheer/dossiers`, and `/beheer/dossiers/:caseRef`.
- `/intern/compliance`, `/intern/dossiers`, and
  `/intern/dossiers/:caseRef` are temporary compatibility routes under the same
  operator authority, not separate product surfaces.
- ENVAL Control and Verifier surfaces, plus unimplemented operator modules such
  as `Klanten` and `Organisatie`, remain future work unless current canon and the
  supplied acceptance explicitly prove otherwise. Their absence is not a defect.

## Presentation invariants

- Compare shared-shell routes with the current `SurfaceShell`, layout, CSS-token,
  component, and responsive patterns; flag a route-local near-duplicate
  presentation responsibility.
- Authorization, loading, denied, error, empty, and retry presentation must stay
  consistent with the current shared patterns and supplied state acceptance.
- Capability-aware visibility must reflect the server-derived actor context and
  effective capabilities. Hidden UI never proves authorization.
- Tenant presentation is limited to controlled brand/config values. Flag
  arbitrary tenant CSS, JavaScript, HTML, per-tenant frontend forks, or branding
  presented as tenant identity, legal authority, operator status, contracting
  party, controller, fee, mandate, or verifier truth.
- A relevant operator shell renders the exact attribution `Powered by ENVAL`
  once. It is platform attribution only.
- Use existing ENVAL terminology and supplied/canonical copy. Do not propose or
  invent UI copy.
- Flag inline CSS and near-duplicate component, layout, status, notice, form,
  card, table, shell, or CSS responsibilities in the reviewed scope.

## ENVAL stop boundary

Daan retains final browser and product acceptance. A cycle-2 `FAIL` or `PARTIAL`
must set `STOP_TO_HUMAN=YES`. The reviewer never fixes findings or starts another
review. It returns findings to the implementation session after cycle 1 and then
stops.
