import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceReviewPreviewResult } from "./evidenceReviewDetailClient.ts";

export type EvidenceReviewPreviewSelection = Readonly<{
  evidenceVersionRef: string;
  label: string;
}>;

export type EvidenceReviewPreviewState =
  | Readonly<{ status: "idle"; selection: null }>
  | Readonly<{
    status: "loading";
    selection: EvidenceReviewPreviewSelection;
  }>
  | Readonly<{
    status: "ready";
    selection: EvidenceReviewPreviewSelection;
    blobUrl: string;
    filename: string;
  }>
  | Readonly<{
    status: "error";
    selection: EvidenceReviewPreviewSelection;
    message: string;
  }>;

export type EvidenceReviewPreviewLoader = (
  evidenceVersionRef: string,
  signal: AbortSignal,
) => Promise<EvidenceReviewPreviewResult>;

type PreviewSessionDependencies = Readonly<{
  load: EvidenceReviewPreviewLoader;
  publish: (state: EvidenceReviewPreviewState) => void;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}>;

export type EvidenceReviewPreviewSession = Readonly<{
  select: (selection: EvidenceReviewPreviewSelection) => Promise<void>;
  close: () => void;
  retry: () => Promise<void>;
  dispose: () => void;
}>;

export const IDLE_EVIDENCE_PREVIEW_STATE: EvidenceReviewPreviewState = Object
  .freeze({ status: "idle", selection: null });

export function createEvidenceReviewPreviewSession(
  dependencies: PreviewSessionDependencies,
): EvidenceReviewPreviewSession {
  const createObjectUrl = dependencies.createObjectUrl ??
    ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = dependencies.revokeObjectUrl ??
    ((url: string) => URL.revokeObjectURL(url));
  let activeSelection: EvidenceReviewPreviewSelection | null = null;
  let activeObjectUrl: string | null = null;
  let activeRequest: AbortController | null = null;
  let generation = 0;
  let disposed = false;

  const clearObjectUrl = () => {
    if (!activeObjectUrl) return;
    revokeObjectUrl(activeObjectUrl);
    activeObjectUrl = null;
  };

  const select = async (selection: EvidenceReviewPreviewSelection) => {
    if (disposed) return;
    generation += 1;
    const requestGeneration = generation;
    activeRequest?.abort();
    clearObjectUrl();
    activeSelection = selection;
    const request = new AbortController();
    activeRequest = request;
    dependencies.publish(Object.freeze({ status: "loading", selection }));

    let result: EvidenceReviewPreviewResult;
    try {
      result = await dependencies.load(
        selection.evidenceVersionRef,
        request.signal,
      );
    } catch (_error) {
      if (
        !disposed && !request.signal.aborted &&
        generation === requestGeneration
      ) {
        activeRequest = null;
        dependencies.publish(Object.freeze({
          status: "error",
          selection,
          message: "Het document kon niet veilig worden geladen.",
        }));
      }
      return;
    }
    if (
      disposed || request.signal.aborted || generation !== requestGeneration
    ) {
      return;
    }
    activeRequest = null;
    if (!result.ok) {
      dependencies.publish(Object.freeze({
        status: "error",
        selection,
        message: result.error.message,
      }));
      return;
    }
    try {
      activeObjectUrl = createObjectUrl(result.blob);
    } catch (_error) {
      dependencies.publish(Object.freeze({
        status: "error",
        selection,
        message: "Het document kon niet in de viewer worden geladen.",
      }));
      return;
    }
    dependencies.publish(Object.freeze({
      status: "ready",
      selection,
      blobUrl: activeObjectUrl,
      filename: result.filename,
    }));
  };

  const close = () => {
    if (disposed) return;
    generation += 1;
    activeRequest?.abort();
    activeRequest = null;
    clearObjectUrl();
    activeSelection = null;
    dependencies.publish(IDLE_EVIDENCE_PREVIEW_STATE);
  };

  return Object.freeze({
    select,
    close,
    retry: async () => {
      if (activeSelection) await select(activeSelection);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      activeRequest?.abort();
      activeRequest = null;
      clearObjectUrl();
      activeSelection = null;
    },
  });
}

export function useEvidenceReviewPreviewSession(
  load: EvidenceReviewPreviewLoader,
) {
  const [state, setState] = useState<EvidenceReviewPreviewState>(
    IDLE_EVIDENCE_PREVIEW_STATE,
  );
  const sessionRef = useRef<EvidenceReviewPreviewSession | null>(null);

  useEffect(() => {
    setState(IDLE_EVIDENCE_PREVIEW_STATE);
    const session = createEvidenceReviewPreviewSession({
      load,
      publish: setState,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [load]);

  return Object.freeze({
    state,
    select: useCallback(
      (selection: EvidenceReviewPreviewSelection) =>
        sessionRef.current?.select(selection) ?? Promise.resolve(),
      [],
    ),
    close: useCallback(() => sessionRef.current?.close(), []),
    retry: useCallback(
      () => sessionRef.current?.retry() ?? Promise.resolve(),
      [],
    ),
  });
}

export function EvidenceReviewPreviewPane({
  onRetry,
  state,
}: Readonly<{
  onRetry: () => void;
  state: EvidenceReviewPreviewState;
}>) {
  if (state.status === "idle") return null;
  return (
    <aside
      className="evidence-review-preview-pane"
      aria-label={`${state.selection.label} documentweergave`}
      aria-busy={state.status === "loading"}
    >
      {state.status === "loading"
        ? (
          <div className="review-panel" role="status" aria-live="polite">
            <h3>Document laden</h3>
            <p>Het geautoriseerde PDF-document wordt veilig opgehaald.</p>
          </div>
        )
        : null}
      {state.status === "error"
        ? (
          <div className="review-panel" role="alert">
            <h3>Document niet beschikbaar</h3>
            <p>{state.message}</p>
            <div className="section-actions">
              <button
                className="button button-secondary button-compact"
                onClick={onRetry}
                type="button"
              >
                Opnieuw proberen
              </button>
            </div>
          </div>
        )
        : null}
      {state.status === "ready"
        ? (
          <iframe
            className="evidence-review-preview-frame"
            src={state.blobUrl}
            title={`${state.selection.label}: ${state.filename}`}
          />
        )
        : null}
    </aside>
  );
}
