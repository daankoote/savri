import { renderToStaticMarkup } from "react-dom/server";
import {
  parseCustomerInformationRequestApi,
  parseCustomerInformationRequestHistoryApi,
  parseCustomerInformationRequestReadSource,
  parseCustomerInformationRequestSource,
  parseCustomerInformationRequestWorkforceApi,
  parseCustomerInformationRequestWorkforceReadSource,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";
import { CustomerInformationRequestPanel } from "./CustomerInformationRequestPanel.tsx";
import { CustomerInformationRequestHistory } from "./CustomerInformationRequestHistory.tsx";
import {
  buildCustomerTimelineItems,
  CustomerTimeline,
} from "../dashboard/CustomerTimeline.tsx";
import {
  mutateCustomerInformationRequest,
} from "./customerInformationRequestClient.ts";
import { WorkforceInformationRequestPanel } from "./WorkforceInformationRequestPanel.tsx";

declare const Deno: {
  exit(code: number): never;
  readTextFile(path: string): Promise<string>;
};

const CASE_REF = "CASE-7E4CC75CD19F";
const REQUEST_REF = "IRQ-0123456789ABCDEF";
const REQUEST = Object.freeze({
  requestRef: REQUEST_REF,
  state: "OPEN" as const,
  question: "Welke toelichting kunt u geven?",
  answer: null,
  askedAt: "2026-09-11T12:00:00.000Z",
  answeredAt: null,
  terminalAt: null,
});
const RESOLVED_HISTORY_ENTRY = Object.freeze({
  status: "Afgerond" as const,
  question: "Kunt u de tenaamstelling toelichten?",
  answer: "De aansluiting staat op naam van de VvE.",
  askedAt: "2026-09-11T11:00:00.000Z",
  answeredAt: "2026-09-11T11:10:00.000Z",
  terminalAt: "2026-09-11T11:20:00.000Z",
});
const HISTORY = Object.freeze([
  RESOLVED_HISTORY_ENTRY,
  Object.freeze({
    status: "Ingetrokken" as const,
    question: "Is een extra toelichting beschikbaar?",
    askedAt: "2026-09-10T10:00:00.000Z",
    terminalAt: "2026-09-10T10:05:00.000Z",
  }),
]);
const SOURCE_HISTORY = Object.freeze([
  Object.freeze({
    request_ref: "IRQ-2222222222222222",
    outcome: "RESOLVED",
    question: RESOLVED_HISTORY_ENTRY.question,
    answer: RESOLVED_HISTORY_ENTRY.answer,
    asked_at: RESOLVED_HISTORY_ENTRY.askedAt,
    answered_at: RESOLVED_HISTORY_ENTRY.answeredAt,
    terminal_at: RESOLVED_HISTORY_ENTRY.terminalAt,
  }),
  Object.freeze({
    request_ref: "IRQ-1111111111111111",
    outcome: "WITHDRAWN",
    question: HISTORY[1].question,
    answer: null,
    asked_at: HISTORY[1].askedAt,
    answered_at: null,
    terminal_at: HISTORY[1].terminalAt,
  }),
]);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function run() {
  const parsedCustomerRead = parseCustomerInformationRequestReadSource({
    ok: true,
    status: 200,
    code: "ok",
    request: null,
    history: SOURCE_HISTORY,
  });
  const parsedWorkforceRead =
    parseCustomerInformationRequestWorkforceReadSource({
      ok: true,
      status: 200,
      code: "ok",
      can_manage: true,
      request: null,
      history: SOURCE_HISTORY,
    });
  assert(
    parseCustomerInformationRequestSource({
          request_ref: REQUEST_REF,
          state: "OPEN",
          question: REQUEST.question,
          answer: null,
          asked_at: REQUEST.askedAt,
          answered_at: null,
          terminal_at: null,
        })?.requestRef === REQUEST_REF &&
      parseCustomerInformationRequestApi(REQUEST)?.state === "OPEN" &&
      parseCustomerInformationRequestWorkforceApi({
          canManage: true,
          request: REQUEST,
          history: HISTORY,
        })?.history.length === 2 &&
      parsedCustomerRead !== false && parsedCustomerRead.history.length === 2 &&
      parsedCustomerRead.history[0].terminalAt ===
        RESOLVED_HISTORY_ENTRY.terminalAt &&
      parsedWorkforceRead?.history[0].status === "Afgerond" &&
      parsedWorkforceRead.history[1].terminalAt === HISTORY[1].terminalAt,
    "information_request_contract_rejected",
  );
  assert(
    !parseCustomerInformationRequestApi({ ...REQUEST, internalId: "secret" }) &&
      !parseCustomerInformationRequestApi({
        ...REQUEST,
        terminalAt: "2026-09-11T12:15:00.000Z",
      }) &&
      !parseCustomerInformationRequestApi({
        ...REQUEST,
        question: "regel een\nregel twee",
      }) &&
      !parseCustomerInformationRequestApi({
        ...REQUEST,
        state: "RESOLVED",
      }) &&
      !parseCustomerInformationRequestHistoryApi([
        { ...HISTORY[0], internalId: "secret" },
      ]) &&
      !parseCustomerInformationRequestHistoryApi([
        { ...HISTORY[0], updatedAt: HISTORY[0].terminalAt },
      ]) &&
      !parseCustomerInformationRequestHistoryApi([
        { ...HISTORY[0], terminalAt: null },
      ]) &&
      !parseCustomerInformationRequestHistoryApi([
        { ...HISTORY[0], terminalAt: "2026-09-11T11:09:00.000Z" },
      ]) &&
      !parseCustomerInformationRequestHistoryApi([
        ...HISTORY,
        ...Array.from({ length: 49 }, () => HISTORY[1]),
      ]) &&
      !parseCustomerInformationRequestHistoryApi([...HISTORY].reverse()) &&
      !parseCustomerInformationRequestReadSource({
        ok: true,
        status: 200,
        code: "ok",
        request: null,
        history: [{ ...SOURCE_HISTORY[0], actor_ref: "internal" }],
      }) &&
      !parseCustomerInformationRequestReadSource({
        ok: true,
        status: 200,
        code: "ok",
        request: null,
        history: [{ ...SOURCE_HISTORY[0], terminal_at: null }],
      }) &&
      !parseCustomerInformationRequestReadSource({
        ok: true,
        status: 200,
        code: "ok",
        request: null,
        history: [{
          ...SOURCE_HISTORY[0],
          updated_at: SOURCE_HISTORY[0].terminal_at,
        }],
      }),
    "information_request_fail_closed_contract_invalid",
  );

  const customerOpen = renderToStaticMarkup(
    <CustomerInformationRequestPanel
      accessToken="proof-token"
      caseRef={CASE_REF}
      onRefresh={() => undefined}
      request={REQUEST}
    />,
  );
  const customerAnswered = renderToStaticMarkup(
    <CustomerInformationRequestPanel
      accessToken="proof-token"
      caseRef={CASE_REF}
      onRefresh={() => undefined}
      request={{
        ...REQUEST,
        state: "ANSWERED",
        answer: "Dit is het antwoord.",
        answeredAt: "2026-09-11T12:10:00.000Z",
      }}
    />,
  );
  const workforceEmpty = renderToStaticMarkup(
    <WorkforceInformationRequestPanel
      accessToken="proof-token"
      caseRef={CASE_REF}
      model={{ canManage: true, request: null, history: [] }}
      onRefresh={() => undefined}
    />,
  );
  const workforceOpen = renderToStaticMarkup(
    <WorkforceInformationRequestPanel
      accessToken="proof-token"
      caseRef={CASE_REF}
      model={{ canManage: true, request: REQUEST, history: [] }}
      onRefresh={() => undefined}
    />,
  );
  const workforceAnswered = renderToStaticMarkup(
    <WorkforceInformationRequestPanel
      accessToken="proof-token"
      caseRef={CASE_REF}
      model={{
        canManage: true,
        history: [],
        request: {
          ...REQUEST,
          state: "ANSWERED",
          answer: "Dit is het antwoord.",
          answeredAt: "2026-09-11T12:10:00.000Z",
        },
      }}
      onRefresh={() => undefined}
    />,
  );
  const history = renderToStaticMarkup(
    <CustomerInformationRequestHistory entries={HISTORY} />,
  );
  const emptyHistory = renderToStaticMarkup(
    <CustomerInformationRequestHistory entries={[]} />,
  );
  const workforceSource = await Deno.readTextFile(
    "app/src/features/customer-information-request/WorkforceInformationRequestPanel.tsx",
  );
  const activeDashboardSource = await Deno.readTextFile(
    "app/src/features/dashboard/ActivePrivateDashboard.tsx",
  );
  assert(
    customerOpen.includes("Welke toelichting kunt u geven?") &&
      customerOpen.includes("Vraag over uw dossier") &&
      customerOpen.includes("Antwoord versturen") &&
      !customerOpen.includes("Eerdere vragen en antwoorden") &&
      !customerOpen.includes(">OPEN<") &&
      customerAnswered.includes("Dit is het antwoord.") &&
      !customerAnswered.includes("Antwoord versturen") &&
      !customerAnswered.includes("Eerdere vragen en antwoorden") &&
      workforceEmpty.includes("Vraag stellen") &&
      workforceEmpty.includes("Aanvullende vraag") &&
      workforceEmpty.includes(
        "Gebruik dit voor een korte toelichting. Ontbrekende of onjuiste gegevens verwerkt u via &#x27;Correctie nodig&#x27;.",
      ) &&
      workforceOpen.includes("Vraag intrekken") &&
      workforceAnswered.includes("Vraag afronden") &&
      !workforceAnswered.includes(">ANSWERED<") &&
      history.includes("Eerdere vragen en antwoorden") &&
      history.includes("Kunt u de tenaamstelling toelichten?") &&
      history.includes("De aansluiting staat op naam van de VvE.") &&
      history.includes("Afgerond") && history.includes("Ingetrokken") &&
      history.includes("Is een extra toelichting beschikbaar?") &&
      !emptyHistory.includes("Eerdere vragen en antwoorden") &&
      activeDashboardSource.indexOf("<CustomerInformationRequestPanel") <
        activeDashboardSource.indexOf("<CustomerTimeline") &&
      !activeDashboardSource.includes(
        "history={model.information_request_history}",
      ) &&
      workforceSource.includes("window.confirm(WITHDRAW_CONFIRMATION)") &&
      workforceSource.includes(
        "De klant kan daarna niet meer antwoorden. De vraag blijft zichtbaar in de geschiedenis.",
      ),
    "information_request_ui_state_matrix_invalid",
  );

  const baseTimeline = [{
    event_id: "tle_11111111111111111111111111111111",
    event_type: "dossier_submitted" as const,
    occurred_at: "2026-09-11T12:00:00.000Z",
    title: "Dossier ontvangen",
    text: "Uw dossier is ontvangen en in behandeling.",
  }];
  const openItems = buildCustomerTimelineItems({
    events: baseTimeline,
    informationRequest: REQUEST,
    informationRequestHistory: [],
  });
  const answeredRequest = {
    ...REQUEST,
    state: "ANSWERED" as const,
    answer: "Dit is het volledige antwoord.",
    answeredAt: "2026-09-11T12:10:00.000Z",
  };
  const answeredItems = buildCustomerTimelineItems({
    events: [],
    informationRequest: answeredRequest,
    informationRequestHistory: [],
  });
  const historyItems = buildCustomerTimelineItems({
    events: [],
    informationRequest: null,
    informationRequestHistory: HISTORY,
  });
  const emptyInformationRequestItems = buildCustomerTimelineItems({
    events: baseTimeline,
    informationRequest: null,
    informationRequestHistory: [],
  });
  const equalTimestampItems = buildCustomerTimelineItems({
    events: baseTimeline,
    informationRequest: {
      ...answeredRequest,
      answeredAt: REQUEST.askedAt,
    },
    informationRequestHistory: [],
  });
  const repeatedItems = buildCustomerTimelineItems({
    events: baseTimeline,
    informationRequest: REQUEST,
    informationRequestHistory: HISTORY,
  });
  const switchedCaseItems = buildCustomerTimelineItems({
    events: [],
    informationRequest: {
      ...REQUEST,
      requestRef: "IRQ-FEDCBA9876543210",
      question: "Vraag uit het tweede dossier.",
    },
    informationRequestHistory: [],
  });
  const timelineMarkup = renderToStaticMarkup(
    <CustomerTimeline
      events={baseTimeline}
      informationRequest={REQUEST}
      informationRequestHistory={HISTORY}
    />,
  );
  assert(
    openItems.filter((item) => item.title === "Vraag gesteld").length === 1 &&
      openItems.some((item) =>
        item.occurredAt === REQUEST.askedAt &&
        item.text === REQUEST.question
      ) &&
      answeredItems.map((item) => item.title).join("|") ===
        "Antwoord verstuurd|Vraag gesteld" &&
      answeredItems[0].occurredAt === answeredRequest.answeredAt &&
      answeredItems[0].text === answeredRequest.answer &&
      historyItems.map((item) => item.title).join("|") ===
        "Vraag afgerond|Antwoord verstuurd|Vraag gesteld|Vraag ingetrokken|Vraag gesteld" &&
      historyItems[0].occurredAt === RESOLVED_HISTORY_ENTRY.terminalAt &&
      historyItems[1].occurredAt === RESOLVED_HISTORY_ENTRY.answeredAt &&
      historyItems[1].text === RESOLVED_HISTORY_ENTRY.answer &&
      historyItems[2].occurredAt === RESOLVED_HISTORY_ENTRY.askedAt &&
      historyItems[2].text === RESOLVED_HISTORY_ENTRY.question &&
      historyItems[3].occurredAt === HISTORY[1].terminalAt &&
      historyItems[3].text === null &&
      historyItems[4].occurredAt === HISTORY[1].askedAt &&
      !historyItems.some((item) =>
        item.title === "Antwoord verstuurd" && item.text === HISTORY[1].question
      ) &&
      equalTimestampItems.map((item) => item.title).join("|") ===
        "Dossier ontvangen|Antwoord verstuurd|Vraag gesteld" &&
      emptyInformationRequestItems.length === 1 &&
      emptyInformationRequestItems[0].identity ===
        `dossier:${baseTimeline[0].event_id}` &&
      new Set(repeatedItems.map((item) => item.identity)).size ===
        repeatedItems.length &&
      JSON.stringify(repeatedItems) === JSON.stringify(
          buildCustomerTimelineItems({
            events: baseTimeline,
            informationRequest: REQUEST,
            informationRequestHistory: HISTORY,
          }),
        ) &&
      !switchedCaseItems.some((item) => item.text === REQUEST.question) &&
      switchedCaseItems.some((item) =>
        item.text === "Vraag uit het tweede dossier."
      ) &&
      occurrences(timelineMarkup, "Vraag gesteld") === 3 &&
      timelineMarkup.includes(REQUEST.question) &&
      !timelineMarkup.includes("Eerdere vragen en antwoorden"),
    "customer_information_request_timeline_projection_invalid",
  );

  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({
      schemaVersion: "customer-information-request-mutation-v1",
      action: "respond",
      request: {
        ...REQUEST,
        state: "ANSWERED",
        answer: "Dit is het antwoord.",
        answeredAt: "2026-09-11T12:10:00.000Z",
      },
    });
  }) as typeof fetch;
  const mutation = await mutateCustomerInformationRequest({
    accessToken: "proof-token",
    idempotencyKey: "proof-idempotency-key",
    mutation: {
      action: "respond",
      caseRef: CASE_REF,
      requestRef: REQUEST_REF,
      text: "Dit is het antwoord.",
    },
    fetchImpl,
    runtimeConfig: {
      anonKey: "proof-anon-key",
      apiBaseUrl: "http://127.0.0.1:54321/functions/v1",
    },
  });
  const sent = JSON.parse(String(calls[0]?.init?.body));
  assert(
    mutation.ok && mutation.request?.state === "ANSWERED" &&
      calls.length === 1 &&
      sent.action === "respond" && sent.caseRef === CASE_REF &&
      sent.requestRef === REQUEST_REF &&
      sent.answer === "Dit is het antwoord." &&
      Object.keys(sent).sort().join("|") ===
        "action|answer|caseRef|requestRef" &&
      !JSON.stringify(sent).includes("authUserId") &&
      !JSON.stringify(sent).includes("customerId") &&
      !JSON.stringify(sent).includes("tenantId"),
    "information_request_mutation_transport_invalid",
  );
  const stale = await mutateCustomerInformationRequest({
    accessToken: "proof-token",
    idempotencyKey: "proof-idempotency-key-stale",
    mutation: {
      action: "withdraw",
      caseRef: CASE_REF,
      requestRef: REQUEST_REF,
    },
    fetchImpl: async () => jsonResponse({ code: "conflict" }, 409),
    runtimeConfig: {
      anonKey: "proof-anon-key",
      apiBaseUrl: "http://127.0.0.1:54321/functions/v1",
    },
  });
  assert(!stale.ok && stale.stale, "information_request_stale_not_detected");

  console.log("CUSTOMER_INFORMATION_REQUEST_CLIENT_Q01_Q04=PASS");
  console.log("CUSTOMER_INFORMATION_REQUEST_TIMELINE_Q01_Q10=PASS");
  console.log("CUSTOMER_INFORMATION_REQUEST_WORKFORCE_UNCHANGED=PASS");
}

try {
  await run();
  Deno.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
