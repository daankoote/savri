import { useEffect, useRef, useState } from "react";
import type {
  CustomerInformationRequestWorkforceReadV1,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";
import {
  type CustomerInformationRequestAction,
  mutateCustomerInformationRequest,
} from "./customerInformationRequestClient.ts";
import { CustomerInformationRequestHistory } from "./CustomerInformationRequestHistory.tsx";

const WITHDRAW_CONFIRMATION =
  "De klant kan daarna niet meer antwoorden. De vraag blijft zichtbaar in de geschiedenis.";

type Props = Readonly<{
  accessToken: string;
  caseRef: string;
  model: CustomerInformationRequestWorkforceReadV1;
  onRefresh: () => void;
}>;

export function WorkforceInformationRequestPanel({
  accessToken,
  caseRef,
  model,
  onRefresh,
}: Props) {
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    attemptRef.current = null;
    setQuestion("");
    setSubmitting(false);
    setError(null);
  }, [accessToken, caseRef, model.request?.requestRef, model.request?.state]);

  if (!model.canManage && !model.request && !model.history.length) return null;

  async function mutate(action: CustomerInformationRequestAction) {
    if (submitting || !model.canManage) return;
    const text = action === "create" ? question.trim() : undefined;
    if (action === "create" && !text) return;
    const requestRef = action === "create"
      ? undefined
      : model.request?.requestRef;
    if (action !== "create" && !requestRef) return;
    const fingerprint = [action, caseRef, requestRef ?? "", text ?? ""].join(
      "\u0000",
    );
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    const attempt = attemptRef.current;
    const generation = generationRef.current;
    setSubmitting(true);
    setError(null);
    const result = await mutateCustomerInformationRequest({
      accessToken,
      idempotencyKey: attempt.key,
      mutation: { action, caseRef, requestRef, text },
    });
    if (generation !== generationRef.current) return;
    if (!result.ok) {
      setSubmitting(false);
      setError(
        result.stale
          ? "De informatievraag is gewijzigd. Vernieuw de pagina."
          : "De informatievraag kon niet worden verwerkt. Probeer het opnieuw.",
      );
      if (result.stale) onRefresh();
      return;
    }
    attemptRef.current = null;
    setQuestion("");
    onRefresh();
  }

  const request = model.request;
  return (
    <>
      {model.canManage || request
        ? (
          <section
            className="portal-card-compact"
            aria-labelledby="workforce-question-title"
          >
            <h2 id="workforce-question-title">Aanvullende vraag</h2>
            {request
              ? (
                <>
                  <p>{request.question}</p>
                  {request.state === "ANSWERED"
                    ? (
                      <div>
                        <strong>Antwoord van klant</strong>
                        <p>{request.answer}</p>
                      </div>
                    )
                    : null}
                  {model.canManage
                    ? (
                      <div className="section-actions">
                        <button
                          className={request.state === "OPEN"
                            ? "button button-secondary"
                            : "button button-primary"}
                          disabled={submitting}
                          onClick={() => {
                            const action = request.state === "OPEN"
                              ? "withdraw"
                              : "resolve";
                            if (
                              action === "withdraw" &&
                              !window.confirm(WITHDRAW_CONFIRMATION)
                            ) return;
                            void mutate(action);
                          }}
                          type="button"
                        >
                          {submitting
                            ? "Bezig…"
                            : request.state === "OPEN"
                            ? "Vraag intrekken"
                            : "Vraag afronden"}
                        </button>
                      </div>
                    )
                    : null}
                </>
              )
              : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate("create");
                  }}
                >
                  <label className="field">
                    <span>Vraag aan de klant</span>
                    <input
                      maxLength={1000}
                      onChange={(event) => setQuestion(event.target.value)}
                      required
                      type="text"
                      value={question}
                    />
                  </label>
                  <p>
                    Gebruik dit voor een korte toelichting. Ontbrekende of
                    onjuiste gegevens verwerkt u via 'Correctie nodig'.
                  </p>
                  <div className="section-actions">
                    <button
                      className="button button-primary"
                      disabled={!question.trim() || submitting}
                      type="submit"
                    >
                      {submitting ? "Bezig…" : "Vraag stellen"}
                    </button>
                  </div>
                </form>
              )}
            {error
              ? <p className="field-message" role="alert">{error}</p>
              : null}
          </section>
        )
        : null}
      <CustomerInformationRequestHistory entries={model.history} />
    </>
  );
}
