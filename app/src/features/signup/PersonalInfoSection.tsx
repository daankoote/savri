import { AddressFields } from "./AddressFields";
import {
  cleanKvkInput,
  getEmailValidationMessage,
  getKvkValidationMessage,
  getNameValidationMessage,
  getPhoneValidationMessage,
  normalizeEmail,
  normalizeKvkNumber,
  normalizeName,
  normalizePhone,
} from "./signupFieldNormalizers";
import type { AccountType, PersonalInfoDraft } from "./signupTypes";

type PersonalInfoSectionProps = {
  value: PersonalInfoDraft;
  onChange: (value: PersonalInfoDraft) => void;
};

const banners: Record<AccountType, string[]> = {
  particulier: ["Enkel de persoon die op de energiefactuur van de locatie staat kan zich registreren."],
  zakelijk: [
    "Enkel de bestuurder van de BV/Holding kan zich registreren.",
    "Er moet een KVK-uittreksel inclusief handtekening van de bestuurder worden toegevoegd.",
    "De energierekening dient op naam van de BV/Holding te staan.",
  ],
  vve: [
    "De VVE kan zich enkel aanmelden via de gegevens van de bestuurder.",
    "Er moet een KVK-uittreksel inclusief handtekening van de bestuurder worden toegevoegd.",
    "De energierekening dient op naam van de VVE te staan.",
  ],
};

export function PersonalInfoSection({ value, onChange }: PersonalInfoSectionProps) {
  const update = (field: keyof PersonalInfoDraft, nextValue: string | File | null) => {
    onChange({ ...value, [field]: nextValue });
  };

  const updateAccountType = (accountType: AccountType) => {
    onChange({ ...value, accountType });
  };

  const isBusiness = value.accountType !== "particulier";
  const firstNameLabel = isBusiness ? "Voornaam bestuurder" : "Voornaam";
  const lastNameLabel = isBusiness ? "Achternaam bestuurder" : "Achternaam";
  const organizationLabel = value.accountType === "vve" ? "VVE naam" : "Bedrijfsnaam";
  const addressTitle = value.accountType === "vve" ? "VVE gegevens" : "Bedrijfsgegevens";
  const uploadLabel = value.accountType === "vve" ? "KVK-uittreksel VVE" : "KVK-uittreksel";
  const uploadNote =
    value.accountType === "vve"
      ? "Upload het KVK-uittreksel van de VVE die eigenaar is van de laadpalen. Dit document moet zijn ondertekend door de tekenbevoegde zoals vermeld op het KVK-uittreksel."
      : "Upload het KVK-uittreksel van het bedrijf dat eigenaar is van de laadpalen. Dit document moet zijn ondertekend door de tekenbevoegde zoals vermeld op het KVK-uittreksel.";
  const firstNameMessage = getNameValidationMessage(value.firstName);
  const lastNameMessage = getNameValidationMessage(value.lastName);
  const organizationName = value.accountType === "vve" ? value.organizationName : value.companyName;
  const organizationMessage = isBusiness ? getNameValidationMessage(organizationName) : "";
  const kvkMessage = isBusiness ? getKvkValidationMessage(value.kvkNumber) : "";
  const emailMessage = getEmailValidationMessage(value.email);
  const phoneMessage = getPhoneValidationMessage(value.phone);

  return (
    <section className="signup-section" aria-label="Stap 1">
      <div className="signup-section-header signup-section-header-compact">
        <p className="eyebrow">Stap 1</p>
      </div>

      <div className="mode-tabs" aria-label="Type aanmelding">
        <button
          aria-pressed={value.accountType === "particulier"}
          className={value.accountType === "particulier" ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => updateAccountType("particulier")}
          type="button"
        >
          Particulier
        </button>
        <button
          aria-pressed={value.accountType === "zakelijk"}
          className={value.accountType === "zakelijk" ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => updateAccountType("zakelijk")}
          type="button"
        >
          Zakelijk
        </button>
        <button
          aria-pressed={value.accountType === "vve"}
          className={value.accountType === "vve" ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => updateAccountType("vve")}
          type="button"
        >
          VVE
        </button>
      </div>

      <div className="signup-banner">
        {banners[value.accountType].map((line, index) => (
          <p key={line}>{isBusiness ? `${index + 1}. ${line}` : line}</p>
        ))}
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{firstNameLabel}</span>
          <input
            autoComplete="given-name"
            onBlur={(event) => update("firstName", normalizeName(event.target.value))}
            onChange={(event) => update("firstName", event.target.value)}
            type="text"
            value={value.firstName}
          />
          {firstNameMessage ? <small className="field-message">{firstNameMessage}</small> : null}
        </label>

        <label className="field">
          <span>{lastNameLabel}</span>
          <input
            autoComplete="family-name"
            onBlur={(event) => update("lastName", normalizeName(event.target.value))}
            onChange={(event) => update("lastName", event.target.value)}
            type="text"
            value={value.lastName}
          />
          {lastNameMessage ? <small className="field-message">{lastNameMessage}</small> : null}
        </label>

        {isBusiness ? (
          <>
            <label className="field">
              <span>{organizationLabel}</span>
              <input
                autoComplete="organization"
                onBlur={(event) =>
                  update(value.accountType === "vve" ? "organizationName" : "companyName", normalizeName(event.target.value))
                }
                onChange={(event) =>
                  update(value.accountType === "vve" ? "organizationName" : "companyName", event.target.value)
                }
                type="text"
                value={value.accountType === "vve" ? value.organizationName : value.companyName}
              />
              {organizationMessage ? <small className="field-message">{organizationMessage}</small> : null}
            </label>

            <label className="field">
              <span>KVK nummer</span>
              <input
                inputMode="numeric"
                onBlur={(event) => update("kvkNumber", normalizeKvkNumber(event.target.value))}
                onChange={(event) => update("kvkNumber", cleanKvkInput(event.target.value))}
                type="text"
                value={value.kvkNumber}
              />
              {kvkMessage ? <small className="field-message">{kvkMessage}</small> : null}
            </label>
          </>
        ) : null}

        <label className="field">
          <span>E-mail</span>
          <input
            autoComplete="email"
            inputMode="email"
            onBlur={(event) => update("email", normalizeEmail(event.target.value))}
            onChange={(event) => update("email", event.target.value)}
            type="email"
            value={value.email}
          />
          {emailMessage ? <small className="field-message">{emailMessage}</small> : null}
        </label>

        <label className="field">
          <span>Telefoon (optioneel)</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            onBlur={(event) => update("phone", normalizePhone(event.target.value))}
            onChange={(event) => update("phone", event.target.value)}
            type="tel"
            value={value.phone}
          />
          {phoneMessage ? <small className="field-message">{phoneMessage}</small> : null}
        </label>
      </div>

      <div className="form-break" />

      {isBusiness ? <h3 className="signup-subheading">{addressTitle}</h3> : null}
      <div className="address-field-group">
        <AddressFields value={value.address} onChange={(address) => onChange({ ...value, address })} />
      </div>

      {isBusiness ? (
        <label className="document-slot document-slot-full">
          <span>{uploadLabel}</span>
          <input
            onChange={(event) => update("kvkDocument", event.target.files?.[0] || null)}
            type="file"
          />
          <small>{value.kvkDocument ? value.kvkDocument.name : uploadNote}</small>
        </label>
      ) : null}
    </section>
  );
}
