export type SignupIntakeSession = {
  intakeReference: string;
  managementCapability: string;
  accountType: string;
  email: string;
  expiresAt: string;
};

const STORAGE_KEY = "enval.signup.intake.v1";
const START_ATTEMPT_KEY = "enval.signup.intake-start-attempt.v1";

export type SignupIntakeStartAttempt = {
  accountType: string;
  email: string;
  idempotencyKey: string;
};

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch (_error) {
    return null;
  }
}

export function readSignupIntakeSession(): SignupIntakeSession | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as Partial<SignupIntakeSession> | null;
    if (!parsed || typeof parsed !== "object" ||
      typeof parsed.intakeReference !== "string" ||
      typeof parsed.managementCapability !== "string" ||
      typeof parsed.accountType !== "string" || typeof parsed.email !== "string" ||
      typeof parsed.expiresAt !== "string" || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as SignupIntakeSession;
  } catch (_error) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeSignupIntakeSession(value: SignupIntakeSession): void {
  sessionStorageOrNull()?.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearSignupIntakeSession(): void {
  const storage = sessionStorageOrNull();
  storage?.removeItem(STORAGE_KEY);
  storage?.removeItem(START_ATTEMPT_KEY);
}

export function readSignupIntakeStartAttempt(): SignupIntakeStartAttempt | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(START_ATTEMPT_KEY) || "null") as Partial<SignupIntakeStartAttempt> | null;
    return parsed && typeof parsed.accountType === "string" && typeof parsed.email === "string" &&
        typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey
      ? parsed as SignupIntakeStartAttempt
      : null;
  } catch (_error) {
    storage.removeItem(START_ATTEMPT_KEY);
    return null;
  }
}

export function writeSignupIntakeStartAttempt(value: SignupIntakeStartAttempt | null): void {
  const storage = sessionStorageOrNull();
  if (!storage) return;
  if (value) storage.setItem(START_ATTEMPT_KEY, JSON.stringify(value));
  else storage.removeItem(START_ATTEMPT_KEY);
}
