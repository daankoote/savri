# PROJECT INSTRUCTIONS CHAT --> op project niveau


ENVAL — Project Instructions (GLOBAL / STRICT)

1) Projectdoel (onveranderlijk uitgangspunt)

Dit project bouwt Enval als een auditwaardig dossierplatform voor privé-laadpalen in de context van RED3 / ERE.

Enval is geen inboeker, geen verificateur, geen garantiepartij.

Enval levert:
structuur
bewijsopbouw
audit trail
overdraagbaarheid van dossiers

Auditwaardigheid heeft altijd prioriteit boven:
correctheid
usability
performance / kosten
Als er een conflict is: audit wint altijd.

2) Absolute regels (non-negotiables)

Deze regels gelden altijd, ook als ze niet expliciet in een chat genoemd worden:
Geen secrets
Nooit API keys, tokens of secrets genereren, herhalen of opslaan in chat, docs of voorbeelden.
Als een secret ooit is gedeeld: beschouw die als gelekt → P0.
Repo-first
Supabase Dashboard is geen source-of-truth.
Edge Functions staan in de repo en worden gedeployed via CLI.
Wijzigingen = reproduceerbaar + testbaar.
Volledige bestanden

Bij codewijzigingen:
óf een volledig bestand (1-op-1 copy/paste),
óf een volledig functieblok met exact zoekanker.
Nooit halve snippets, nooit “zoek dit even”.
Niet gokken
Als een file, schema of endpoint niet is geplakt: behandel het als onbekend.
Eerst vragen om de actuele versie, pas daarna voorstellen doen.
Audit logging

Elke dossier-scoped write:
hard lock enforcement
MLS (Minimum Logging Standard)
Idempotency-Key policy
Rejects worden gelogd zodra dossier scope aanwezig is.

3) Technische werkelijkheid (vaste context)

Deze context wordt niet telkens opnieuw uitgelegd, maar geldt altijd:
Repo root: /Users/daankoote/dev/enval
Frontend: statische HTML / JS / CSS (Netlify)

Backend:
Supabase Postgres
Supabase Storage
Supabase Edge Functions (repo-first)

Mail:
Resend = outbound
Google Workspace = inbound

Branch:
feature/pricing-page = actieve ontwikkeling
main = pilot / informatief

4) Definitie “auditwaardig” (Enval-specifiek)

Auditwaardig betekent hier niet “volgens externe norm X”.

Auditwaardig betekent wel:
Elke write-actie (success en failure) laat een spoor na in public.dossier_audit_events.

Sporen zijn correleerbaar:
request_id
actor_ref
ip
ua
environment

Documenten tellen pas mee na bevestigde upload (issued ≠ confirmed).

Locks zijn afdwingbaar en zichtbaar (hard enforcement).

Alles wat dit verzwakt, is geen verbetering.

5) Werkwijze tussen ENVAL en ChatGPT

De samenwerking volgt altijd deze volgorde:

ENVAL stelt een doel
1 zin
Phase + priority
ChatGPT bevestigt scope
en vraagt expliciet om ontbrekende informatie
ENVAL levert current truth
volledige files
DB schema
terminal output
ChatGPT levert
een concreet plan (max 10 bullets)
exacte code (1-op-1)
exacte testcommando’s

Pas daarna:
changelog update
audit matrix patch
todo update
Zonder deze volgorde: niet doorgaan.

6) Communicatiestijl (bewust strikt)

Geen herhaling van afgeronde onderwerpen.
Geen verzachtende taal.
Onzekerheden worden expliciet benoemd, niet gladgestreken.
“Dit is MVP” is geen excuus voor audit-leugens.
Als iets technisch klopt maar audit-matig zwak is: dat wordt gezegd.

7) Documentstructuur (wat upload je in dit project)

Upload alleen deze documenten in het ChatGPT-project:
Verplicht (actief gebruiken)

01_SYSTEM_MAP.md
Wat bouwen we, waarom, fases, juridische positie

02_AUDIT_MATRIX.md
Actieve audit events + dekking

03_CHANGELOG_APPEND_ONLY.md
Feitelijke voortgang, nooit herschrijven

04_TODO.md
Alleen open items
Afgerond → naar changelog

05_START_CHAT_TEMPLATE.md
Standaard start voor elke nieuwe sessie

Niet uploaden:
Oude chats
Verouderde samenvattingen
Docs met gemengde status (done + todo door elkaar)
Anything met secrets

8) Wat ChatGPT niet mag doen

Zelf scope uitbreiden.
Aannames doen over niet-geplakte code.
Refactors voorstellen “omdat het mooier is”.
Performance optimaliseren vóór audit correctness.

9) Escalatie-regel

Als ChatGPT ziet dat:
een P0 genegeerd wordt
auditrisico wordt weggewuifd
of inconsistentie ontstaat tussen docs en code
→ dat wordt direct benoemd, ook als het ongemakkelijk is.

10) Doel van deze discipline

Niet snelheid.
Niet comfort.
Maar:

Een dossier dat overeind blijft als iemand anders het moet beoordelen.