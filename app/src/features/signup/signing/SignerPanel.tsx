import type { SignerInput } from "./signatureMethod";
import { normalizeName } from "../signupFieldNormalizers";

type SignerPanelProps = {
  organizationName: string;
  value: SignerInput;
  onChange: (value: SignerInput) => void;
  intentStatement?: string;
  sectionId?: string;
  showRole?: boolean;
  fullNameAutoComplete?: string;
  expectedSignerDisplayName?: string;
  fullNameInvalid?: boolean;
};

export function SignerPanel({
  onChange,
  organizationName,
  value,
  intentStatement,
  sectionId = "signup-signer",
  showRole,
  fullNameAutoComplete = "name",
  expectedSignerDisplayName,
  fullNameInvalid = false,
}: SignerPanelProps) {
  const organization = value.accountType !== "particulier";
  const roleVisible = showRole ?? organization;
  const fullNameErrorId = `${sectionId}-full-name-error`;
  return (
    <section className="signing-kiss-section" id={sectionId}>
      <h3>Ondertekening</h3>
      {expectedSignerDisplayName
        ? (
          <dl className="signing-document__facts">
            <div>
              <dt>Dit moet worden ondertekend door</dt>
              <dd>{expectedSignerDisplayName}</dd>
            </div>
          </dl>
        )
        : null}
      <div className="form-grid form-grid-two signing-document__signer-fields">
        <label className="field">
          <span>Volledige naam</span>
          <input
            aria-describedby={fullNameInvalid ? fullNameErrorId : undefined}
            aria-invalid={fullNameInvalid ? true : undefined}
            autoComplete={fullNameAutoComplete}
            className={fullNameInvalid ? "input-error" : undefined}
            onBlur={(event) =>
              onChange({
                ...value,
                fullName: normalizeName(event.target.value),
              })}
            onChange={(event) =>
              onChange({ ...value, fullName: event.target.value })}
            type="text"
            value={value.fullName}
          />
          {fullNameInvalid
            ? (
              <span className="sr-only" id={fullNameErrorId}>
                De ingevoerde naam is niet de verwachte ondertekenaar.
              </span>
            )
            : null}
        </label>
        {roleVisible
          ? (
            <label className="field">
              <span>Functie/rol</span>
              <input
                onChange={(event) =>
                  onChange({ ...value, role: event.target.value })}
                type="text"
                value={value.role}
              />
            </label>
          )
          : null}
      </div>
      <label className="consent-check-item">
        <input
          checked={value.intentAccepted}
          onChange={(event) =>
            onChange({ ...value, intentAccepted: event.currentTarget.checked })}
          type="checkbox"
        />
        <span>
          {intentStatement ?? (organization
            ? `Ik verklaar dat ik bevoegd ben om deze machtiging namens ${
              organizationName || "de organisatie"
            } te ondertekenen.`
            : "Ik verklaar dat ik de hierboven genoemde persoon ben en deze machtiging onderteken.")}
        </span>
      </label>
    </section>
  );
}
