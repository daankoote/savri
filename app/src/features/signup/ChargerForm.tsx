import { backendSuppliers, chargerBrands, chargerModelsByBrand } from "./chargerCatalog";
import type { ChargerDraft, SolarPanelStatus } from "./signupTypes";

type ChargerFormProps = {
  charger: ChargerDraft;
  onChange: (charger: ChargerDraft) => void;
};

function installationYears() {
  const currentYear = Math.min(new Date().getFullYear(), 2050);
  return Array.from({ length: currentYear - 1999 }, (_, index) => String(currentYear - index));
}

export function ChargerForm({ charger, onChange }: ChargerFormProps) {
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
      manualBackendSupplier:
        backendSupplier === "Custom (nieuwe toevoegen)" ? charger.manualBackendSupplier : "",
    });
  };

  const modelOptions = chargerModelsByBrand[charger.brand] || [];
  const hasModelOptions = modelOptions.length > 0;

  return (
    <div className="form-grid form-grid-three">
      <label className="field">
        <span>Merk</span>
        <select onChange={(event) => updateBrand(event.target.value)} value={charger.brand}>
          <option value="">Kies merk</option>
          {chargerBrands.map((brand) => (
            <option key={brand.value} value={brand.value}>
              {brand.label}
            </option>
          ))}
        </select>
      </label>

      {charger.brand === "other" ? (
        <label className="field">
          <span>Merk namelijk</span>
          <input
            onChange={(event) => update("manualBrand", event.target.value)}
            type="text"
            value={charger.manualBrand}
          />
        </label>
      ) : null}

      {hasModelOptions ? (
        <label className="field">
          <span>Model</span>
          <select onChange={(event) => updateModel(event.target.value)} value={charger.model}>
            <option value="">Kies model</option>
            {modelOptions.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
            <option value="manual">Model handmatig invullen</option>
          </select>
        </label>
      ) : (
        <label className="field">
          <span>Model handmatig invullen</span>
          <input
            onChange={(event) => {
              onChange({ ...charger, model: "manual", manualModel: event.target.value });
            }}
            type="text"
            value={charger.manualModel}
          />
        </label>
      )}

      {charger.model === "manual" && hasModelOptions ? (
        <label className="field">
          <span>Model handmatig invullen</span>
          <input
            onChange={(event) => update("manualModel", event.target.value)}
            type="text"
            value={charger.manualModel}
          />
        </label>
      ) : null}

      <label className="field">
        <span>Jaar van installatie</span>
        <select
          onChange={(event) => update("installationYear", event.target.value)}
          value={charger.installationYear}
        >
          {installationYears().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>MID nummer</span>
        <input
          onChange={(event) => update("midNumber", event.target.value)}
          type="text"
          value={charger.midNumber}
        />
      </label>

      <label className="field">
        <span>Serienummer</span>
        <input
          onChange={(event) => update("serialNumber", event.target.value)}
          type="text"
          value={charger.serialNumber}
        />
      </label>

      <label className="field">
        <span>Back-end leverancier</span>
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

      {charger.backendSupplier === "Custom (nieuwe toevoegen)" ? (
        <label className="field">
          <span>Back-end leverancier namelijk</span>
          <input
            onChange={(event) => update("manualBackendSupplier", event.target.value)}
            type="text"
            value={charger.manualBackendSupplier}
          />
        </label>
      ) : null}

      <label className="field">
        <span>Zonnepanelen aanwezig?</span>
        <select
          onChange={(event) => update("solarPanelStatus", event.target.value as SolarPanelStatus)}
          value={charger.solarPanelStatus}
        >
          <option value="hourly_exportable">Ja, per uur uitleesbaar en te exporteren</option>
          <option value="not_hourly_exportable">Ja, niet per uur uitleesbaar en te exporteren</option>
          <option value="none">Nee</option>
        </select>
      </label>
    </div>
  );
}
