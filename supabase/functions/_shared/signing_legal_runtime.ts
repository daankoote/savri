import { isLocalSupabaseRuntime } from "./local_supabase_runtime.ts";

export type SigningLegalDocumentType =
  | "privacy_notice"
  | "service_terms"
  | "fee_terms"
  | "mandate";

export type SigningLegalRuntimeDocument = {
  documentType: SigningLegalDocumentType;
  version: string;
  language: "nl";
  status: "CURRENT" | "VALIDATION_CANDIDATE";
  effectiveFrom: string | null;
  title: string;
  canonicalContent: string;
};

const PRIVACY = `Privacyverklaring

Versie: privacy-notice-nl-v1
Geldig vanaf: [UNSET]

De beoogde verwerkingsverantwoordelijke is de nog op te richten ENVAL B.V. De statutaire naam, rechtsvorm, KvK-nummer, statutaire vestigingsplaats, correspondentieadres, algemeen contactadres en privacycontactadres worden vóór publicatie ingevuld.

ENVAL verwerkt noodzakelijke gegevens om de aanmelding en overeenkomst voor te bereiden en uit te voeren, het dossier te beheren, controles en correcties uit te voeren, machtiging en ondertekening vast te leggen, verificatie, inboeking en financiële afwikkeling te ondersteunen, te communiceren en de dienst te beveiligen. Wettelijke verplichtingen gelden alleen waar aantoonbaar; gerechtvaardigd belang vereist een vastgelegde belangenafweging; toestemming geldt alleen voor werkelijk optionele verwerking.

Ontvangers worden per categorie vermeld. Er vindt geen doorgifte buiten de EER plaats zonder vastgelegde waarborg. Bewaring is categoriegebonden; verificatiegegevens en -documentatie worden ten minste vijf jaar bewaard na het einde van het verificatiekalenderjaar. Materiële wijzigingen worden actief gemeld en gelden niet met terugwerkende kracht.`;

const SERVICE_TERMS = `Algemene voorwaarden

Versie: service-terms-nl-v1
Geldig vanaf: [UNSET]

De beoogde contractspartij is de nog op te richten ENVAL B.V. De volledige rechtspersoons- en contactgegevens worden vóór publicatie ingevuld. Dezelfde entiteit ontvangt de opdracht, beheert de dienst en voert de overeengekomen financiële afwikkeling uit.

ENVAL ondersteunt als inboekdienstverlener de dossier-, verificatie-, inboek-, verkoop- en afwikkelingsketen. ENVAL is niet de NEa, verificateur of certificeerder en garandeert geen acceptatie, ERE-toekenning, verkoop, prijs, opbrengst, uitbetaling, timing of documentgoedkeuring.

De overeenkomst komt tot stand wanneer ENVAL de elektronische ondertekening server-side succesvol heeft afgerond en de klant de indieningsbevestiging met een veilige referentie ontvangt. Eerdere account-, intake-, document-, parser-, fact-, bevestigings- en OTP-handelingen vormen op zichzelf geen overeenkomst.

De overeenkomst geldt voor exact één gekozen kalenderjaar en wordt niet stilzwijgend verlengd. Een volgend jaar vereist een nieuwe expliciete klantactie, legal bundle, snapshot, machtiging en ondertekening. Dwingende consumentenrechten blijven volledig gelden. Beëindiging en materiële wijzigingen werken prospectief. Aansprakelijkheid wordt niet verder beperkt dan dwingend recht toestaat; een numerieke limiet is niet ingevuld.`;

const FEE_TERMS = `Vergoedingsvoorwaarden

Versie: fee-terms-nl-v1
Geldig vanaf: [UNSET]

ENVAL garandeert geen ERE-toekenning, acceptatie, verkoop, prijs, opbrengst, uitbetaling of timing.

Netto gerealiseerde verkoopopbrengst is de werkelijk ontvangen bruto verkoopopbrengst minus gesloten, aantoonbare directe externe transactiekosten zonder opslag. De ENVAL-succesfee is 10% daarvan inclusief toepasselijke btw; het klantaandeel is 90%. Interne en algemene bedrijfskosten blijven binnen de 10%.

Er is geen fee bij intake, dossieracceptatie, ERE-toekenning alleen of verkoop zonder definitieve ontvangst. De fee ontstaat commercieel pas na ontvangst en reconciliatie. De doeltermijn voor uitbetaling is veertien kalenderdagen daarna, tenzij een concrete blokkade is vastgelegd.

Definitieve NEa-, verificateur-, hoeveelheid- of verkoopcorrecties leiden tot herberekening. Reversals bewegen de fee proportioneel; clawback is beperkt tot aantoonbare netto-overbetaling. Iedere wijziging wordt als afzonderlijke settlementrevision vastgelegd en iedere afrekening wordt gespecificeerd.`;

const MANDATE = `Machtiging

Versie: mandate-nl-v1
Geldig vanaf: [UNSET]

De server-canonical partijgegevens, iedere expliciete EAN en iedere gekoppelde relevante laadlocatie worden in de ondertekende snapshot opgenomen. De machtiging geldt niet voor later toegevoegde of niet genoemde aansluitingen of locaties.

Ik geef ENVAL opdracht om voor deze aansluitingen en locaties mijn dossier voor de ERE-E-inboekdienstverlening op te bouwen, te beheren en binnen de toepasselijke regels voor verificatie en inboeking te gebruiken.

Ik machtig de Nederlandse Emissieautoriteit (NEa) om gegevens over de genoemde elektriciteitsaansluiting(en) op te vragen bij de distributiesysteembeheerder.

Ik machtig de inboekverificateur om de genoemde laadlocatie(s) te controleren.

De machtiging geldt voor exact één volledig gekozen kalenderjaar. De afgiftedatum wordt uitsluitend server-side bij finalisatie vastgesteld. Er is geen meerjarige machtiging, stilzwijgende verlenging of aanspraak op terugwerkende kracht.

Intrekking werkt prospectief en wordt als nieuwe immutable gebeurtenis vastgelegd zonder de oorspronkelijke machtiging te wijzigen. Een Zakelijk/VvE-ondertekenaar verklaart bevoegdheid; vereist downstream gebruik blijft geblokkeerd totdat de afzonderlijke ENVAL-review voldoende is.

De methode typed_name_otp_v1 gebruikt de ingevoerde volledige naam, afzonderlijke intents, een geverifieerd kanaal en een eenmalige code. Zij claimt geen geavanceerde of gekwalificeerde elektronische handtekening.`;

export const SIGNING_LEGAL_RUNTIME_DOCUMENTS:
  readonly SigningLegalRuntimeDocument[] = [
    {
      documentType: "privacy_notice",
      version: "privacy-notice-nl-v1",
      language: "nl",
      status: "VALIDATION_CANDIDATE",
      effectiveFrom: null,
      title: "Privacyverklaring",
      canonicalContent: PRIVACY,
    },
    {
      documentType: "service_terms",
      version: "service-terms-nl-v1",
      language: "nl",
      status: "VALIDATION_CANDIDATE",
      effectiveFrom: null,
      title: "Algemene voorwaarden",
      canonicalContent: SERVICE_TERMS,
    },
    {
      documentType: "fee_terms",
      version: "fee-terms-nl-v1",
      language: "nl",
      status: "VALIDATION_CANDIDATE",
      effectiveFrom: null,
      title: "Vergoedingsvoorwaarden",
      canonicalContent: FEE_TERMS,
    },
    {
      documentType: "mandate",
      version: "mandate-nl-v1",
      language: "nl",
      status: "VALIDATION_CANDIDATE",
      effectiveFrom: null,
      title: "Machtiging",
      canonicalContent: MANDATE,
    },
  ] as const;

export type SigningLegalRuntimeEnvironment = {
  supabaseUrl: string;
};

export function isExplicitLocalSigningEnvironment(
  input: SigningLegalRuntimeEnvironment,
): boolean {
  return isLocalSupabaseRuntime(input.supabaseUrl);
}

export function signingLegalBundleAllowed(
  input: SigningLegalRuntimeEnvironment,
): boolean {
  const allCurrent = SIGNING_LEGAL_RUNTIME_DOCUMENTS.every((document) =>
    document.status === "CURRENT" &&
    Boolean(document.effectiveFrom)
  );
  return allCurrent || isExplicitLocalSigningEnvironment(input);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function stableSigningJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function signingSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function signingLegalRuntimeProjection() {
  return await Promise.all(
    SIGNING_LEGAL_RUNTIME_DOCUMENTS.map(async (document) => ({
      document_type: document.documentType,
      version: document.version,
      language: document.language,
      status: document.status,
      effective_from: document.effectiveFrom,
      title: document.title,
      canonical_content: document.canonicalContent,
      content_sha256: await signingSha256Hex(document.canonicalContent),
    })),
  );
}
