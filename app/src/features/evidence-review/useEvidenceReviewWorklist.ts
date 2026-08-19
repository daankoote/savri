import { useCallback, useEffect, useState } from "react";
import type { EvidenceReviewWorklistResponseV3 } from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import {
  loadEvidenceReviewWorklist,
  type EvidenceReviewWorklistSafeError,
} from "./evidenceReviewWorklistClient.ts";

export type EvidenceReviewWorklistReadState =
  | Readonly<{ status: "loading"; value: null; error: null }>
  | Readonly<{
    status: "ready";
    value: EvidenceReviewWorklistResponseV3;
    error: null;
  }>
  | Readonly<{
    status: "error";
    value: null;
    error: EvidenceReviewWorklistSafeError;
  }>;

export function useEvidenceReviewWorklist(
  accessToken: string | null,
): Readonly<{
  state: EvidenceReviewWorklistReadState;
  refresh: () => void;
}> {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<EvidenceReviewWorklistReadState>({
    status: "loading",
    value: null,
    error: null,
  });
  const refresh = useCallback(
    () => setRefreshNonce((current) => current + 1),
    [],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: "loading", value: null, error: null });

    void loadEvidenceReviewWorklist({
      accessToken: accessToken ?? "",
      signal: controller.signal,
    }).then((result) => {
      if (!active) return;
      setState(result.ok
        ? { status: "ready", value: result.value, error: null }
        : { status: "error", value: null, error: result.error });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, refreshNonce]);

  return { state, refresh };
}
