Instructies & Plan (APPEND-ONLY UPDATE)

(hier laat ik jouw tweede doc exact staan en voeg ik onderaan “ADD 2026-01-21” toe)

huidige plan en status:

1-1-2026:

Jouw rol:
Jij bent hier om mij alles te verschaffen, code, tekst, ideeen, oplossingen, gevaren, opties etc.. alles waardoor we een professionele look en feel houden met een logische UI die de klant efficient en snel informeert en het gevoel geft "ok lets do it"... we hebben al een flinke website samen gebouwd maar ik weet dat je die dingen niet onthoudt, dus vraag mij om de relevante htmls, scripts, edge functies, css, etc die je nodig hebt.

Het project Enval:

structuur:

statische HTML, met https://www.enval.nl
 (primairy) en https://enval.nl

javascript voor de acties en frontend sanity validaties

css voor de opbouw/look and feel

supabase voor de database en server

edge functions voor de banckend validaties voordat het communiceert met de database. ook voor mail worker functies

vs code om in te schrijven

netifly voor mijn domein verwerkingen (bij transip ingeschreven maar doet niets). Staat in netifly nog dat mijn servve/certificate niet secure is maar in reality (check online / slotje) is deze dat wel.

google workspace met dk@enval.nl
 als main, met aliassen contact@, onboarding@ en no-reply@. DKIM is ingesteld (UI googlenog op pending, maar ik krijg positieve update mails van de Dmarc server) --> gebruik voor inkomende mail vanuit de website contact form en communicatie met klant

resend voor alle automatischeverstuur protocollen vanuit de website.

Samenvatting van het gehele project (Enval)

Enval is opgezet als een dossier- en registratieplatform rondom privé-laadpalen in het kader van RED3 / ERE.
De kernpositie van Enval is niet: inboeken, verifiëren of vergoeden.
De kernpositie is wel: zorgen dat data, bewijsstukken en structuur zó zijn ingericht dat een traject niet afketst op administratie.

Belangrijk uitgangspunt:

De inboeker is en blijft eindverantwoordelijk (juridisch, administratief, frauderisico).
Enval levert voorbereiding, structuur en overdraagbaarheid.
Geen garanties op ERE’s of vergoedingen.

Verbruik/metering is een aparte, nog onduidelijke stap → expliciet “in ontwikkeling”.

Wat we in deze chat hebben gedaan (inhoudelijk)
2.1 Bedrijfsvoering – fundamentele koerswijziging

Afgestapt van impliciete “wij regelen ERE/vergoeding”.
Enval duidelijk gepositioneerd als dossierplatform, niet als inboeker.

Verantwoordelijkheden per stap expliciet gemaakt:

Enval = dossierbasis

Externe verificateur = pre-verificatie / audit

Inboeker = inboeken + eindverantwoordelijkheid

Mandaat bewust teruggeschroefd / afgezwakt vanwege:

Onvolwassen regelgeving

Geen BV/KvK

Geen duidelijke juridische grond om namens klant te handelen

2.2 Proces (proces.html)

We hebben een 5-stappenmodel uitgewerkt en visueel neergezet:

Dossierbasis (Enval)
Identiteit, locatie, eigendom, hardware, meter-info, bewijsstukken, audit-trail.

Verbruik (kWh) (in ontwikkeling)
Bron en validatie verschillen per inboeker / verificatiemodel.
Enval kan structureren, maar is geen bron en geeft geen garantie.

Pre-verificatie (extern)
Verificateur beoordeelt de inboekroute.
Onderdelen van Enval kunnen worden meegenomen, maar Enval is geen verificateur.

Inboeken (erkende inboeker)
Alleen na succesvolle pre-verificatie.

Audit / steekproef (extern)
Kan plaatsvinden op keten én locatie (eindgebruiker).

Dit proces is nu:

Tekstueel helder

Juridisch afgebakend

Visueel consistent met de rest van de site

2.3 Pricing – strategische herpositionering

Oorspronkelijk: vaste bedragen per dossier → niet houdbaar bij €200 bruto opbrengst per laadpaal.

Nieuwe richting:

€5–€10 per laadpunt per jaar

Jaarlijkse bevestiging / actualisatie (“is er iets gewijzigd?”)

Lage drempel → schaalbaar

Verbruik-module expliciet als future / in ontwikkeling

Dit maakt Enval:

Niet afschrikwekkend voor natuurlijke personen

Interessant voor inboekers (bulk, structuur, lage kosten)

Realistisch t.o.v. regelgeving

Waarom main nu een “veilige” pilot is

Belangrijk besluit:

Geen BV / KvK → geen operationele claims

Daarom is main nu bewust:

Informatief

Pilot / testversie

Geen actieve dienstverlening

Geen impliciete verplichtingen

Concreet op main:

index.html = pilot landing

Korte uitleg regelgeving + richting

Contactformulier (informatie / interesse)

Aangepaste privacyverklaring alleen voor dit doel

Geen pricing, geen aanmeldflows, geen dossiers

➡️ Dit beperkt persoonlijk risico en aansprakelijkheid maximaal hookup.

Waar we nu staan (technisch & inhoudelijk)
Technisch

main

Bevat alleen: pilot index + privacy + voorwaarden

Is gecommit en gepusht

Is live op enval.nl

Geen actieve flows

feature/pricing-page

Bevat al het echte werk:

Pricing v2

Proces

Regelgeving

Aanmeldflows

Dossierstructuur

Heeft upstream (origin/feature/pricing-page)

Is jouw werkbranch

Pre-commit hook:

Werkt non-interactive

Blokkeert commits op main

Geen “JA”-prompt meer

Inhoudelijk:

Positionering klopt

Juridische afbakening klopt

Messaging is eerlijk, niet oversellend

Verbruik expliciet onzeker → correct

Wat we hebben gedaan (kort)

Project herijkt op realistische regelgeving

Verantwoordelijkheden gescheiden

Proces herschreven + visueel gemaakt

Pricing fundamenteel aangepast

Main ontdaan van risico’s

Branch-strategie hersteld

Git-problemen opgelost (hooks, branches, push)

Wat we nog moeten doen (later, niet nu)

Inhoud

Verbruik-module verder uitwerken zodra:

NEa / verificateurs duidelijker zijn

Inboekers concrete eisen delen

Mandaat herintroduceren pas bij:

BV

Heldere juridische grond

Pricing fine-tunen met echte feedback

Technisch

Eventueel:

Mailinglijst / interest signup scheiden van dossier-flow

Feature branch blijven ontwikkelen

Pas mergen naar main bij echte go-live

Afspraken over communicatie tussen ons

Deze zijn nu kristalhelder en moeten zo blijven:

Geen herhaling van afgeronde onderwerpen

Geen gokken: jij levert code, ik reageer 1-op-1

Geen halve snippets: altijd hele bestanden of hele secties zoals vervang function{xyz} helemaal voor function {abc}

Juridisch eerst, techniek daarna

Als iets onzeker is → expliciet benoemen, niet gladstrijken

wanneer je veranderingen in een file (html, css, js, edge, etc) vraag je mij ALTIJD om de docs omdat je vaak oude docs in je geheugen gebruikt

Jij bepaalt tempo en scope, ik bewaak scherpte en risico

de stappen zijn:

Ik vraag jou iets

jij bevestigd mijn vraag en geeft aan wat je nodig hebt aangezien je anders oude files gaat checken

ik geef jou wat je nodig hebt (de files of andere info)

ik krijg van jou óf: een heel bestand (1-op-1 copy/paste), of een volledige functie (beginnend bij function ... { en eindigend bij }), met EXACT waar je hem moet plakken. de voorkeur is bijna altijd de laatste optie omdat er dan weinig kans op verkeerd overschrijven bestaat in de rest van en eventueel grote doc.

Geen halve plakzooi waarbij ik moet gaan zoeken naar waar de code staat!

Aanweizge files:

site:

aanmelden.html

dossier.html

hoe-het-werkt.html

index.html (deze staat nu op main in een pilot format, maar op de feature/pricing-page branch is ie volledig)

installateur.html

mandaat.html (deze moet nog worden gechecked of het goed gaat)

privacyverklaring.html (moet nog juridisch getoetst worden)

regelgeving.html (moet nog juridisch getoetst worden en geupdate zodra Nea meer info heft)

voorwaarden.html (moet nog juridisch getoetst worden)

proces.html gemaak, maar nog niet verwerkt in index.html (lijkt namelijk veel op hoe-het-werkt.html, dus misschien dit aanpassen)

scripts:

config.js

script.js

dossier.js

css:

style.css

edge functions:

api-dossier-access-save

api-dossier-access-update

api-dossier-address-preview

api-dossier-address-save

api-dossier-address-verify

api-dossier-charger-delete

api-dossier-charger-save

api-dossier-consents-save

api-dossier-doc-delete

api-dossier-doc-download-url

api-dossier-email-verify-complete

api-dossier-email-verify-start

api-dossier-evaluate

api-dossier-get

api-dossier-submit-review

api-dossier-upload-url

api-lead-submit

mail-worker

verder hebben we in supabase de tabellen:

contact_messages

dossier_audit_events

dossier_chargers

dossier_checks

dossier_consents

dossier_documents

dossiers

idempotency_keys

installers

leads

outbounds_emails

wat gaan we vandaag doen? mijn voorstel zou zijn, door met de branch "feature/pricing-page":

zorgen dat de audit trail tot op heden correct is en alles goed wordt weggeschreven, en uiteindelijk exporteerbaar is (later als alles af is),

de validaties uitbreiden, met name de laadpaal check extern met apis naar energiemaatschsappijen, naar de leveranciers om merk model, de MID meter/chip (belangrijk) etc...

het proces van klant flow --> aankomst site (uitleg, pricing voorstellen), aanmelden, dossier aanmaken, eerste korte validatie of ere proces mogelijk is, indien ja: welke dienstverlening is wenselijk?, diensverlening verkopen, dan de volledige validaties doen (deze dus gaa uitbreiden naar laadpaal en eigendom/installaties bewijzen middels fotoherkenning en apis naar externe partijen), dossier opmaken, later een uitbreidende module voor (ook tijdstechnisch later in het gehele proces: de kwh verbruik opgeven en controleren --> weer intern en externe checks, is een to do die uitzoekwerk nodig heeft)

ander ideeen die goed aan te pakken?

Let op: dit maakt jouw test-dossier weer editbaar. Daarna kan je opnieuw reviewen en locken.

update public.dossiers
set locked_at = null,
status = 'incomplete',
updated_at = now()
where id = '35a34186-71f4-4658-80c7-88dd9aa36245';

delete from public.dossier_checks
where dossier_id = '35a34186-71f4-4658-80c7-88dd9aa36245';

cd ~/dev/enval
Dit us mijn root

Checken welke branch we in werken
cd ~/dev/enval
git branch --show-current

ADD 2026-01-21 — Update op status, fixes, en next steps (append-only)
ADD 2026-01-21 — Update op status, fixes, en next steps (append-only)

ADD 9.1 — Wat we hebben gedaan (technisch, concreet)

Toestemmingen (stap 5) afgerond als “immutable”

Backend api-dossier-consents-save is aangepast: opslaan kan alleen als terms + privacy + mandaat alle drie true zijn.

Frontend stap 5 is aangepast:

Na succesvolle save verdwijnt de Opslaan knop (geen revoke-flow).

Checkboxes blijven zichtbaar, worden grijs en disabled (niet meer klikbaar), zodat duidelijk is dat dit “af” is.

UI-tekst toegevoegd/afgesproken: “Toestemmingen zijn vastgelegd en kunnen niet meer worden aangepast.”

Review gating (stap 6) blijft correct

api-dossier-evaluate werkt conform contract (precheck vs finalize).

Dossier.js finalize knop blijft verborgen tot precheck OK, en wordt weer verborgen zodra er een wijziging is gedaan (dirtySincePrecheck).

Laadpaal verwijderen (stap 3) is correct en auditbaar

api-dossier-charger-delete verwijdert storage objects en bijbehorende document-rows en logt audit event.

ADD 9.2 — Wat erbij is gekomen om aan te pakken (nieuw zichtbaar)

Audit-gap: upload-url issued ≠ file uploaded

We registreren nu issuance en insert row, maar hebben nog geen sluitende bevestiging dat het bestand daadwerkelijk is geüpload (auditwaardigheid).

Audit correlation ontbreekt nog

Audit events hebben nog geen “request_id / idempotency key / ip / user agent” in event_data als standaard.

Idempotency is niet overal consistent

Frontend stuurt Idempotency-Key, maar niet alle write endpoints gebruiken het server-side.

ADD 9.3 — Wat we nog in totaal moeten doen (grote lijnen richting auditwaardig)

Document upload semantiek audit-proof maken (issued → uploaded bevestigd)

Idempotency standaardiseren over dossier write endpoints

Audit correlation toevoegen (request_id, actor_ref, ip, ua) met minimale logging standaard

Abuse controls + mail-worker retries/backoff

Externe validaties pas nadat acceptance criteria (van inboeker/verificateur) bekend zijn (MID/merk/model/leverancier)

ADD 9.4 — Wat we komende sessie gaan doen (concrete scope)

Focus: stap 4 documenten audit-proof maken

Nieuwe confirm endpoint: api-dossier-upload-confirm

dossier_documents uitbreiden met status/confirmed metadata

Dossier.js: onUpload() na PUT altijd confirm call doen

Evaluate: docs_per_charger telt alleen confirmed uploads

Resultaat: dossier kan nooit “ready_for_review” worden op basis van “issued” alleen.

ADD 9.5 — Correctie/advies op je voorstel “externe APIs”

“Energiemaatschappij API check” is in praktijk meestal niet haalbaar zonder machtiging en consistente brondata; dit hoort later.

Eerst audit-proof dossier + duidelijk eisenpakket van inboeker/verificateur, anders bouw je verificaties zonder target.

ADD 9.6 — Audit reject coverage is nu aantoonbaar (negatieve paden)

We hebben reject-tests toegevoegd (scripts/audit-tests.sh) die aantonen dat ook falende acties worden gelogd in public.dossier_audit_events:

charger_save_rejected (unauthorized, max_chargers_reached)

document_delete_rejected (unauthorized, not_found)

Dit is belangrijk voor auditwaardigheid: je wil niet alleen “success logs”, je wil ook “attempt logs”.

ADD 9.7 — Security must-do: rotate service role key

Service role key is gedeeld in chat en moet beschouwd worden als gelekt.

Actie: Supabase key roteren + scripts/env updaten.
Geen discussie: dit is P0.

EINDE DOC 2