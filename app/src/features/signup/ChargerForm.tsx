import {
  backendSuppliers,
  chargerBrands,
  chargerModelsByBrand,
} from "./chargerCatalog";
import type {
  ChargerDraft,
  SignupFieldErrors,
  SolarPanelStatus,
  ValidationIssue,
} from "./signupTypes";
import { firstSignupFieldError, signupFieldErrorId } from "./signupValidation";

type ChargerFormProps = {
  charger: ChargerDraft;
  fieldErrors: SignupFieldErrors;
  onChange: (charger: ChargerDraft) => void;
};

export function chargerFieldControlId(chargerId: string, field: string) {
  return `charger-${chargerId}-${field}`;
}

function installationYears() {
  const currentYear = Math.min(new Date().getFullYear(), 2050);
  return Array.from(
    { length: currentYear - 1999 },
    (_, index) => String(currentYear - index),
  );
}

function FieldError({ error }: { error: ValidationIssue | null }) {
  if (!error) return null;
  return (
    <small
      className="field-message"
      id={signupFieldErrorId(error.fieldPath)}
      role="alert"
    >
      {error.message}
    </small>
  );
}

function errorAria(error: ValidationIssue | null) {
  return {
    "aria-describedby": error ? signupFieldErrorId(error.fieldPath) : undefined,
    "aria-invalid": error ? true as const : undefined,
  };
}

export function ChargerForm({
  charger,
  fieldErrors,
  onChange,
}: ChargerFormProps) {
  const update = (field: keyof ChargerDraft, value: string) => {
    onChange({ ...charger, [field]: value });
  };

  const updateBrand = (brand: string) => {
    onChange({
      ...charger,
      brand,
      manualBrand: brand === "other" ? charger.manualBrand : "",
      model: "",
      manualModel: "",
    });
  };

  const updateModel = (model: string) => {
    onChange({
      ...charger,
      model,
      manualModel: model === "manual" ? charger.manualModel : "",
    });
  };

  const updateBackendSupplier = (backendSupplier: string) => {
    onChange({
      ...charger,
      backendSupplier,
      manualBackendSupplier: backendSupplier === "Custom (nieuwe toevoegen)"
        ? charger.manualBackendSupplier
        : "",
    });
  };

  const errorFor = (field: string) =>
    firstSignupFieldError(
      fieldErrors,
      `chargers.${charger.clientId}.${field}`,
    );
  const brandError = errorFor("brand");
  const manualBrandError = errorFor("manualBrand");
  const modelError = errorFor("model");
  const installationYearError = errorFor("installationYear");
  const midError = errorFor("midNumber");
  const serialError = errorFor("serialNumber");
  const manualSupplierError = errorFor("manualBackendSupplier");
  const solarError = errorFor("solarPanelStatus");
  const modelOptions = chargerModelsByBrand[charger.brand] || [];
  const hasModelOptions = modelOptions.length > 0;

  return (
    <div className="form-grid form-grid-three">
      <label className="field">
        <span>Merk</span>
        <select
          {...errorAria(brandError)}
          id={charger.brand === "other"
            ? undefined
            : chargerFieldControlId(charger.clientId, "brand")}
          onChange={(event) => updateBrand(event.target.value)}
          value={charger.brand}
        >
          <option value="">Kies merk</option>
          {chargerBrands.map((brand) => (
            <option key={brand.value} value={brand.value}>
              {brand.label}
            </option>
          ))}
        </select>
        <FieldError error={brandError} />
      </label>

      {charger.brand === "other"
        ? (
          <label className="field">
            <span>Merk namelijk</span>
            <input
              {...errorAria(manualBrandError)}
              id={chargerFieldControlId(charger.clientId, "brand")}
              onChange={(event) => update("manualBrand", event.target.value)}
              type="text"
              value={charger.manualBrand}
            />
            <FieldError error={manualBrandError} />
          </label>
        )
        : null}

      {hasModelOptions
        ? (
          <label className="field">
            <span>Model</span>
            <select
              {...errorAria(modelError)}
              id={charger.model === "manual"
                ? undefined
                : chargerFieldControlId(charger.clientId, "model")}
              onChange={(event) => updateModel(event.target.value)}
              value={charger.model}
            >
              <option value="">Kies model</option>
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
              <option value="manual">Model handmatig invullen</option>
            </select>
            <FieldError error={modelError} />
          </label>
        )
        : (
          <label className="field">
            <span>Model handmatig invullen</span>
            <input
              {...errorAria(modelError)}
              id={chargerFieldControlId(charger.clientId, "model")}
              onChange={(event) => {
                onChange({
                  ...charger,
                  model: "manual",
                  manualModel: event.target.value,
                });
              }}
              type="text"
              value={charger.manualModel}
            />
            <FieldError error={modelError} />
          </label>
        )}

      {charger.model === "manual" && hasModelOptions
        ? (
          <label className="field">
            <span>Model handmatig invullen</span>
            <input
              {...errorAria(modelError)}
              id={chargerFieldControlId(charger.clientId, "model")}
              onChange={(event) => update("manualModel", event.target.value)}
              type="text"
              value={charger.manualModel}
            />
            <FieldError error={modelError} />
          </label>
        )
        : null}

      <label className="field">
        <span>Jaar van installatie</span>
        <select
          {...errorAria(installationYearError)}
          id={chargerFieldControlId(charger.clientId, "installationYear")}
          onChange={(event) => update("installationYear", event.target.value)}
          value={charger.installationYear}
        >
          {installationYears().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <FieldError error={installationYearError} />
      </label>

      <label className="field">
        <span>MID nummer</span>
        <input
          {...errorAria(midError)}
          id={chargerFieldControlId(charger.clientId, "midNumber")}
          onChange={(event) => update("midNumber", event.target.value)}
          type="text"
          value={charger.midNumber}
        />
        <FieldError error={midError} />
      </label>

      <label className="field">
        <span>Serienummer</span>
        <input
          {...errorAria(serialError)}
          id={chargerFieldControlId(charger.clientId, "serialNumber")}
          onChange={(event) => update("serialNumber", event.target.value)}
          type="text"
          value={charger.serialNumber}
        />
        <FieldError error={serialError} />
      </label>

      <label className="field">
        <span>Back-end leverancier (optioneel)</span>
        <select
          onChange={(event) => updateBackendSupplier(event.target.value)}
          value={charger.backendSupplier}
        >
          <option value="">Kies leverancier</option>
          {backendSuppliers.map((supplier) => (
            <option key={supplier.value} value={supplier.value}>
              {supplier.label}
            </option>
          ))}
        </select>
      </label>

      {charger.backendSupplier === "Custom (nieuwe toevoegen)"
        ? (
          <label className="field">
            <span>Back-end leverancier namelijk</span>
            <input
              {...errorAria(manualSupplierError)}
              onChange={(event) =>
                update("manualBackendSupplier", event.target.value)}
              type="text"
              value={charger.manualBackendSupplier}
            />
            <FieldError error={manualSupplierError} />
          </label>
        )
        : null}

      <label className="field">
        <span>Zonnepanelen aanwezig?</span>
        <select
          {...errorAria(solarError)}
          onChange={(event) =>
            update(
              "solarPanelStatus",
              event.target.value as SolarPanelStatus,
            )}
          value={charger.solarPanelStatus}
        >
          <option value="hourly_exportable">
            Ja, per uur uitleesbaar en te exporteren
          </option>
          <option value="not_hourly_exportable">
            Ja, niet per uur uitleesbaar en te exporteren
          </option>
          <option value="none">Nee</option>
        </select>
        <FieldError error={solarError} />
      </label>
    </div>
  );
}
