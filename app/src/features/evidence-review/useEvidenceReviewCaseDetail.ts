import { useCallback, useEffect, useState } from "react";
import type { EvidenceReviewCaseDetailResponseV1 } from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  type EvidenceReviewDetailClientConfig,
  type EvidenceReviewDetailLoadResult,
  type EvidenceReviewDetailSafeError,
  loadEvidenceReviewCaseDetail,
} from "./evidenceReviewDetailClient.ts";

const IN_FLIGHT_DETAIL_READS = new Map<
  string,
  Promise<EvidenceReviewDetailLoadResult>
>();

export function loadEvidenceReviewCaseDetailOnce(
  config: EvidenceReviewDetailClientConfig,
): Promise<EvidenceReviewDetailLoadResult> {
  const key = `${config.accessToken}\u0000${config.caseRef}`;
  const current = IN_FLIGHT_DETAIL_READS.get(key);
  if (current) return current;
  const request = loadEvidenceReviewCaseDetail(config);
  IN_FLIGHT_DETAIL_READS.set(key, request);
  void request.finally(() => {
    if (IN_FLIGHT_DETAIL_READS.get(key) === request) {
      IN_FLIGHT_DETAIL_READS.delete(key);
    }
  });
  return request;
}

export type EvidenceReviewCaseDetailReadState =
  | Readonly<{ status: "loading"; value: null; error: null }>
  | Readonly<{
    status: "ready";
    value: EvidenceReviewCaseDetailResponseV1;
    error: null;
  }>
  | Readonly<{
    status: "error";
    value: null;
    error: EvidenceReviewDetailSafeError;
  }>;

export function useEvidenceReviewCaseDetail(
  accessToken: string | null,
  caseRef: string,
): Readonly<{
  state: EvidenceReviewCaseDetailReadState;
  refresh: () => void;
}> {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<EvidenceReviewCaseDetailReadState>({
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
    setState({ status: "loading", value: null, error: null });
    void loadEvidenceReviewCaseDetailOnce({
      accessToken: accessToken ?? "",
      caseRef,
    }).then((result) => {
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
  }, [accessToken, caseRef, refreshNonce]);

  return { state, refresh };
}
