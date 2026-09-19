import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getCurrentAuthSessionResult,
  signInWithSupabasePassword,
  signOutLocalSupabaseSession,
  signOutWithSupabase,
  signUpWithSupabasePassword,
  subscribeToAuthState,
  updateSupabaseRecoveryPassword,
} from "./authClient";
import { bootstrapAppCustomerAuth } from "./authBootstrapClient";
import {
  clearAuthorizedPortalAccessSessionCache,
  resolveAuthorizedPortalAccessOnce,
} from "./authorizedPortalAccess";
import { clearEvidenceReviewWorklistSessionCache } from "../evidence-review/evidenceReviewWorklistClient";
import {
  isTerminalBootstrapBindingError,
  safeAuthError,
} from "./authErrorMapping";
import {
  type AuthProviderIntent,
  clearAuthCallbackUrl,
  hasPasswordRecoveryCallbackData,
  resolveAuthEventDisposition,
} from "./authUxFlow";
import type {
  AuthActionResult,
  AuthAudience,
  AuthBootstrapSummary,
  AuthContextValue,
  AuthorizedPortalNavigation,
  AuthSafeError,
  AuthStatus,
} from "./authTypes";

const AuthContext = createContext<AuthContextValue | null>(null);

type BootstrapAttempt = {
  audience: AuthAudience;
  idempotencyKey: string;
  promise: Promise<AuthActionResult>;
  userId: string;
};

function isVerifiedSession(session: Session): boolean {
  return Boolean(
    session.user.email &&
      (session.user.email_confirmed_at || session.user.confirmed_at),
  );
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `auth-bootstrap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readyResult(summary: AuthBootstrapSummary | null): AuthActionResult {
  return { ok: true, status: "ready", summary };
}

export function AuthProvider({
  audience = "customer",
  children,
  intent = "portal",
}: Readonly<
  { audience?: AuthAudience; children: ReactNode; intent?: AuthProviderIntent }
>) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<AuthBootstrapSummary | null>(null);
  const [portalNavigation, setPortalNavigation] = useState<
    AuthorizedPortalNavigation | null
  >(null);
  const [error, setError] = useState<AuthSafeError | null>(null);
  const bootstrapAttemptRef = useRef<BootstrapAttempt | null>(null);
  const bootstrapGenerationRef = useRef(0);
  const readyUserIdRef = useRef<string | null>(null);
  const recoveryReadyRef = useRef(false);
  const recoveryEventSeenRef = useRef(false);
  const recoveryValidationStartedRef = useRef(false);
  const rejectedRecoveryRef = useRef(false);
  const recoveryCallbackPresentRef = useRef(
    hasPasswordRecoveryCallbackData(window.location.hash),
  );
  const summaryRef = useRef<AuthBootstrapSummary | null>(null);
  const portalNavigationRef = useRef<AuthorizedPortalNavigation | null>(null);

  const clearBoundState = useCallback(() => {
    bootstrapGenerationRef.current += 1;
    clearAuthorizedPortalAccessSessionCache();
    clearEvidenceReviewWorklistSessionCache();
    bootstrapAttemptRef.current = null;
    readyUserIdRef.current = null;
    summaryRef.current = null;
    portalNavigationRef.current = null;
    setSummary(null);
    setPortalNavigation(null);
    setError(null);
  }, []);

  const setSignedOut = useCallback(() => {
    setSession(null);
    clearBoundState();
    setStatus("signed_out");
  }, [clearBoundState]);

  const setRecoveryInvalid = useCallback(() => {
    recoveryReadyRef.current = false;
    setSession(null);
    clearBoundState();
    setError(safeAuthError("recovery_link_invalid"));
    setStatus("error");
    clearAuthCallbackUrl();
  }, [clearBoundState]);

  const setRecoveryReady = useCallback((nextSession: Session) => {
    recoveryReadyRef.current = true;
    rejectedRecoveryRef.current = false;
    clearBoundState();
    setSession(nextSession);
    setError(null);
    setStatus("recovery_ready");
    clearAuthCallbackUrl();
  }, [clearBoundState]);

  const bootstrapSession = useCallback(
    async (nextSession: Session): Promise<AuthActionResult> => {
      const userId = nextSession.user.id;

      setSession(nextSession);
      setError(null);

      if (!isVerifiedSession(nextSession)) {
        const nextError = safeAuthError("auth_email_not_verified");
        bootstrapGenerationRef.current += 1;
        bootstrapAttemptRef.current = null;
        readyUserIdRef.current = null;
        summaryRef.current = null;
        portalNavigationRef.current = null;
        setSummary(null);
        setPortalNavigation(null);
        setError(nextError);
        setStatus("error");
        return { ok: false, error: nextError };
      }

      if (
        readyUserIdRef.current === userId &&
        (audience === "operator" ||
          (audience === "portal" && portalNavigationRef.current !== null) ||
          summaryRef.current)
      ) {
        setStatus("ready");
        return readyResult(audience === "operator" ? null : summaryRef.current);
      }

      if (
        bootstrapAttemptRef.current?.userId === userId &&
        bootstrapAttemptRef.current.audience === audience
      ) {
        return bootstrapAttemptRef.current.promise;
      }

      if (readyUserIdRef.current && readyUserIdRef.current !== userId) {
        clearEvidenceReviewWorklistSessionCache();
        summaryRef.current = null;
        portalNavigationRef.current = null;
        setSummary(null);
        setPortalNavigation(null);
        setError(null);
        readyUserIdRef.current = null;
      }

      if (audience === "operator") {
        const generation = bootstrapGenerationRef.current + 1;
        bootstrapGenerationRef.current = generation;
        bootstrapAttemptRef.current = null;
        readyUserIdRef.current = userId;
        summaryRef.current = null;
        setSummary(null);
        setStatus("ready");
        void resolveAuthorizedPortalAccessOnce({
          accessToken: nextSession.access_token,
          idempotencyKey: createIdempotencyKey(),
        }).then((result) => {
          if (
            bootstrapGenerationRef.current !== generation ||
            readyUserIdRef.current !== userId || !result.ok
          ) return;
          portalNavigationRef.current = result.navigation;
          setPortalNavigation(result.navigation);
        }).catch(() => undefined);
        return readyResult(null);
      }

      setStatus("bootstrapping");

      const idempotencyKey = createIdempotencyKey();
      const generation = bootstrapGenerationRef.current + 1;
      bootstrapGenerationRef.current = generation;
      if (audience === "portal") {
        const promise = resolveAuthorizedPortalAccessOnce({
          accessToken: nextSession.access_token,
          idempotencyKey,
        }).then((result): AuthActionResult => {
          if (bootstrapGenerationRef.current !== generation) {
            return result.ok ? readyResult(null) : result;
          }
          bootstrapAttemptRef.current = null;
          if (!result.ok) {
            setError(result.error);
            setStatus("error");
            return { ok: false, error: result.error };
          }

          readyUserIdRef.current = userId;
          summaryRef.current = null;
          portalNavigationRef.current = result.navigation;
          setSummary(null);
          setPortalNavigation(result.navigation);
          setError(null);
          setStatus("ready");
          return readyResult(null);
        });

        bootstrapAttemptRef.current = {
          audience,
          idempotencyKey,
          promise,
          userId,
        };
        return promise;
      }

      const promise = bootstrapAppCustomerAuth({
        accessToken: nextSession.access_token,
        idempotencyKey,
      }).then(async (result): Promise<AuthActionResult> => {
        if (bootstrapGenerationRef.current !== generation) {
          return result.ok ? readyResult(result.summary) : result;
        }
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
        void resolveAuthorizedPortalAccessOnce({
          accessToken: nextSession.access_token,
          idempotencyKey,
          loadCustomer: async () => result,
        }).then((portalResult) => {
          if (
            bootstrapGenerationRef.current !== generation ||
            readyUserIdRef.current !== userId || !portalResult.ok
          ) return;
          portalNavigationRef.current = portalResult.navigation;
          setPortalNavigation(portalResult.navigation);
        }).catch(() => undefined);
        return readyResult(result.summary);
      });

      bootstrapAttemptRef.current = {
        audience,
        idempotencyKey,
        promise,
        userId,
      };
      return promise;
    },
    [audience],
  );

  useEffect(() => {
    let active = true;

    const subscription = subscribeToAuthState((event, nextSession) => {
      if (!active) return;
      if (recoveryCallbackPresentRef.current && event !== "PASSWORD_RECOVERY") {
        return;
      }
      if (
        event === "PASSWORD_RECOVERY" && !recoveryCallbackPresentRef.current
      ) return;

      const disposition = resolveAuthEventDisposition(
        event,
        Boolean(nextSession),
        intent,
      );
      if (disposition === "password_recovery" && nextSession) {
        recoveryEventSeenRef.current = true;
        if (recoveryValidationStartedRef.current) return;
        recoveryValidationStartedRef.current = true;

        void getCurrentAuthSessionResult().then((result) => {
          if (!active) return;
          if (
            !result.ok ||
            !result.session ||
            result.session.user.id !== nextSession.user.id ||
            result.session.access_token !== nextSession.access_token
          ) {
            setRecoveryInvalid();
            void signOutLocalSupabaseSession().catch(() => undefined);
            return;
          }

          setRecoveryReady(result.session);
        }).catch(() => {
          if (!active) return;
          setRecoveryInvalid();
          void signOutLocalSupabaseSession().catch(() => undefined);
        });
        return;
      }
      if (disposition === "reject_password_recovery") {
        rejectedRecoveryRef.current = true;
        setRecoveryInvalid();
        void signOutLocalSupabaseSession().catch(() => undefined);
        return;
      }
      if (disposition === "signed_out") {
        setSignedOut();
        return;
      }
      if (disposition === "ignore") return;
      if (nextSession && readyUserIdRef.current === nextSession.user.id) {
        setSession(nextSession);
        return;
      }
      if (nextSession) void bootstrapSession(nextSession);
    });

    getCurrentAuthSessionResult().then((result) => {
      if (!active) return;

      if (intent === "password_recovery") {
        window.setTimeout(() => {
          if (!active || recoveryEventSeenRef.current) return;
          setRecoveryInvalid();
          void signOutLocalSupabaseSession().catch(() => undefined);
        }, 0);
        return;
      }

      if (!result.ok) {
        setSession(null);
        clearBoundState();
        setError(result.error);
        setStatus("error");
        return;
      }

      if (intent === "public_request") {
        setSignedOut();
        return;
      }
      if (recoveryCallbackPresentRef.current) {
        rejectedRecoveryRef.current = true;
        setRecoveryInvalid();
        void signOutLocalSupabaseSession().catch(() => undefined);
        return;
      }
      if (rejectedRecoveryRef.current) return;
      if (!result.session) {
        setSignedOut();
        return;
      }
      void bootstrapSession(result.session);
    }).catch(() => {
      if (!active) return;
      if (intent === "password_recovery") {
        setRecoveryInvalid();
        return;
      }
      setSession(null);
      clearBoundState();
      setError(safeAuthError("service_unavailable"));
      setStatus("error");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [
    bootstrapSession,
    clearBoundState,
    intent,
    setRecoveryInvalid,
    setRecoveryReady,
    setSignedOut,
  ]);

  const signUpWithPassword = useCallback<
    AuthContextValue["signUpWithPassword"]
  >(
    async (email, password) => {
      const result = await signUpWithSupabasePassword(email, password);
      if (!result.ok) return result;
      if (!result.session) {
        setStatus("signed_out");
        return { ok: true, status: "verification_required" };
      }
      return bootstrapSession(result.session);
    },
    [bootstrapSession],
  );

  const signInWithPassword = useCallback<
    AuthContextValue["signInWithPassword"]
  >(
    async (email, password) => {
      const result = await signInWithSupabasePassword(email, password);
      if (!result.ok) return result;
      return bootstrapSession(result.session);
    },
    [bootstrapSession],
  );

  const updateRecoveredPassword = useCallback<
    AuthContextValue["updateRecoveredPassword"]
  >(
    async (password) => {
      if (
        !recoveryReadyRef.current || status !== "recovery_ready" || !session
      ) {
        return { ok: false, error: safeAuthError("recovery_link_invalid") };
      }

      const result = await updateSupabaseRecoveryPassword(password);
      if (!result.ok) return result;

      const signedOut = await signOutLocalSupabaseSession().catch(() => false);
      recoveryReadyRef.current = false;
      clearAuthCallbackUrl();
      if (!signedOut) {
        setRecoveryInvalid();
        return { ok: false, error: safeAuthError("password_update_failed") };
      }

      setSignedOut();
      return { ok: true };
    },
    [session, setRecoveryInvalid, setSignedOut, status],
  );

  const retryBootstrap = useCallback<AuthContextValue["retryBootstrap"]>(
    async () => {
      if (intent === "password_recovery") {
        return { ok: false, error: safeAuthError("recovery_link_invalid") };
      }
      if (!session) {
        return { ok: false, error: safeAuthError("invalid_response") };
      }
      bootstrapAttemptRef.current = null;
      readyUserIdRef.current = null;
      summaryRef.current = null;
      portalNavigationRef.current = null;
      setSummary(null);
      setPortalNavigation(null);
      return bootstrapSession(session);
    },
    [bootstrapSession, intent, session],
  );

  const signOut = useCallback(async () => {
    const signedOut = await signOutWithSupabase();
    if (!signedOut) return false;
    setSignedOut();
    return true;
  }, [setSignedOut]);

  const value = useMemo<AuthContextValue>(() => ({
    audience,
    portalNavigation,
    error,
    retryBootstrap,
    session,
    signInWithPassword,
    signOut,
    signUpWithPassword,
    status,
    summary,
    updateRecoveredPassword,
  }), [
    audience,
    portalNavigation,
    error,
    retryBootstrap,
    session,
    signInWithPassword,
    signOut,
    signUpWithPassword,
    status,
    summary,
    updateRecoveredPassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
