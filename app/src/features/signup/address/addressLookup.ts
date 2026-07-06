import {
  createAddressLookupKey,
  isValidDutchPostcode,
  isValidHouseNumber,
  normalizeAddressLookupInput,
} from "./addressNormalizers";

export type AddressLookupInput = {
  postcode: string;
  houseNumber: string;
  suffix?: string;
};

export type AddressLookupResult = {
  normalized: {
    postcode: string;
    houseNumber: string;
    suffix: string;
    country: "Nederland";
  };
  street: string;
  city: string;
  country: "Nederland";
  bagId: string | null;
  source: "signup_lookup";
};

export type AddressLookupFailureCode =
  | "invalid_postcode"
  | "invalid_house_number"
  | "unavailable"
  | "ambiguous"
  | "not_found"
  | "network_error";

export class AddressLookupError extends Error {
  code: AddressLookupFailureCode;

  constructor(code: AddressLookupFailureCode, message: string) {
    super(message);
    this.name = "AddressLookupError";
    this.code = code;
  }
}

const lookupCache = new Map<string, AddressLookupResult>();
const pendingLookups = new Map<string, Promise<AddressLookupResult>>();
const pdokLookupUrl = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function getApiBaseUrl() {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return String(meta.env?.VITE_API_BASE_URL || "").replace(/\/+$/, "");
}

function normalizeLookupPayload(payload: unknown, input: AddressLookupInput): AddressLookupResult {
  const data = (payload || {}) as {
    street?: unknown;
    city?: unknown;
    bag_id?: unknown;
    bagId?: unknown;
    normalized?: {
      postcode?: unknown;
      house_number?: unknown;
      houseNumber?: unknown;
      suffix?: unknown;
    };
  };

  const street = String(data.street || "").trim();
  const city = String(data.city || "").trim();

  if (!street || !city) {
    throw new AddressLookupError(
      "not_found",
      "Adres niet gevonden. Controleer postcode, huisnummer en suffix.",
    );
  }

  return {
    normalized: {
      postcode: String(data.normalized?.postcode || input.postcode),
      houseNumber: String(data.normalized?.houseNumber || data.normalized?.house_number || input.houseNumber),
      suffix: String(data.normalized?.suffix || input.suffix || ""),
      country: "Nederland",
    },
    street,
    city,
    country: "Nederland",
    bagId: data.bagId ? String(data.bagId) : data.bag_id ? String(data.bag_id) : null,
    source: "signup_lookup",
  };
}

type PdokAddressDoc = {
  id?: unknown;
  type?: unknown;
  straatnaam?: unknown;
  woonplaatsnaam?: unknown;
  postcode?: unknown;
  huisnummer?: unknown;
  huisletter?: unknown;
  huisnummertoevoeging?: unknown;
  weergavenaam?: unknown;
};

function normalizeComparable(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();
}

function normalizePdokSuffix(doc: PdokAddressDoc) {
  return normalizeComparable(`${String(doc.huisletter || "")}${String(doc.huisnummertoevoeging || "")}`);
}

function getPdokDocs(payload: unknown): PdokAddressDoc[] {
  const data = payload as { response?: { docs?: unknown } };
  return Array.isArray(data?.response?.docs) ? (data.response.docs as PdokAddressDoc[]) : [];
}

function buildPdokQuery(input: AddressLookupInput) {
  return [input.postcode, input.houseNumber, input.suffix].filter(Boolean).join(" ");
}

function filterPdokCandidates(docs: PdokAddressDoc[], input: AddressLookupInput) {
  const postcode = normalizeComparable(input.postcode);
  const houseNumber = normalizeComparable(input.houseNumber);
  const suffix = normalizeComparable(input.suffix);
  const addressDocs = docs.filter((doc) => String(doc.type || "").toLowerCase() === "adres");
  const candidates = addressDocs.length > 0 ? addressDocs : docs;

  return candidates.filter((doc) => {
    const docPostcode = normalizeComparable(doc.postcode);
    const docHouseNumber = normalizeComparable(doc.huisnummer);

    if (docPostcode && docPostcode !== postcode) return false;
    if (docHouseNumber && docHouseNumber !== houseNumber) return false;
    if (suffix && normalizePdokSuffix(doc) !== suffix) return false;

    return true;
  });
}

function selectPdokCandidate(candidates: PdokAddressDoc[], input: AddressLookupInput) {
  if (candidates.length < 1) {
    throw new AddressLookupError(
      "not_found",
      "Adres niet gevonden. Controleer postcode, huisnummer en suffix.",
    );
  }

  if (!input.suffix && candidates.length > 1) {
    throw new AddressLookupError("ambiguous", "Meerdere adressen gevonden. Vul de suffix/toevoeging in.");
  }

  return candidates[0];
}

function normalizePdokCandidate(doc: PdokAddressDoc, input: AddressLookupInput): AddressLookupResult {
  const street = String(doc.straatnaam || "").trim();
  const city = String(doc.woonplaatsnaam || "").trim();

  if (!street || !city) {
    throw new AddressLookupError(
      "not_found",
      "Adres niet gevonden. Controleer postcode, huisnummer en suffix.",
    );
  }

  return {
    normalized: {
      postcode: String(doc.postcode || input.postcode),
      houseNumber: String(doc.huisnummer || input.houseNumber),
      suffix: normalizePdokSuffix(doc) || input.suffix || "",
      country: "Nederland",
    },
    street,
    city,
    country: "Nederland",
    bagId: doc.id ? String(doc.id) : null,
    source: "signup_lookup",
  };
}

async function lookupAddressViaPdok(input: AddressLookupInput): Promise<AddressLookupResult> {
  const params = new URLSearchParams({
    q: buildPdokQuery(input),
    rows: "10",
    fl: "id,type,straatnaam,woonplaatsnaam,postcode,huisnummer,huisletter,huisnummertoevoeging,weergavenaam",
  });

  const response = await fetch(`${pdokLookupUrl}?${params.toString()}`).catch(() => {
    throw new AddressLookupError("network_error", "Adrescontrole is tijdelijk niet beschikbaar.");
  });

  if (!response.ok) {
    throw new AddressLookupError("network_error", "Adrescontrole is tijdelijk niet beschikbaar.");
  }

  const json = await response.json().catch(() => {
    throw new AddressLookupError("network_error", "Adrescontrole is tijdelijk niet beschikbaar.");
  });

  const candidates = filterPdokCandidates(getPdokDocs(json), input);
  return normalizePdokCandidate(selectPdokCandidate(candidates, input), input);
}

async function lookupAddressViaConfiguredEndpoint(input: AddressLookupInput): Promise<AddressLookupResult> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    throw new AddressLookupError("unavailable", "Adrescontrole is tijdelijk niet beschikbaar.");
  }

  const response = await fetch(`${apiBaseUrl}/api-signup-address-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postcode: input.postcode,
      house_number: input.houseNumber,
      suffix: input.suffix || "",
    }),
  }).catch(() => {
    throw new AddressLookupError("network_error", "Adrescontrole is tijdelijk niet beschikbaar.");
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || json?.ok === false) {
    throw new AddressLookupError(
      "not_found",
      "Adres niet gevonden. Controleer postcode, huisnummer en suffix.",
    );
  }

  return normalizeLookupPayload(json, input);
}

async function lookupAddress(input: AddressLookupInput): Promise<AddressLookupResult> {
  try {
    return await lookupAddressViaPdok(input);
  } catch (error) {
    if (
      error instanceof AddressLookupError &&
      error.code !== "network_error" &&
      error.code !== "unavailable"
    ) {
      throw error;
    }

    return lookupAddressViaConfiguredEndpoint(input).catch(() => {
      throw new AddressLookupError("network_error", "Adrescontrole is tijdelijk niet beschikbaar.");
    });
  }
}

export async function verifyAddress(input: AddressLookupInput): Promise<AddressLookupResult> {
  const normalized = normalizeAddressLookupInput(input);

  if (!isValidDutchPostcode(normalized.postcode)) {
    throw new AddressLookupError("invalid_postcode", "Postcode is ongeldig.");
  }

  if (!isValidHouseNumber(normalized.houseNumber)) {
    throw new AddressLookupError("invalid_house_number", "Huisnummer is ongeldig.");
  }

  const key = createAddressLookupKey(normalized);
  const cached = lookupCache.get(key);
  if (cached) return cached;

  const pending = pendingLookups.get(key);
  if (pending) return pending;

  const nextLookup = lookupAddress(normalized)
    .then((result) => {
      lookupCache.set(key, result);
      return result;
    })
    .finally(() => {
      pendingLookups.delete(key);
    });

  pendingLookups.set(key, nextLookup);
  return nextLookup;
}
