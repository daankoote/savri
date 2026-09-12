export const CUSTOMER_INFORMATION_REQUEST_SCHEMA_VERSION =
  "customer-information-request-v1" as const;

export type CustomerInformationRequestState = "OPEN" | "ANSWERED";

export type CustomerInformationRequestV1 = Readonly<{
  requestRef: string;
  state: CustomerInformationRequestState;
  question: string;
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
}>;

export type CustomerInformationRequestHistoryEntryV1 =
  | Readonly<{
    status: "Afgerond";
    question: string;
    answer: string;
    askedAt: string;
    answeredAt: string;
  }>
  | Readonly<{
    status: "Ingetrokken";
    question: string;
    askedAt: string;
  }>;

export type CustomerInformationRequestCustomerReadV1 = Readonly<{
  request: CustomerInformationRequestV1 | null;
  history: readonly CustomerInformationRequestHistoryEntryV1[];
}>;

export type CustomerInformationRequestWorkforceReadV1 = Readonly<{
  canManage: boolean;
  request: CustomerInformationRequestV1 | null;
  history: readonly CustomerInformationRequestHistoryEntryV1[];
}>;

type JsonObject = Record<string, unknown>;

const REQUEST_REF_RE = /^IRQ-[0-9A-F]{16}$/;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown): string | null {
  return typeof value === "string" && value === value.trim() &&
      value.length > 0 && value.length <= 1_000 &&
      !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function parseCustomerInformationRequestSource(
  value: unknown,
): CustomerInformationRequestV1 | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "answer",
      "answered_at",
      "asked_at",
      "question",
      "request_ref",
      "state",
    ])
  ) return null;
  const requestRef = typeof value.request_ref === "string"
    ? value.request_ref
    : "";
  const state = value.state;
  const question = boundedText(value.question);
  const answer = value.answer === null ? null : boundedText(value.answer);
  const askedAt = normalizedTimestamp(value.asked_at);
  const answeredAt = value.answered_at === null
    ? null
    : normalizedTimestamp(value.answered_at);
  if (
    !REQUEST_REF_RE.test(requestRef) ||
    (state !== "OPEN" && state !== "ANSWERED") ||
    !question || !askedAt ||
    (state === "OPEN" && (answer !== null || answeredAt !== null)) ||
    (state === "ANSWERED" && (!answer || !answeredAt)) ||
    (answeredAt !== null && answeredAt < askedAt)
  ) return null;
  return Object.freeze({
    requestRef,
    state,
    question,
    answer,
    askedAt,
    answeredAt,
  });
}

export function parseCustomerInformationRequestReadSource(
  value: unknown,
): CustomerInformationRequestCustomerReadV1 | false {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["code", "history", "ok", "request", "status"]) ||
    value.ok !== true || value.status !== 200 || value.code !== "ok"
  ) return false;
  const request = value.request === null
    ? null
    : parseCustomerInformationRequestSource(value.request);
  const history = parseCustomerInformationRequestHistorySource(value.history);
  if ((value.request !== null && !request) || !history) return false;
  return Object.freeze({ request, history });
}

export function parseCustomerInformationRequestWorkforceReadSource(
  value: unknown,
): CustomerInformationRequestWorkforceReadV1 | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "can_manage",
      "code",
      "history",
      "ok",
      "request",
      "status",
    ]) ||
    value.ok !== true || value.status !== 200 || value.code !== "ok" ||
    typeof value.can_manage !== "boolean"
  ) return null;
  const request = value.request === null
    ? null
    : parseCustomerInformationRequestSource(value.request);
  const history = parseCustomerInformationRequestHistorySource(value.history);
  if ((value.request !== null && !request) || !history) return null;
  return Object.freeze({ canManage: value.can_manage, request, history });
}

function parseCustomerInformationRequestHistorySource(
  value: unknown,
): readonly CustomerInformationRequestHistoryEntryV1[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const safe: CustomerInformationRequestHistoryEntryV1[] = [];
  let previous: { askedAt: string; requestRef: string } | null = null;
  for (const entry of value) {
    if (
      !isObject(entry) ||
      !hasExactKeys(entry, [
        "answer",
        "answered_at",
        "asked_at",
        "outcome",
        "question",
        "request_ref",
      ])
    ) return null;
    const requestRef = typeof entry.request_ref === "string"
      ? entry.request_ref
      : "";
    const question = boundedText(entry.question);
    const askedAt = normalizedTimestamp(entry.asked_at);
    if (!REQUEST_REF_RE.test(requestRef) || !question || !askedAt) return null;
    if (
      previous &&
      (askedAt > previous.askedAt ||
        (askedAt === previous.askedAt && requestRef >= previous.requestRef))
    ) return null;
    previous = { askedAt, requestRef };
    if (entry.outcome === "WITHDRAWN") {
      if (entry.answer !== null || entry.answered_at !== null) return null;
      safe.push(Object.freeze({
        status: "Ingetrokken",
        question,
        askedAt,
      }));
      continue;
    }
    const answer = boundedText(entry.answer);
    const answeredAt = normalizedTimestamp(entry.answered_at);
    if (
      entry.outcome !== "RESOLVED" || !answer || !answeredAt ||
      answeredAt < askedAt
    ) return null;
    safe.push(Object.freeze({
      status: "Afgerond",
      question,
      answer,
      askedAt,
      answeredAt,
    }));
  }
  return Object.freeze(safe);
}

export function parseCustomerInformationRequestApi(
  value: unknown,
): CustomerInformationRequestV1 | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "answer",
      "answeredAt",
      "askedAt",
      "question",
      "requestRef",
      "state",
    ])
  ) return null;
  return parseCustomerInformationRequestSource({
    request_ref: value.requestRef,
    state: value.state,
    question: value.question,
    answer: value.answer,
    asked_at: value.askedAt,
    answered_at: value.answeredAt,
  });
}

export function parseCustomerInformationRequestWorkforceApi(
  value: unknown,
): CustomerInformationRequestWorkforceReadV1 | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["canManage", "history", "request"]) ||
    typeof value.canManage !== "boolean"
  ) return null;
  const request = value.request === null
    ? null
    : parseCustomerInformationRequestApi(value.request);
  const history = parseCustomerInformationRequestHistoryApi(value.history);
  if ((value.request !== null && !request) || !history) return null;
  return Object.freeze({ canManage: value.canManage, request, history });
}

export function parseCustomerInformationRequestHistoryApi(
  value: unknown,
): readonly CustomerInformationRequestHistoryEntryV1[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const safe: CustomerInformationRequestHistoryEntryV1[] = [];
  let previousAskedAt: string | null = null;
  for (const entry of value) {
    if (!isObject(entry)) return null;
    const status = entry.status;
    const question = boundedText(entry.question);
    const askedAt = normalizedTimestamp(entry.askedAt);
    if (
      !question || !askedAt || (previousAskedAt && askedAt > previousAskedAt)
    ) {
      return null;
    }
    previousAskedAt = askedAt;
    if (status === "Ingetrokken") {
      if (!hasExactKeys(entry, ["askedAt", "question", "status"])) return null;
      safe.push(Object.freeze({ status, question, askedAt }));
      continue;
    }
    if (
      status !== "Afgerond" ||
      !hasExactKeys(entry, [
        "answer",
        "answeredAt",
        "askedAt",
        "question",
        "status",
      ])
    ) return null;
    const answer = boundedText(entry.answer);
    const answeredAt = normalizedTimestamp(entry.answeredAt);
    if (!answer || !answeredAt || answeredAt < askedAt) return null;
    safe.push(Object.freeze({ status, question, answer, askedAt, answeredAt }));
  }
  return Object.freeze(safe);
}
