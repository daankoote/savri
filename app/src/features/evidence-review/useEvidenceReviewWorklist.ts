import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceReviewWorklistResponseV4 } from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import {
  clearEvidenceReviewWorklistSessionCache,
  type EvidenceReviewWorklistSafeError,
  loadEvidenceReviewWorklistOnce,
} from "./evidenceReviewWorklistClient.ts";

export type EvidenceReviewWorklistReadState =
  | Readonly<{ status: "loading"; value: null; error: null }>
  | Readonly<{
    status: "ready";
    value: EvidenceReviewWorklistResponseV4;
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
  const appliedRefreshNonceRef = useRef(0);
  const previousAccessTokenRef = useRef<string | null>(null);
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
    const currentAccessToken = accessToken ?? "";
    const previousAccessToken = previousAccessTokenRef.current;
    if (previousAccessToken && previousAccessToken !== currentAccessToken) {
      clearEvidenceReviewWorklistSessionCache(previousAccessToken);
    }
    previousAccessTokenRef.current = currentAccessToken || null;
    const refreshRequested = refreshNonce !== appliedRefreshNonceRef.current;
    appliedRefreshNonceRef.current = refreshNonce;
    setState({ status: "loading", value: null, error: null });

    void loadEvidenceReviewWorklistOnce({
      accessToken: currentAccessToken,
    }, { refresh: refreshRequested }).then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { status: "ready", value: result.value, error: null }
          : { status: "error", value: null, error: result.error },
      );
    });

    return () => {
      active = false;
    };
  }, [accessToken, refreshNonce]);

  return { state, refresh };
}
