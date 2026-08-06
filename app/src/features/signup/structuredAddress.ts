export type StructuredDutchAddress = {
  street: string | null | undefined;
  houseNumber: string | null | undefined;
  houseNumberAddition: string | null | undefined;
  postalCode: string | null | undefined;
  city: string | null | undefined;
  country: string | null | undefined;
};

export type StructuredAddressValueMatch =
  | "match"
  | "probable"
  | "mismatch"
  | "unavailable";

function clean(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function hasMeaningfulManualAddress(
  address: StructuredDutchAddress,
): boolean {
  return Boolean(
    clean(address.street) &&
      clean(address.houseNumber) &&
      clean(address.postalCode) &&
      clean(address.city),
  );
}

export function normalizeHouseNumberAddition(
  value: string | null | undefined,
): string {
  return clean(value).replace(/[\s\-/]+/g, "").toLocaleUpperCase("nl-NL");
}

export function formatDutchHouseNumber(
  houseNumber: string | null | undefined,
  houseNumberAddition: string | null | undefined,
): string {
  const number = clean(houseNumber);
  const addition = normalizeHouseNumberAddition(houseNumberAddition);
  if (!number) return "";
  return addition ? `${number}-${addition}` : number;
}

export function formatStructuredDutchAddress(
  address: StructuredDutchAddress,
): string {
  const streetLine = [
    clean(address.street),
    formatDutchHouseNumber(
      address.houseNumber,
      address.houseNumberAddition,
    ),
  ].filter(Boolean).join(" ");
  const cityLine = [clean(address.postalCode), clean(address.city)]
    .filter(Boolean).join(" ");

  return [streetLine, cityLine, clean(address.country)].filter(Boolean).join(
    ", ",
  );
}

function formattedAddressIdentity(value: string): {
  postcode: string;
  houseNumber: string;
  addition: string;
} | null {
  const normalized = clean(value).toLocaleUpperCase("nl-NL");
  const postcodeMatch = /\b([0-9]{4})\s*([A-Z]{2})\b/.exec(normalized);
  if (!postcodeMatch || postcodeMatch.index === undefined) return null;
  const addressLine = normalized.slice(0, postcodeMatch.index)
    .replace(/[,\s]+$/g, "");
  const numberMatch = /\b([0-9]{1,4})(?:\s*[-/]\s*|\s+)?([A-Z0-9]{1,4})?$/
    .exec(addressLine);
  if (!numberMatch) return null;
  return {
    postcode: `${postcodeMatch[1]}${postcodeMatch[2]}`,
    houseNumber: numberMatch[1],
    addition: normalizeHouseNumberAddition(numberMatch[2]),
  };
}

export function compareFormattedDutchAddresses(
  left: string,
  right: string,
): StructuredAddressValueMatch {
  const leftIdentity = formattedAddressIdentity(left);
  const rightIdentity = formattedAddressIdentity(right);
  if (!leftIdentity || !rightIdentity) return "unavailable";
  if (
    leftIdentity.postcode !== rightIdentity.postcode ||
    leftIdentity.houseNumber !== rightIdentity.houseNumber
  ) return "mismatch";
  if (
    leftIdentity.addition && rightIdentity.addition &&
    leftIdentity.addition !== rightIdentity.addition
  ) return "mismatch";
  if (Boolean(leftIdentity.addition) !== Boolean(rightIdentity.addition)) {
    return "probable";
  }
  return "match";
}
