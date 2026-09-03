import { useCallback, useEffect, useState } from "react";
import {
  loadOperatorContext,
  type OperatorContext,
  type OperatorContextSafeError,
} from "./operatorContextClient.ts";

export type OperatorContextState =
  | Readonly<{ status: "loading"; value: null; error: null }>
  | Readonly<{ status: "ready"; value: OperatorContext; error: null }>
  | Readonly<{
    status: "denied" | "error";
    value: null;
    error: OperatorContextSafeError;
  }>;

export function useOperatorContext(accessToken: string | null): Readonly<{
  state: OperatorContextState;
  refresh: () => void;
}> {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<OperatorContextState>({
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
    void loadOperatorContext({
      accessToken: accessToken ?? "",
      signal: controller.signal,
    }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setState({ status: "ready", value: result.value, error: null });
        return;
      }
      setState({
        status: ["not_workforce", "workforce_inactive", "forbidden"].includes(
            result.error.code,
          )
          ? "denied"
          : "error",
        value: null,
        error: result.error,
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, refreshNonce]);

  return { state, refresh };
}
