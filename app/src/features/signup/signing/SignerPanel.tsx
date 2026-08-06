import type { SignerInput } from "./signatureMethod";
import { normalizeName } from "../signupFieldNormalizers";

type SignerPanelProps = {
  organizationName: string;
  value: SignerInput;
  onChange: (value: SignerInput) => void;
};

export function SignerPanel({
  onChange,
  organizationName,
  value,
}: SignerPanelProps) {
  const organization = value.accountType !== "particulier";
  return (
    <section className="signing-kiss-section" id="signup-signer">
      <h3>Ondertekening</h3>
      <div className="form-grid form-grid-two signing-document__signer-fields">
        <label className="field">
          <span>Volledige naam</span>
          <input
            autoComplete="name"
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
        </label>
        {organization
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
          {organization
            ? `Ik verklaar dat ik bevoegd ben om deze machtiging namens ${
              organizationName || "de organisatie"
            } te ondertekenen.`
            : "Ik verklaar dat ik de hierboven genoemde persoon ben en deze machtiging onderteken."}
        </span>
      </label>
    </section>
  );
}
