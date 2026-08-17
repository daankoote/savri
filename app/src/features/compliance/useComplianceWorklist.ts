import { useCallback, useEffect, useState } from "react";
import type { ComplianceWorklistResponseV1 } from "../../../../supabase/functions/_shared/app_compliance_worklist.ts";
import {
  loadComplianceWorklist,
  type ComplianceWorklistSafeError,
} from "./complianceWorklistClient.ts";

export type ComplianceWorklistReadState =
  | Readonly<{ status: "loading"; value: null; error: null }>
  | Readonly<{ status: "ready"; value: ComplianceWorklistResponseV1; error: null }>
  | Readonly<{ status: "error"; value: null; error: ComplianceWorklistSafeError }>;

export function useComplianceWorklist(accessToken: string | null): Readonly<{
  state: ComplianceWorklistReadState;
  refresh: () => void;
}> {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<ComplianceWorklistReadState>({
    status: "loading",
    value: null,
    error: null,
  });
  const refresh = useCallback(() => setRefreshNonce((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: "loading", value: null, error: null });

    void loadComplianceWorklist({
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
