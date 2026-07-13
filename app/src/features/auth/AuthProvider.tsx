import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getCurrentAuthSession,
  signInWithSupabasePassword,
  signOutLocalSupabaseSession,
  signOutWithSupabase,
  signUpWithSupabasePassword,
  subscribeToAuthState,
} from "./authClient";
import { bootstrapAppCustomerAuth } from "./authBootstrapClient";
import { isTerminalBootstrapBindingError, safeAuthError } from "./authErrorMapping";
import type { AuthActionResult, AuthBootstrapSummary, AuthContextValue, AuthSafeError, AuthStatus } from "./authTypes";

const AuthContext = createContext<AuthContextValue | null>(null);

type BootstrapAttempt = {
  idempotencyKey: string;
  promise: Promise<AuthActionResult>;
  userId: string;
};

function isVerifiedSession(session: Session): boolean {
  return Boolean(session.user.email && (session.user.email_confirmed_at || session.user.confirmed_at));
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `auth-bootstrap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readyResult(summary: AuthBootstrapSummary): AuthActionResult {
  return { ok: true, status: "ready", summary };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<AuthBootstrapSummary | null>(null);
  const [error, setError] = useState<AuthSafeError | null>(null);
  const bootstrapAttemptRef = useRef<BootstrapAttempt | null>(null);
  const readyUserIdRef = useRef<string | null>(null);
  const summaryRef = useRef<AuthBootstrapSummary | null>(null);

  const clearBoundState = useCallback(() => {
    bootstrapAttemptRef.current = null;
    readyUserIdRef.current = null;
    summaryRef.current = null;
    setSummary(null);
    setError(null);
  }, []);

  const setSignedOut = useCallback(() => {
    setSession(null);
    clearBoundState();
    setStatus("signed_out");
  }, [clearBoundState]);

  const bootstrapSession = useCallback(async (nextSession: Session): Promise<AuthActionResult> => {
    const userId = nextSession.user.id;

    setSession(nextSession);
    setError(null);

    if (!isVerifiedSession(nextSession)) {
      const nextError = safeAuthError("auth_email_not_verified");
      bootstrapAttemptRef.current = null;
      readyUserIdRef.current = null;
      summaryRef.current = null;
      setSummary(null);
      setError(nextError);
      setStatus("error");
      return { ok: false, error: nextError };
    }

    if (readyUserIdRef.current === userId && summaryRef.current) {
      setStatus("ready");
      return readyResult(summaryRef.current);
    }

    if (bootstrapAttemptRef.current?.userId === userId) {
      return bootstrapAttemptRef.current.promise;
    }

    if (readyUserIdRef.current && readyUserIdRef.current !== userId) {
      summaryRef.current = null;
      setSummary(null);
      setError(null);
      readyUserIdRef.current = null;
    }

    setStatus("authenticated_unbound");
    setStatus("bootstrapping");

    const idempotencyKey = createIdempotencyKey();
    const promise = bootstrapAppCustomerAuth({
      accessToken: nextSession.access_token,
      idempotencyKey,
    }).then(async (result): Promise<AuthActionResult> => {
      bootstrapAttemptRef.current = null;

      if (!result.ok) {
        if (isTerminalBootstrapBindingError(result.error.code)) {
          clearBoundState();
          setSession(null);
          setStatus("signed_out");
          await signOutLocalSupabaseSession().catch(() => undefined);
          return { ok: false, error: result.error };
        }

        setSummary(null);
        setError(result.error);
        setStatus("error");
        return { ok: false, error: result.error };
      }

      readyUserIdRef.current = userId;
      summaryRef.current = result.summary;
      setSummary(result.summary);
      setError(null);
      setStatus("ready");
      return readyResult(result.summary);
    });

    bootstrapAttemptRef.current = { idempotencyKey, promise, userId };
    return promise;
  }, []);

  useEffect(() => {
    let active = true;

    const subscription = subscribeToAuthState((_event, nextSession) => {
      if (!active) return;

      if (!nextSession) {
        setSignedOut();
        return;
      }

      if (readyUserIdRef.current === nextSession.user.id) {
        setSession(nextSession);
        return;
      }

      void bootstrapSession(nextSession);
    });

    getCurrentAuthSession().then((initialSession) => {
      if (!active) return;

      if (!initialSession) {
        setSignedOut();
        return;
      }

      void bootstrapSession(initialSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [bootstrapSession, setSignedOut]);

  const signUpWithPassword = useCallback<AuthContextValue["signUpWithPassword"]>(
    async (email, password, passwordConfirmation) => {
      if (password !== passwordConfirmation) {
        return { ok: false, error: safeAuthError("password_mismatch") };
      }

      if (password.length < 8) {
        return { ok: false, error: safeAuthError("password_too_short") };
      }

      const result = await signUpWithSupabasePassword(email, password);
      if (!result.ok) return result.result;

      if (!result.session) {
        setStatus("signed_out");
        return {
          ok: true,
          status: "verification_required",
          message: "Controleer uw e-mail om het account te bevestigen.",
        };
      }

      return bootstrapSession(result.session);
    },
    [bootstrapSession],
  );

  const signInWithPassword = useCallback<AuthContextValue["signInWithPassword"]>(
    async (email, password) => {
      const result = await signInWithSupabasePassword(email, password);
      if (!result.ok) return result.result;

      return bootstrapSession(result.session);
    },
    [bootstrapSession],
  );

  const retryBootstrap = useCallback<AuthContextValue["retryBootstrap"]>(async () => {
    if (!session) return { ok: false, error: safeAuthError("invalid_response") };
    bootstrapAttemptRef.current = null;
    return bootstrapSession(session);
  }, [bootstrapSession, session]);

  const signOut = useCallback(async () => {
    clearBoundState();
    setSession(null);
    setStatus("signed_out");
    await signOutWithSupabase();
  }, [clearBoundState]);

  const value = useMemo<AuthContextValue>(() => ({
    error,
    retryBootstrap,
    session,
    signInWithPassword,
    signOut,
    signUpWithPassword,
    status,
    summary,
  }), [error, retryBootstrap, session, signInWithPassword, signOut, signUpWithPassword, status, summary]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
