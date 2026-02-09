
access-save en access-update

Mini TODO (alleen als notitie, geen code-change nu)

Niet kritisch, maar slim voor later:

Consolideer access-save en access-update in Phase-2 (minder drift risico).

Overweeg audit event access_updated uit te breiden met een veld mode: "save"|"patch" (Phase-2). Niet nodig nu.





api-dossier-address-preview  en. api-dossier-address-verify 

Belangrijke TODO’s (geen code-change, maar wél opnemen)

Ambiguity check (P1.5)
Zonder suffix kan verify/save een verkeerd adres “bevestigen”. Dat is audit/claim-risk. Jij hebt dit al gemerkt. Dit moet in Phase-2 of 1.5.

Consistency drift: PDOK parsing verschilt per endpoint

address-preview gebruikt simpele pdokLookup() met score sorting.

address-save (die jij eerder plakte) gebruikt uitgebreidere suffix-matching.

address-verify zit ertussen.
→ Dit is onderhoudsschuld: later één shared PDOK resolver (zelfde matching/ambiguity regels) gebruiken.

Typo/naam drift in pad
Je comment zegt api-dossier-addres-preview (missende ‘s’). Als dat ook echt zo deployed is, is dit een bron van “waarom werkt UI niet” ellende. Zet dit als check/TODO in docs: canonical function name + repo folder name moeten exact matchen.



api-dossier-charger-delete  en api-dossier-charger-save 

2 dingen waar je jezelf nu mee voor de gek houdt (dus noteer ze als TODO)

Idempotency discipline is niet uniform
Je zegt “Idempotency verplicht overal”, maar charger-save slipt er tussendoor met request_id fallback. Dat is niet “verplicht”, dat is “we hopen dat request_id uniek genoeg is”. Schrijf dit als Phase-2 cleanup: alle write endpoints strict Idempotency-Key.

Orphaned storage is bewust geaccepteerd
Dat is oké voor MVP, maar doe niet alsof het “opgeruimd” is. Het is “opgeruimd tenzij storage faalt, dan loggen we het”. Ook prima — maar je móét later een reconciler/cleanup job plannen.


doc-delete + upload-url

Phase-1.5 / Phase-2 TODO’s (niet nu refactoren)
1) Storage orphan risk (accepteer, maar benoem)
- doc-delete: DB delete eerst, storage later fail-open.
- Bij storage failure blijft object bestaan zonder DB row.
Actie: Phase-2 “reconciler/cleanup job” op basis van audit events document_delete_storage_failed.

2) Upload-url ordering (klein maar echt)
- We genereren signed upload URL vóór metadata insert.
- Als metadata insert faalt, kan er een “geldige upload token” bestaan zonder DB row.
Actie (Phase-2): eerst metadata row (status='issued') insert, daarna signed url genereren,
OF bij insert failure expliciet signed token ongeldig maken (als dat kan) of markeer row rejected.

3) size_bytes vertrouwen
- size_bytes komt van client. We gebruiken het alleen voor gating (15MB) en opslaan.
Actie (Phase-2): in confirm stap ook server-side verificatie (HEAD/metadata) of hardere check.

4) Consistentie: doc-delete gebruikt shared idempotency helper, upload-url nog “inline”
- Niet functioneel fout, maar inconsistent.
Actie (Phase-2): standaardiseer op één shared helper voor alle write endpoints.

De 2 echte risico’s die jij anders vergeet (dus moet je nu als TODO loggen)

Upload-url maakt eerst signed URL, dan pas DB row
Dat is een race-condition/“ghost upload” risico. Niet dodelijk, maar je móét het later fixen of expliciet accepteren in audit (“issued_url_without_db_row_possible_on_db_error”).

Orphaned storage is real
Je weet het al. Je accepteert het. Prima. Maar Phase-2 reconciler is geen luxe; zonder dat ga je storage vervuilen en later “waarom staat dit bestand hier zonder document?” vragen krijgen.


api-dossier-upload-confirm (server-side verify) + Read model (api-dossier-get) + Review checks/lock (api-dossier-evaluate)

Phase-1.5 / Phase-2 TODO’s (dit zijn echte risico’s, dus expliciet loggen)
A) Performance / cost: server-side download+sha256 in upload-confirm
- storage.download + arrayBuffer + sha256 is expensive en kan timeouts geven bij drukte of grote files.
- We houden dit nu voor audit correctness.
- Phase-2 ontwerp: alternatief verify model (metadata/HEAD + constraints + background verifier) na volledige migratie.

B) “Possession of link = email verified” is een audit-leugen als je het “verified” noemt
- api-dossier-get zet email_verified_at bij eerste access.
- Dit moet in audit expliciet “assumption” blijven (nu gedaan).
- Phase-2: echte verify flow/token (email-verify-start/complete of nieuw).

C) PDOK ambiguïteit (als suffix ontbreekt)
- address-preview/verify pakken “best match” zonder suffix.
- Phase-1.5/2: als meerdere candidates => suffix verplicht of verified=false + audit “ambiguous”.

Drie “dit moet je niet negeren” opmerkingen (geen refactor nu, wél vastleggen)

Je paste bevat 3 functies achter elkaar → risico dat jij straks per ongeluk een file deployed met dubbele imports / verkeerde inhoud.
Actie (proces): altijd per functie apart plakken + pad + 1 bestand. Anders ga je jezelf slopen.

upload-confirm: 409 op storage.download error is prima, maar het betekent: “issued row bestaat, upload ontbreekt”.
Dat is correct; zet als reason storage_missing. (Je doet dat.)

evaluate: charger_exact_count fallback (required<=0 => chargerCount>0) is een policy keuze.
Niet fout, maar als je ooit “charger_count verplicht” maakt, moet je dit aanscherpen. Zet als Phase-2 note.


export + submit-review + consents-save

ADD 12.2 — 2026-02-09 — Export is nu evidence-grade; submit-review overlapt evaluate; consents-save is strict

1) Export evidence is nu goed afgedwongen
- Export alleen na lock/in_review.
- Export bevat alleen confirmed docs.
- Export blokkeert als confirmed doc zonder sha256 (integrity gate).

2) Overlap submit-review vs evaluate(finalize=true)
- Beide doen checks + lock.
- Risico: divergentie in de toekomst.
- Keuze: of submit-review wrapper om evaluate te worden (Phase-2), of 1 endpoint deprecaten.

3) onderstaande is done" maar erin gehouden voor consisitency
Idempotency policy inconsistency (nu fix nodig). --> done
- api-dossier-submit-review gebruikt fallback meta.request_id als idemKey.--> done
- Dit is in strijd met “header-only idempotency” policy en met de audit testverwachting. --> done
- Fix: idemKey = meta.idempotency_key ONLY (400 als ontbreekt). --> done

4) Consents versioning is hardcoded
- VERSION="v1.0" => goed voor MVP, maar Phase-2: server-driven consent doc versions (ToS/Privacy/Mandate) met hash/URL.


lead-submit + doc-download-url + address-save

ADD 12.3 — 2026-02-09 — Lead submit / Download evidence / Address PDOK verify

1) api-lead-submit is audit-light (gaten)
- Alleen dossier_created wordt ge-audit in dossier_audit_events.
- Installer signup, lead insert, contact messages en mail queue actions hebben geen audit trail.
- MVP ok, maar Phase-2: minimaal audit events voor lead_submit_received / lead_submit_rejected / mail_queued.

2) api-dossier-doc-download-url heeft idempotency policy violation + ontbrekende reject audits
- Idempotency: gebruikt meta.request_id fallback. Dit moet header-only worden, anders test/audit inconsistent.
- Geen audit events bij rejects (401/404/409/500). Voor evidence-access endpoints wil je reject audit (wie probeerde te downloaden wat en waarom geweigerd).

TODO:
- Fix idemKey = meta.idempotency_key ONLY; 400 zonder header.
- Voeg reject audit events toe: document_download_url_rejected (stages: validate_input, auth, export_gate, doc_lookup, integrity_gate, signed_url)

3) api-dossier-address-save is evidence-grade genoeg, maar PDOK is extern risico
- 502 bij PDOK storingen is correct; logt stage external_lookup.
- Let op: suffix heuristics kunnen false negatives geven; UX moet duidelijke foutmelding tonen.

(B) Doc-download-url mist reject audit events --> deze is opgelost maar blijft staan voor consistency 

Je logt alleen success document_download_url_issued. In audit-termen is dit half: je wil ook bewijs dat je niet lekt.

Minimaal toevoegen:

document_download_url_rejected bij:
validate input (400)
auth (401)
dossier not locked (409)
doc not found (404)
not evidence-grade (409)
signed url fail (500)

mail-worker + api-dossier-doc-download-url

5) P1 To-do (kort, scherp, audit-first)

P1-1 (must): voeg next_attempt_at toe aan outbound_emails + index

Reden: cooldown op last_attempt_at is primitief; scheduled retries zijn auditbaar en controleerbaar.

P1-2 (must): voeg dossier_id (nullable) toe aan outbound_emails

Reden: audittrail per dossier; nu is mail “off-chain”.

P1-3 (should): add mail audit events (fail-open)

mail_queued (in endpoints die outbound_emails insert doen)

mail_sent, mail_failed, mail_requeued (in mail-worker)

P1-4 (should): “send then DB write failed” hard fix

zonder transaction/outbox pattern kun je nooit reliable exactly-once.

oplossing: outbox table + unique send key / provider id persistence.