# PILOT-SIGNUP-UNIFIED-PRESENTATION-08 local proof

Status: LOCAL FRONTEND SOURCE/PROOF ONLY

## Scope

This batch consolidates signup presentation only. One React-free projector
feeds one `FactTable` family and one `FactReviewControls`; one configurable
`DocumentUploadSlot` remains the upload surface for account, location and
charger documents.

Applicability controls row visibility. Existing observation, decision,
confirmation, correction and canonical-value state remains authoritative.
Parser, semantic projection, EAN/KvK rules, mapper, client contract, backend,
database and remote state are protected and unchanged.

## Local checks

The targeted marker is:

`signup-unified-presentation-08-proof-ok`

The bounded verification set consists of the unified-presentation proof,
organization document-first proof, generic facts proof, fact applicability
proof, document decision proof, document-first UI proof, journey proof,
typecheck, production build and `git diff --check`.

## Boundary

The Step 3 document is a read-only review projection. This result proves no
browser interaction, signing or legal copy, immutable snapshot, persistence,
submit, dossier creation, production behavior, remote integration or
verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
