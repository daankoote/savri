import type { AddressLookupInput } from "./addressLookup";

export function normalizePostcode(value: string): string {
  return String(value || "").replace(/\s+/g, "").toUpperCase().trim();
}

export function normalizeSuffix(value: string): string {
  return String(value || "").replace(/\s+/g, "").toUpperCase().trim();
}

export function normalizeHouseNumber(value: string): string {
  return String(value || "").replace(/\D+/g, "").trim();
}

export function cleanPostcodeInput(value: string): string {
  return normalizePostcode(value).replace(/[^0-9A-Z]/g, "").slice(0, 6);
}

export function cleanHouseNumberInput(value: string): string {
  return normalizeHouseNumber(value).slice(0, 4);
}

export function cleanSuffixInput(value: string): string {
  return normalizeSuffix(value).replace(/[^0-9A-Z]/g, "").slice(0, 4);
}

export function isValidDutchPostcode(value: string): boolean {
  return /^[0-9]{4}[A-Z]{2}$/.test(normalizePostcode(value));
}

export function isValidHouseNumber(value: string): boolean {
  return /^[1-9][0-9]{0,3}$/.test(normalizeHouseNumber(value));
}

export function isValidSuffix(value: string): boolean {
  const suffix = normalizeSuffix(value);
  if (!suffix) return true;

  // TODO: expand suffix edge cases after real-world QA.
  return /^([1-9][0-9]?|100)[A-Z]{0,3}$/.test(suffix) || /^[A-Z]{1,3}$/.test(suffix);
}

export function getPostcodeValidationMessage(value: string): string {
  const normalized = normalizePostcode(value);
  if (!normalized || normalized.length < 6 || isValidDutchPostcode(normalized)) return "";
  return "Gebruik postcode zoals 1234AB.";
}

export function getHouseNumberValidationMessage(value: string): string {
  const normalized = normalizeHouseNumber(value);
  if (!normalized || isValidHouseNumber(normalized)) return "";
  return "Gebruik alleen cijfers tot 9999.";
}

export function getSuffixValidationMessage(value: string): string {
  const normalized = normalizeSuffix(value);
  if (!normalized || isValidSuffix(normalized)) return "";
  return "Controleer de suffix/toevoeging.";
}

export function createAddressLookupKey(input: AddressLookupInput): string {
  return [
    normalizePostcode(input.postcode),
    normalizeHouseNumber(input.houseNumber),
    normalizeSuffix(input.suffix || ""),
  ].join("|");
}

export function normalizeAddressLookupInput(input: AddressLookupInput): AddressLookupInput {
  return {
    postcode: normalizePostcode(input.postcode),
    houseNumber: normalizeHouseNumber(input.houseNumber),
    suffix: normalizeSuffix(input.suffix || ""),
  };
}

export function isLookupReady(input: AddressLookupInput): boolean {
  return isValidDutchPostcode(input.postcode) && isValidHouseNumber(input.houseNumber) && isValidSuffix(input.suffix || "");
}
