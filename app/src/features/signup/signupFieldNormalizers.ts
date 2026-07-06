export function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function normalizePhone(value: string): string {
  return String(value || "").trim();
}

export function normalizePhoneForValidation(value: string): string {
  return normalizePhone(value).replace(/[\s\-().]/g, "");
}

export function isValidPhone(value: string): boolean {
  const phone = normalizePhoneForValidation(value);
  if (!phone) return true;

  return (
    /^0[1-9][0-9]{8}$/.test(phone) ||
    /^\+31[1-9][0-9]{8}$/.test(phone) ||
    /^0031[1-9][0-9]{8}$/.test(phone)
  );
}

function formatNamePart(value: string): string {
  return value
    .split("'")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join("'");
}

export function normalizeName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => word.split("-").map(formatNamePart).join("-"))
    .join(" ");
}

export function isValidName(value: string): boolean {
  const normalized = normalizeName(value);
  if (!normalized) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(normalized);
}

export function normalizeKvkNumber(value: string): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

export function cleanKvkInput(value: string): string {
  return normalizeKvkNumber(value).replace(/\D+/g, "").slice(0, 8);
}

export function isValidKvkNumber(value: string): boolean {
  return /^[0-9]{8}$/.test(normalizeKvkNumber(value));
}

export function getEmailValidationMessage(value: string): string {
  if (!value.trim() || isValidEmail(value)) return "";
  return "Controleer het e-mailadres.";
}

export function getPhoneValidationMessage(value: string): string {
  if (!value.trim() || isValidPhone(value)) return "";
  return "Controleer het telefoonnummer.";
}

export function getNameValidationMessage(value: string): string {
  if (!value.trim() || isValidName(value)) return "";
  return "Gebruik alleen letters, spaties en streepjes.";
}

export function getKvkValidationMessage(value: string): string {
  if (!value.trim() || isValidKvkNumber(value)) return "";
  return "KVK nummer moet uit 8 cijfers bestaan.";
}
