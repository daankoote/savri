import { normalizeEmail } from "./signupFieldNormalizers";
import type {
  AccountType,
  PersonalInfoDraft,
  SignupFieldErrors,
} from "./signupTypes";
import { firstSignupFieldError, signupFieldErrorId } from "./signupValidation";

type PersonalInfoSectionProps = {
  authoritativeEmail?: string | null;
  fieldErrors: SignupFieldErrors;
  value: PersonalInfoDraft;
  onChange: (value: PersonalInfoDraft) => void;
};

export function PersonalInfoSection({
  authoritativeEmail = null,
  fieldErrors,
  onChange,
  value,
}: PersonalInfoSectionProps) {
  const update = (field: keyof PersonalInfoDraft, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };
  const updateAccountType = (accountType: AccountType) => {
    onChange({ ...value, accountType });
  };
  const errorFor = (fieldPath: string) =>
    firstSignupFieldError(fieldErrors, fieldPath);
  const emailError = errorFor("applicant.email");

  return (
    <section
      aria-labelledby="document-first-account-title"
      className="signup-section"
      id="signup-account"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 1</p>
        <h2 id="document-first-account-title">Account</h2>
      </div>

      <div className="mode-tabs" aria-label="Type aanmelding">
        <button
          aria-pressed={value.accountType === "particulier"}
          className={value.accountType === "particulier"
            ? "mode-tab mode-tab-active"
            : "mode-tab"}
          onClick={() => updateAccountType("particulier")}
          type="button"
        >
          Particulier
        </button>
        <button
          aria-pressed={value.accountType === "zakelijk"}
          className={value.accountType === "zakelijk"
            ? "mode-tab mode-tab-active"
            : "mode-tab"}
          onClick={() => updateAccountType("zakelijk")}
          type="button"
        >
          Zakelijk
        </button>
        <button
          aria-pressed={value.accountType === "vve"}
          className={value.accountType === "vve"
            ? "mode-tab mode-tab-active"
            : "mode-tab"}
          onClick={() => updateAccountType("vve")}
          type="button"
        >
          VVE
        </button>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>E-mail</span>
          <input
            aria-describedby={emailError
              ? signupFieldErrorId(emailError.fieldPath)
              : undefined}
            aria-invalid={emailError ? true : undefined}
            autoComplete="email"
            inputMode="email"
            readOnly={Boolean(authoritativeEmail)}
            onBlur={(event) =>
              update("email", normalizeEmail(event.target.value))}
            onChange={(event) => update("email", event.target.value)}
            type="email"
            value={value.email}
          />
          {authoritativeEmail
            ? (
              <small className="field-message">
                Dit e-mailadres komt uit je geverifieerde account. Wijzigen
                doe je via je accountinstellingen.
              </small>
            )
            : null}
          {emailError
            ? (
              <small
                className="field-message"
                id={signupFieldErrorId(emailError.fieldPath)}
                role="alert"
              >
                {emailError.message}
              </small>
            )
            : null}
        </label>
      </div>
    </section>
  );
}
