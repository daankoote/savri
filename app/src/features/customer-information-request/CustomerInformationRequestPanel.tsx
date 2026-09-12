import { useEffect, useRef, useState } from "react";
import type {
  CustomerInformationRequestHistoryEntryV1,
  CustomerInformationRequestV1,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";
import { mutateCustomerInformationRequest } from "./customerInformationRequestClient.ts";
import { CustomerInformationRequestHistory } from "./CustomerInformationRequestHistory.tsx";

type Props = Readonly<{
  accessToken: string;
  caseRef: string;
  history: readonly CustomerInformationRequestHistoryEntryV1[];
  request: CustomerInformationRequestV1 | null;
  onRefresh: () => Promise<unknown> | void;
}>;

export function CustomerInformationRequestPanel({
  accessToken,
  caseRef,
  history,
  request,
  onRefresh,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    attemptRef.current = null;
    setAnswer("");
    setSubmitting(false);
    setError(null);
  }, [accessToken, caseRef, request?.requestRef, request?.state]);

  async function submitAnswer() {
    const text = answer.trim();
    if (!text || submitting || request?.state !== "OPEN") return;
    const fingerprint = `${caseRef}\u0000${request.requestRef}\u0000${text}`;
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
      mutation: {
        action: "respond",
        caseRef,
        requestRef: request.requestRef,
        text,
      },
    });
    if (generation !== generationRef.current) return;
    if (!result.ok) {
      setSubmitting(false);
      setError(
        result.stale
          ? "De informatievraag is gewijzigd. Vernieuw de pagina."
          : "Uw antwoord kon niet worden verstuurd. Probeer het opnieuw.",
      );
      if (result.stale) void onRefresh();
      return;
    }
    attemptRef.current = null;
    setAnswer("");
    await onRefresh();
  }

  return (
    <>
      {request
        ? (
          <section
            className="portal-card-compact"
            aria-labelledby="customer-question-title"
          >
            <h2 id="customer-question-title">Vraag over uw dossier</h2>
            <p>{request.question}</p>
            {request.state === "OPEN"
              ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitAnswer();
                  }}
                >
                  <label className="field">
                    <span>Uw antwoord</span>
                    <input
                      maxLength={1000}
                      onChange={(event) => setAnswer(event.target.value)}
                      required
                      type="text"
                      value={answer}
                    />
                  </label>
                  {error
                    ? <p className="field-message" role="alert">{error}</p>
                    : null}
                  <div className="section-actions">
                    <button
                      className="button button-primary"
                      disabled={!answer.trim() || submitting}
                      type="submit"
                    >
                      {submitting ? "Bezig…" : "Antwoord versturen"}
                    </button>
                  </div>
                </form>
              )
              : (
                <div>
                  <strong>Uw antwoord</strong>
                  <p>{request.answer}</p>
                </div>
              )}
          </section>
        )
        : null}
      <CustomerInformationRequestHistory entries={history} />
    </>
  );
}
