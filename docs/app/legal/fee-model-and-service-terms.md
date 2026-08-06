# Fee Model And Service Terms

Status: APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED

This document is the central commercial source for F-01 through F-15. It is
not CURRENT legal text, legal or tax advice, PSD2/Wft approval, verifier
approval, implementation proof or authority to receive, retain or pay funds.
The customer-facing legal text remains DRAFT in
`signing-legal-bundle-approval.md`.

## Commercial Formula

Exact definitions:

`bruto verkoopopbrengst`
= werkelijk door de koper betaalde verkoopwaarde voor de aan de klant
toegerekende ERE's.

`directe externe transactiekosten`
= uitsluitend aantoonbare derdenkosten die rechtstreeks nodig waren voor de
betreffende verkoop.

`netto gerealiseerde verkoopopbrengst`
= bruto verkoopopbrengst minus directe externe transactiekosten.

`ENVAL-succesfee`
= 10% van de netto gerealiseerde verkoopopbrengst.

`klantaandeel`
= 90% van de netto gerealiseerde verkoopopbrengst.

De 10% ENVAL-succesfee is inclusief toepasselijke btw. De btw-specificatie moet
afzonderlijk zichtbaar zijn zonder het klantaandeel of de 10/90-verhouding
stilzwijgend te wijzigen.

## Directe Externe Transactiekosten

Alleen deze vooraf omschreven, door een derde gefactureerde en aan de concrete
verkoop gekoppelde categorieën zijn aftrekbaar bij de berekening van de netto
gerealiseerde verkoopopbrengst:

- brokercommissie;
- handelsplatform- of marktplaatskosten;
- clearing- of settlementkosten;
- transactiespecifieke bankkosten;
- andere vooraf omschreven en aantoonbare externe verkoopkosten.

Iedere post moet in de klantafrekening worden gespecificeerd. Een post mag geen
ENVAL-opslag, interne doorbelasting of verborgen marge bevatten.

Niet daarnaast aftrekbaar zijn:

- personeel;
- software;
- administratie;
- support;
- normale dossierbehandeling;
- normale compliance- en verificatiewerkzaamheden;
- algemene bankkosten;
- algemene bedrijfs- of overheadkosten;
- interne verkoopinspanning;
- eigen risicomarge.

Deze kosten vallen binnen de 10% ENVAL-succesfee.

## Fee Trigger And Settlement

- Geen fee bij intake.
- Geen fee bij dossieracceptatie.
- Geen fee bij ERE-toekenning alleen.
- Geen fee bij verkoop zonder definitieve ontvangst.
- De fee ontstaat commercieel pas na definitieve ontvangst en reconciliatie
  van de bruto verkoopopbrengst en directe externe transactiekosten.
- ENVAL verrekent de fee vóór de netto-uitbetaling van het klantaandeel.
- ENVAL betaalt het klantaandeel uiterlijk veertien kalenderdagen na ontvangst
  en reconciliatie, behalve bij een expliciet gedocumenteerde blokkade.
- Er geldt commercieel geen minimumuitbetaling.
- Alleen het uiteindelijke valutaresultaat wordt volgens één gedocumenteerde
  afrondingsregel op eurocenten afgerond.
- Algemene en normale uitbetalings- of bankkosten worden niet aanvullend op het
  klantaandeel ingehouden. Alleen direct verkoopgebonden, aantoonbare
  transactiespecifieke bankkosten kunnen onder de gesloten kostendefinitie
  vallen.

## Corrections, Reversals And Clawback

- Een definitieve NEa-, verifier-, hoeveelheid- of verkoopcorrectie leidt tot
  herberekening vanuit de definitieve gecontroleerde correctiebron.
- De ENVAL-succesfee beweegt proportioneel mee met de gecorrigeerde netto
  gerealiseerde verkoopopbrengst.
- Reversal van resultaat leidt tot reversal van de overeenkomstige fee.
- Clawback is maximaal de aantoonbare netto-overbetaling en vereist een
  afzonderlijke, herleidbare juridische grond.
- Fraude of bewust onjuiste informatie blijft een afzonderlijk juridisch geval
  en wordt niet stil onder de gewone settlementcorrectie gebracht.
- Er ontstaat geen stil of onbegrensd negatief saldo.
- Iedere correctie, reversal of clawback krijgt een afzonderlijke append-only
  settlementrevision; de oorspronkelijke settlement blijft behouden.

## Customer Settlement Statement

Iedere klantafrekening toont minimaal:

- settlementperiode;
- verkochte hoeveelheid ERE's;
- gerealiseerde verkoopprijs;
- bruto verkoopopbrengst;
- iedere directe externe transactiekost;
- netto gerealiseerde verkoopopbrengst;
- 10%-grondslag;
- ENVAL-succesfee inclusief toepasselijke btw;
- btw-specificatie;
- eventuele correctie of reversal;
- 90%-klantaandeel;
- uitbetalingsdatum;
- settlementrevision.

Illustratief rekenvoorbeeld, zonder marktprijsgarantie:

| component | bedrag |
| --- | ---: |
| bruto verkoopopbrengst | € 10.000 |
| directe externe transactiekosten | € 400 |
| netto gerealiseerde verkoopopbrengst | € 9.600 |
| ENVAL-succesfee, 10% inclusief toepasselijke btw | € 960 |
| klantaandeel, 90% | € 8.640 |

## Preferred Operating Hypothesis

Status: TARGET — PREFERRED OPERATING MODEL, REGULATORY CLASSIFICATION UNKNOWN

Preferred operating hypothesis for pilot: ENVAL receives the realized sale
proceeds on its own ENVAL bank account, performs reconciliation, retains the
10% all-in fee and pays the remaining 90% customer entitlement.

PSP/split-payment is a possible fallback or risk-reducing route. It is not the
decided standard architecture. The own-account model is not proven legally,
fiscally, financially or payment-regulatorily compliant. Its classification
depends on ownership/entitlement to the EREs and proceeds, ENVAL's sale and
representation role, the bank-account structure, safeguarding and a dedicated
payment-services analysis. Financial-legal, tax and banking advice are required
before production.

## Claim And Implementation Boundaries

- No guarantee of ERE award, acceptance, sale, price, proceeds, payout, timing,
  certification or document acceptance.
- The approved commercial direction is not approved legal wording. The legal
  bundle remains DRAFT.
- VAT calculation/invoicing, money-flow qualification, PSD2/Wft applicability,
  safeguarding, beneficiary verification and bank/PSP contracts remain blocked
  on external validation.
- Technical implementation status is `NOT IMPLEMENTED` for fee calculation,
  settlement, settlementrevision, payout and reconciliation runtime.
- No Supabase code, schema, migration, RPC, Edge Function, database or remote
  state is changed by this document.
