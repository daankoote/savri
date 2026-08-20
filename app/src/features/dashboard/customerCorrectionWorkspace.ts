import type {
  CustomerCorrectionHandoffItem,
  CustomerCorrectionResponseRequirement,
} from "./customerCorrectionHandoffClient.ts";

export const CUSTOMER_CORRECTION_VALUE_MAX_LENGTH = 2_000;

export type CustomerCorrectionDraft = Readonly<Record<string, string>>;

export type CustomerCorrectionResponse = Readonly<{
  itemRef: string;
  correctedValue: string;
}>;

export type CustomerCorrectionWorkspaceItem = Readonly<{
  item: CustomerCorrectionHandoffItem;
  correctedValue: string;
  normalizedValue: string;
  supported: boolean;
  valid: boolean;
  sameAsCurrentValue: boolean;
}>;

export type CustomerCorrectionWorkspace = Readonly<{
  items: readonly CustomerCorrectionWorkspaceItem[];
  responses: readonly CustomerCorrectionResponse[];
  hasUnsupportedAction: boolean;
  ready: boolean;
}>;

const SUPPORTED_REQUIREMENTS = new Set<CustomerCorrectionResponseRequirement>([
  "VALUE_CORRECTION",
  "MISSING_VALUE",
]);

export function normalizeCustomerCorrectionValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function customerCorrectionCurrentValueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch (_error) {
    return "";
  }
}

export function createCustomerCorrectionDraft(
  items: readonly CustomerCorrectionHandoffItem[],
): CustomerCorrectionDraft {
  return Object.freeze(
    Object.fromEntries(items.map((item) => [item.itemRef, ""])),
  );
}

export function customerCorrectionItemSetKey(
  items: readonly CustomerCorrectionHandoffItem[],
): string {
  return items.map((item) => item.itemRef).join(":");
}

export function buildCustomerCorrectionWorkspace(
  items: readonly CustomerCorrectionHandoffItem[],
  draft: CustomerCorrectionDraft,
): CustomerCorrectionWorkspace {
  const workspaceItems = items.map((item): CustomerCorrectionWorkspaceItem => {
    const correctedValue = draft[item.itemRef] ?? "";
    const normalizedValue = normalizeCustomerCorrectionValue(correctedValue);
    const supported = SUPPORTED_REQUIREMENTS.has(item.responseRequirement);
    const comparableCurrentValue = "currentValue" in item
      ? normalizeCustomerCorrectionValue(
        customerCorrectionCurrentValueText(item.currentValue),
      )
      : "";
    const sameAsCurrentValue =
      item.responseRequirement === "VALUE_CORRECTION" &&
      comparableCurrentValue !== "" &&
      normalizedValue === comparableCurrentValue;
    const valid = supported && normalizedValue.length >= 1 &&
      normalizedValue.length <= CUSTOMER_CORRECTION_VALUE_MAX_LENGTH &&
      !sameAsCurrentValue;
    return Object.freeze({
      item,
      correctedValue,
      normalizedValue,
      supported,
      valid,
      sameAsCurrentValue,
    });
  });
  const hasUnsupportedAction = workspaceItems.some((item) => !item.supported);
  const ready = workspaceItems.length > 0 && !hasUnsupportedAction &&
    workspaceItems.every((item) => item.valid);
  const responses = ready
    ? workspaceItems.map((item) =>
      Object.freeze({
        itemRef: item.item.itemRef,
        correctedValue: item.normalizedValue,
      })
    )
    : [];
  return Object.freeze({
    items: Object.freeze(workspaceItems),
    responses: Object.freeze(responses),
    hasUnsupportedAction,
    ready,
  });
}

export function customerCorrectionChallengeBindingKey(
  responses: readonly CustomerCorrectionResponse[],
  typedFullName: string,
  intentAccepted: boolean,
): string {
  return JSON.stringify({
    responses,
    typedFullName,
    intentAccepted,
  });
}
