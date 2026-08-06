# Signing Legal Bundle Approval

Status: DRAFT — EXTERNAL LEGAL/VERIFIER VALIDATION REQUIRED

Purpose: one internal validation source for the four customer-facing documents
used by `typed_name_otp_v1`. Product directions are internally approved, but
none of the four documents is CURRENT or approved legal advice. Verifier,
financial-regulatory and production acceptance remain external where stated.

## Canonical decision registry

This is the only canonical P/T/F/M decision table in this document. A product
direction can be approved while its legal, verifier, tax, insurance, banking or
payment-regulatory validation remains open.

| ID | Canonical status | Approved direction | Remaining live gate |
| --- | --- | --- | --- |
| P-01 | APPROVED PRODUCT/LEGAL DIRECTION — ENTITY DETAILS PENDING | Future ENVAL B.V. is the intended controller for the core service; no incomplete brand name is used as legal identity. | Complete statutory and contact details; legal assessment of any separate or joint partner role. |
| P-02 | APPROVED PRODUCT/PRIVACY DIRECTION — LEGAL VALIDATION REQUIRED | Contract/precontract for the necessary core service; law only where demonstrably applicable; legitimate interest only after a recorded balancing test; consent only for genuinely optional processing. | Purpose-by-purpose legal-basis validation and legitimate-interest assessments. |
| P-03 | APPROVED PRODUCT/PRIVACY DIRECTION — LEGAL VALIDATION REQUIRED | Recipients are disclosed by category; no unnecessary vendor list and no non-EEA transfer without a recorded safeguard. | Validate roles, processor arrangements, transfer locations and safeguards. |
| P-04 | APPROVED PRODUCT/PRIVACY DIRECTION — LEGAL VALIDATION REQUIRED | Category-based retention, preserving known official minima without extending them to unrelated data. | Validate non-verification periods, start events, legal holds and deletion/minimization rules. |
| P-05 | APPROVED PRODUCT/PRIVACY DIRECTION — LEGAL VALIDATION REQUIRED | One privacy contact and one statutory rights procedure with reliable identity checking. | Validate the complete rights workflow, deadlines and exception handling. |
| P-06 | APPROVED PRODUCT/PRIVACY DIRECTION — LEGAL VALIDATION REQUIRED | Material changes are actively notified and never applied retroactively. | Validate when renewed acknowledgement or another customer action is required. |
| T-01 | APPROVED PRODUCT/LEGAL DIRECTION — ENTITY DETAILS PENDING | Future ENVAL B.V. contracts, receives the assignment, manages the service and performs agreed financial settlement; Dutch Particulier, Zakelijk and VvE definitions apply. | Complete legal-entity details; foreign entities and registers remain post-MVP. |
| T-02 | APPROVED PRODUCT/LEGAL DIRECTION | Contract formation requires successful atomic server finalization and a safe-reference submission confirmation; exact one-year scope with no silent renewal. | Final legal review of the clause and its relationship with statutory consumer rights. |
| T-03 | APPROVED PRODUCT/CONTRACT DIRECTION — LEGAL VALIDATION REQUIRED | Termination is prospective; ENVAL may block or terminate for fraud, deliberate falsehood, persistent non-cooperation, illegality or objective impossibility. | Validate notice, cure, statutory withdrawal/cooling-off and effects on active work and accrued rights. |
| T-04 | APPROVED LIABILITY DIRECTION — NUMERIC CAP PENDING INSURANCE AND LEGAL ADVICE | Liability remains proportionate and never excludes mandatory rights; no numeric cap is invented. | Insurance scope, legal advice and a defensible numeric cap, if permitted. |
| T-05 | APPROVED PRODUCT/CONTRACT DIRECTION — LEGAL VALIDATION REQUIRED | Force majeure is objective and outside reasonable control; normal market-price movement and business risk are excluded. | Validate suspension, mitigation, notice and long-stop termination. |
| T-06 | APPROVED PRODUCT/CONTRACT DIRECTION — LEGAL VALIDATION REQUIRED | Material changes are prospective and actively notified; the signed version governs ongoing obligations unless law requires otherwise. | Validate notice period, customer action and treatment of legally required changes. |
| T-07 | APPROVED PRODUCT/CONTRACT DIRECTION — LEGAL VALIDATION REQUIRED | Dutch law, full mandatory consumer protection and an internal complaint route. | Validate forum, complaint handling and consumer-information duties. |
| T-08 | APPROVED PRODUCT/CONTRACT DIRECTION — LEGAL VALIDATION REQUIRED | Material messages use dashboard plus e-mail notification; sending evidence is not proof of reading. | Validate delivery risk, contact changes and legally required durable-medium notices. |
| F-01 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | ENVAL success fee is 10% of net realized sale proceeds. | Legal and tax validation. |
| F-02 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Fee basis is net realized sale proceeds. | Legal and accounting validation. |
| F-03 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | The 10% includes applicable VAT, itemized separately. | VAT, invoicing and customer-type validation. |
| F-04 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | No fee before definitive receipt and reconciliation. | Legal and fiscal due-date validation. |
| F-05 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Fee settlement precedes payout of the customer share. | Money-flow and accounting validation. |
| F-06 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Only closed, evidenced, third-party sale costs reduce gross proceeds; internal costs remain inside the 10%. | Legal, tax and accounting validation. |
| F-07 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Definitive NEa, verifier, quantity or sale corrections trigger recalculation. | Legal and verifier-process validation. |
| F-08 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Reversal of result proportionally reverses the corresponding fee. | Legal and accounting validation. |
| F-09 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Clawback is capped at evidenced net overpayment; fraud remains separate. | Enforceability and fraud-process validation. |
| F-10 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | No silent or unlimited negative balance; each change creates a settlement revision. | Set-off and repayment validation. |
| F-11 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Target payout is within fourteen calendar days after receipt and reconciliation unless explicitly blocked. | Legal, banking and payment-services validation. |
| F-12 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | No minimum payout. | Legal, banking and operational validation. |
| F-13 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Only the final currency result is rounded to eurocents by one documented rule. | Accounting and tax validation. |
| F-14 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | General bank/payout costs remain inside the 10%; only sale-specific external bank costs may reduce gross proceeds. | Legal, tax and banking validation. |
| F-15 | APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED | Every settlement and revision uses an itemized customer statement. | Legal, fiscal and reporting validation. |
| M-01 | APPROVED PRODUCT DIRECTION | Party fields come only from server-canonical facts and are fixed in the signed snapshot. | Runtime implementation and identity-source proof. |
| M-02 | APPROVED PRODUCT DIRECTION | Every EAN and linked relevant location is explicit in the snapshot; no open authority for future connections. | Runtime implementation and exact-scope proof. |
| M-03 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | NEa connection-data retrieval and verifier location inspection are separate explicit permissions. | Written approval of the exact Dutch permission clauses. |
| M-04 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | Exactly one chosen whole calendar year per mandate/finalization; no multi-year mandate, silent renewal or retroactivity claim. | Signing after year start, earlier periods, existing-provider overlap, EAN/year exclusivity and verifier acceptance. |
| M-05 | APPROVED PRODUCT DIRECTION | Issue date is assigned only server-side at finalization. | Runtime implementation and timestamp-evidence proof. |
| M-06 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | Withdrawal is prospective, authenticated and recorded as a new immutable event without changing the original mandate. | Exact effective date, unfinished booking, irreversibility, notifications and retention. |
| M-07 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | Simple e-sign evidence contains the canonical snapshot and hash, legal versions/hashes, typed name, separate intents, challenge/channel references, server time, method version and minimized audit metadata; never raw OTP. | Legal and verifier acceptance; no advanced or qualified-signature claim. |
| M-08 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | Zakelijk/VvE authority requires a separate ENVAL review and blocks downstream use until sufficient; joint signing and authority chains are post-MVP. | Corporate-law, register and verifier validation of the review standard. |
| M-09 | APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED | Written verifier acceptance of the template and evidence pack is a hard pilot-live gate. | Named verifier acceptance and recorded acceptance date. |

## Registry reconciliation

| document_type | Candidate version | Language | Internal status | effective_from | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `privacy_notice` | `privacy-notice-nl-v1` | `nl` | `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT` | unset | unverified |
| `service_terms` | `service-terms-nl-v1` | `nl` | `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT` | unset | unverified |
| `fee_terms` | `fee-terms-nl-v1` | `nl` | `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT` | unset | unverified |
| `mandate` | `mandate-nl-v1` | `nl` | `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT` | unset | unverified |

No source registry record changes through this document. Final hashes may be
generated server-side only after exact canonical content, metadata and
`effective_from` are frozen in a separately authorized implementation batch.

The compact customer action remains:

> Ik heb de privacyverklaring gelezen en ga akkoord met de algemene
> voorwaarden en de vergoedingsvoorwaarden.

It produces three separate future intents: `privacy_notice_read`,
`service_terms_accepted` and `fee_terms_accepted`. The mandate signature and
signer declaration remain separate.

## 1. Privacyverklaring

Internal status: VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT

Primary basis: approved privacy directions, AVG validation gates,
`NEA-RET-001/003` and the current ENVAL role boundary.

Exact validation candidate:

```text
Privacyverklaring

Versie: privacy-notice-nl-v1
Geldig vanaf: [UNSET]

1. Verwerkingsverantwoordelijke

De beoogde verwerkingsverantwoordelijke voor de kernservice is de nog op te richten ENVAL B.V. Voor publicatie worden deze gegevens ingevuld:

- statutaire naam: {{controller_statutory_name}}
- rechtsvorm: {{controller_legal_form}}
- KvK-nummer: {{controller_kvk_number}}
- statutaire vestigingsplaats: {{controller_statutory_seat}}
- correspondentieadres: {{controller_correspondence_address}}
- algemeen contactadres: {{controller_general_contact}}
- privacycontactadres: {{controller_privacy_contact}}

Een holding, aandeelhouder, softwareleverancier, partner of verificateur wordt niet zonder afzonderlijke juridische beoordeling verwerkingsverantwoordelijke.

2. Doelen en grondslagen

ENVAL verwerkt noodzakelijke gegevens om uw aanmelding en overeenkomst voor te bereiden en uit te voeren, uw dossier op te bouwen en te beheren, controles en correcties uit te voeren, de machtiging en ondertekening vast te leggen, de verificatie- en inboekketen te ondersteunen, financiële afwikkeling uit te voeren, met u te communiceren en de dienstverlening te beveiligen.

ENVAL gebruikt een wettelijke verplichting alleen waar die aantoonbaar geldt. Beveiliging, fraudepreventie en audit kunnen op een gerechtvaardigd belang berusten nadat de vereiste belangenafweging is vastgelegd. Toestemming wordt alleen gevraagd voor werkelijk optionele verwerking. De leesbevestiging bij deze verklaring is geen algemene toestemming.

3. Gegevens

ENVAL kan contact-, adres-, organisatie-, vertegenwoordiger-, EAN-, locatie-, laadpunt-, meter-, installatie-, document-, machtigings-, ondertekenings-, dossier-, verificatie-, financiële, communicatie-, beveiligings- en auditgegevens verwerken voor zover noodzakelijk.

Parserobservaties en andere afgeleide gegevens blijven gescheiden van uw verklaringen en overschrijven uw invoer niet automatisch.

4. Ontvangers en doorgifte

ENVAL deelt gegevens alleen waar noodzakelijk met categorieën ontvangers zoals de NEa, de betrokken inboekverificateur en technische dienstverleners. ENVAL geeft persoonsgegevens niet buiten de EER door zonder een vastgelegde wettelijke waarborg.

5. Bewaring

ENVAL gebruikt een categoriegebonden bewaarschema. Verificatiegegevens en documentatie die onder het toepasselijke verificatiekader vallen worden ten minste vijf jaar bewaard na het einde van het kalenderjaar waarin de verificatie plaatsvond. Deze minimumtermijn geldt niet automatisch voor andere klantgegevens. Gegevens worden daarna verwijderd of geminimaliseerd, tenzij een wettelijke verplichting of geldige bewijs- of geschilgrond verdere bewaring vereist.

6. Uw rechten en contact

U kunt via {{controller_privacy_contact}} uw wettelijke privacyrechten uitoefenen. ENVAL controleert uw identiteit waar dat nodig is en behandelt het verzoek binnen de wettelijke termijn. U kunt een klacht indienen bij de Autoriteit Persoonsgegevens.

7. Beveiliging en wijzigingen

ENVAL gebruikt passende technische en organisatorische maatregelen. Materiële wijzigingen worden actief gemeld en gelden niet met terugwerkende kracht.
```

External validation focus: entity data, purpose-by-purpose legal bases,
legitimate-interest assessments, recipient/processor roles, non-EEA safeguards,
the category retention schedule, rights procedure and renewed-action triggers.

## 2. Algemene voorwaarden

Internal status: VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT

Primary basis: approved contract directions, mandatory consumer-law gates and
the current ENVAL inboekdienstverlener role.

Exact validation candidate:

```text
Algemene voorwaarden

Versie: service-terms-nl-v1
Geldig vanaf: [UNSET]

1. Partijen

De beoogde contractspartij is de nog op te richten ENVAL B.V. Voor publicatie worden de volledige rechtspersoons- en contactgegevens uit de Privacyverklaring ingevuld. Deze entiteit ontvangt uw opdracht, beheert de dienstverlening en voert de overeengekomen financiële afwikkeling uit.

Particulier is een natuurlijke persoon die voor de eigen relevante aansluiting handelt. Zakelijk is een Nederlandse onderneming of organisatie die voor de eigen relevante aansluiting handelt. VvE is een Nederlandse vereniging van eigenaars die via de opgegeven natuurlijke persoon handelt. Een Zakelijk/VvE-ondertekenaar verklaart bevoegd te zijn; dit is geen ENVAL-bevoegdheidsreview en geen verificateuracceptatie. Buitenlandse ondernemingen en registers vallen buiten de MVP.

2. Dienst en rol

ENVAL bouwt en beheert als inboekdienstverlener een controleerbaar dossier en ondersteunt de toepasselijke verificatie-, inboek-, verkoop- en afwikkelingsketen. ENVAL is niet de NEa, verificateur of certificeerder en garandeert geen acceptatie, ERE-toekenning, verkoop, prijs, opbrengst, uitbetaling, timing of documentgoedkeuring.

3. Uw verplichtingen

U verstrekt juiste, volledige en actuele gegevens en documenten, gebruikt geen bewijs van een ander als eigen bewijs en meldt relevante fouten of wijzigingen zonder onnodige vertraging. Een technisch bevestigde upload of parserresultaat is geen geaccepteerd bewijs.

4. Totstandkoming en kalenderjaar

De overeenkomst komt tot stand op het moment waarop ENVAL de elektronische ondertekening server-side succesvol heeft afgerond en de klant de indieningsbevestiging met een veilige referentie ontvangt.

Account- of e-mailinvoer, intake-start, documentselectie, upload, confirmed_quarantine, parserresultaat, factbevestiging, Stap 3, klantbevestigingen en het aanvragen of verzenden van een OTP vormen op zichzelf geen overeenkomst.

De overeenkomst geldt voor exact één gekozen kalenderjaar en wordt niet stilzwijgend verlengd. Na dat jaar blijft zij alleen bestaan voor de bijbehorende verificatie, inboeking, verkoop, settlement, correcties of reversals, bezwaar of geschil en noodzakelijke wettelijke, fiscale, audit- en bewijsbewaring. Een volgend jaar vereist een nieuwe expliciete klantactie, legal bundle, snapshot, machtiging en ondertekening.

5. Consumentenrechten en beëindiging

Dwingende consumentenrechten blijven volledig gelden. ENVAL start niet binnen een toepasselijke bedenktijd wanneer daarvoor wettelijk een afzonderlijk verzoek of andere klantactie nodig is, tenzij die actie correct is vastgelegd.

Beëindiging werkt prospectief. ENVAL mag dienstverlening blokkeren of beëindigen bij fraude, bewust onjuiste informatie, blijvende niet-medewerking, onwettigheid of objectieve onmogelijkheid. Rechtmatig uitgevoerde handelingen, noodzakelijke bewaring en reeds ontstane rechten en verplichtingen blijven afzonderlijk af te wikkelen.

6. Aansprakelijkheid

Aansprakelijkheid wordt proportioneel geregeld en niet uitgesloten of beperkt waar dwingend recht dat verbiedt. Een eventuele numerieke limiet wordt pas toegevoegd na verzekerings- en juridisch advies.

7. Overmacht

Overmacht is een objectieve omstandigheid buiten de redelijke controle van de getroffen partij. Die partij meldt de omstandigheid en beperkt de gevolgen waar redelijk. Normale marktprijsontwikkeling en normaal bedrijfsrisico zijn geen overmacht.

8. Wijzigingen, recht en klachten

Materiële wijzigingen gelden prospectief en worden actief gemeld. De ondertekende versie blijft leidend voor lopende verplichtingen, tenzij de wet een wijziging vereist. Nederlands recht is van toepassing met volledig behoud van dwingende consumentenbescherming. Klachten kunnen eerst via {{general_contact}} aan ENVAL worden voorgelegd.

9. Digitale communicatie en ondertekening

Materiële berichten worden via het klantdashboard aangeboden en per e-mail gemeld. Verzendregistratie bewijst niet dat u het bericht heeft gelezen.

De elektronische ondertekening gebruikt uw ingevoerde volledige naam, afzonderlijke verklaringen en een eenmalige code via een geverifieerd kanaal. Alleen serverfinalisatie voltooit de ondertekening.
```

External validation focus: entity data, statutory cooling-off and performance
rules, termination notice/effects, liability and insurance cap, force majeure,
change notice, forum/complaints and durable-medium communication.

## 3. Vergoedingsvoorwaarden

Internal status: VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT

Primary basis: the approved commercial model in
`fee-model-and-service-terms.md`, `NEA-FIN-001/002` and the provider-neutral
settlement contract.

Exact validation candidate:

```text
Vergoedingsvoorwaarden

Versie: fee-terms-nl-v1
Geldig vanaf: [UNSET]

1. Geen resultaatgarantie

ENVAL garandeert geen ERE-toekenning, acceptatie, verkoop, prijs, opbrengst, uitbetaling of timing.

2. Berekening

Bruto verkoopopbrengst is de werkelijk betaalde verkoopwaarde voor de aan u toegerekende ERE's.

Directe externe transactiekosten zijn uitsluitend aantoonbare derdenkosten die rechtstreeks nodig waren voor die verkoop, zoals broker-, platform-, clearing-, settlement- of transactiespecifieke bankkosten. Zij worden zonder opslag gespecificeerd. Personeel, software, administratie, support, normale compliance/verificatie, algemene bankkosten en overhead worden niet afzonderlijk afgetrokken.

Netto gerealiseerde verkoopopbrengst is de bruto verkoopopbrengst minus directe externe transactiekosten. De ENVAL-succesfee is 10% daarvan, inclusief toepasselijke btw. Uw klantaandeel is 90%. De btw-specificatie wordt afzonderlijk getoond zonder deze verhouding te wijzigen.

3. Ontstaan, settlement en uitbetaling

Er is geen fee bij intake, dossieracceptatie, ERE-toekenning alleen of verkoop zonder definitieve ontvangst. De fee ontstaat commercieel pas na definitieve ontvangst en reconciliatie. ENVAL settelt de fee vóór uitbetaling van het klantaandeel.

De doeltermijn voor uitbetaling is veertien kalenderdagen na ontvangst en reconciliatie, tenzij een concrete blokkade is vastgelegd. Er is geen minimumuitbetaling. Alleen het uiteindelijke valutaresultaat wordt volgens één gedocumenteerde regel op eurocenten afgerond.

4. Correcties, reversals en clawback

Een definitieve NEa-, verificateur-, hoeveelheid- of verkoopcorrectie leidt tot herberekening. De fee beweegt proportioneel mee en wordt bij reversal van het resultaat overeenkomstig teruggedraaid.

Clawback is beperkt tot aantoonbare netto-overbetaling en vereist een afzonderlijke herleidbare grond. Fraude of bewust onjuiste informatie wordt afzonderlijk behandeld. Er ontstaat geen stil of onbegrensd negatief saldo. Iedere wijziging wordt als afzonderlijke settlementrevision vastgelegd; de oorspronkelijke settlement blijft behouden.

5. Klantafrekening

Iedere afrekening toont minimaal de periode, hoeveelheid, verkoopprijs, bruto opbrengst, iedere directe externe transactiekost, netto opbrengst, 10%-fee en btw-specificatie, correcties of reversals, 90%-klantaandeel, uitbetalingsdatum en settlementrevision.
```

External validation focus: legal entitlement and sale role, VAT/invoicing, fee
due date, corrections/clawback, own-account money flow, safeguarding,
beneficiary checks, bank structure and PSD2/Wft/payment-services classification.

## 4. Machtiging

Internal status: VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT

Primary basis: `NEA-MAND-001` through `NEA-MAND-005`, the approved mandate
directions and the modular simple-signature evidence boundary.

Exact validation candidate template:

```text
Machtiging

Versie: mandate-nl-v1
Geldig vanaf: [UNSET]

1. Opdrachtgever

Accounttype: {{account_type}}

Bij een natuurlijke persoon:
- volledige naam: {{natural_person_full_name}}
- adres: {{natural_person_address}}

Bij een onderneming of VvE:
- juridische naam: {{organization_legal_name}}
- vestigingsadres: {{organization_establishment_address}}
- KvK-nummer: {{organization_kvk_number}}
- naam ondertekenaar: {{signer_full_name}}
- functie of rol: {{signer_role}}

Alle partijgegevens komen uit server-canonical facts en worden onveranderlijk in de ondertekende snapshot vastgelegd.

2. Aansluitingen en locaties

Deze machtiging geldt uitsluitend voor de hieronder opgenomen aansluitingen en gekoppelde relevante laadlocaties:

{{#electricity_connections}}
- EAN: {{ean}}
- adres aansluiting: {{connection_address}}
- gekoppelde relevante laadlocatie(s): {{charging_location_addresses}}
{{/electricity_connections}}

De machtiging geldt niet voor later toegevoegde of niet genoemde aansluitingen of locaties.

3. Opdracht en afzonderlijke toestemmingen

Ik geef ENVAL opdracht om voor deze aansluitingen en locaties mijn dossier voor de ERE-E-inboekdienstverlening op te bouwen, te beheren en binnen de toepasselijke regels te gebruiken voor verificatie en inboeking.

Ik machtig de Nederlandse Emissieautoriteit (NEa) om gegevens over de genoemde elektriciteitsaansluiting(en) op te vragen bij de distributiesysteembeheerder.

Ik machtig de inboekverificateur om de genoemde laadlocatie(s) te controleren.

4. Kalenderjaar en afgiftedatum

Gekozen kalenderjaar: {{calendar_year}}
Afgiftedatum: {{server_issue_date}}

Deze machtiging geldt voor exact één volledig gekozen kalenderjaar. De afgiftedatum wordt uitsluitend server-side bij finalisatie vastgesteld en de ondertekende snapshot bevat het gekozen jaar. Er is geen meerjarige machtiging, stilzwijgende verlenging of aanspraak op terugwerkende kracht. Een volgend kalenderjaar vereist een nieuwe machtiging en ondertekening.

5. Intrekking

Ik kan de machtiging prospectief intrekken via het geauthenticeerde dashboard of schriftelijk nadat ENVAL mijn identiteit betrouwbaar heeft gecontroleerd. ENVAL legt ontvangstdatum, actor, bron en auditcontext vast als een nieuwe immutable gebeurtenis en wijzigt of verwijdert de oorspronkelijke machtiging niet.

Na intrekking stopt ENVAL nieuwe, nog niet uitgevoerde handelingen en blokkeert het hoeveelheden die nog niet onomkeerbaar in een uitgevoerde handeling zijn opgenomen. Rechtmatig verrichte handelingen blijven historisch intact. Noodzakelijke wettelijke, fiscale, verificatie-, audit- en bewijsrecords blijven behouden en reeds ontstane financiële rechten en verplichtingen worden afgewikkeld. Er ontstaat geen machtiging voor een volgend kalenderjaar.

6. Verklaring en bevoegdheid

Ik verklaar dat de gegevens juist en volledig zijn en dat ik deze machtiging wil ondertekenen.

Wanneer ik namens een onderneming of VvE onderteken, verklaar ik bevoegd te zijn. Deze verklaring is geen voltooide ENVAL-bevoegdheidsreview en geen verificateuracceptatie. Vereist downstream gebruik blijft geblokkeerd totdat de afzonderlijke ENVAL-review voldoende is.

7. Elektronische ondertekening

Ondertekenmethode: typed_name_otp_v1
Ingevoerde naam: {{typed_signer_name}}
Functie of rol: {{signer_role_if_applicable}}
Serverdatum en -tijd: {{server_signed_at}}

De ondertekening wordt alleen voltooid nadat de eenmalige code via het geverifieerde kanaal succesvol is gecontroleerd en de server het exacte document, de versies, ingevulde gegevens en het ondertekenbewijs onveranderlijk heeft vastgelegd. Deze methode claimt geen geavanceerde of gekwalificeerde elektronische handtekening.
```

Required future evidence pack:

- canonical snapshot and snapshot SHA-256;
- exact legal versions and hashes;
- typed full name and separate customer intents;
- OTP challenge reference and verified-channel reference, never raw OTP;
- server timestamp and method version;
- minimized audit metadata;
- separate Zakelijk/VvE authority-review result.

External validation focus: exact Dutch wording of both permission clauses,
signing after year start, earlier periods, existing-inboekdienstverlener
overlap, EAN/year exclusivity, withdrawal effects, authority review,
simple-signature sufficiency and written verifier acceptance. Joint signing and
authority chains remain post-MVP.

## Consolidated external pilot-live gates

- complete statutory and contact details for the future ENVAL B.V.;
- privacy legal-basis, recipient/processor, transfer, retention and rights
  validation;
- consumer-law, termination, liability/insurance, force-majeure, change,
  complaint and durable-medium validation;
- exact mandate permission wording, authority standard, electronic-signature
  evidence and written verifier acceptance;
- financial-legal, tax, banking, safeguarding, beneficiary and payment-services
  validation;
- frozen `effective_from`, canonical content and server-generated hashes;
- separately authorized implementation and proof of registry, OTP, snapshot,
  signing, mandate, withdrawal, settlement and finalization runtime.

Until these gates are satisfied, all four records remain validation candidates,
not CURRENT legal text, and have neither verifier acceptance nor production
proof.
