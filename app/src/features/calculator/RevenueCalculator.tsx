import { useMemo, useState } from "react";

type CalculationMode = "kilometers" | "kwh";

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const kwhFormatter = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 0,
});

function parsePositiveNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return 0;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return parsed;
}

export function RevenueCalculator() {
  const [mode, setMode] = useState<CalculationMode>("kilometers");
  const [yearlyKilometers, setYearlyKilometers] = useState("15000");
  const [consumptionPer100Km, setConsumptionPer100Km] = useState("18");
  const [yearlyKwh, setYearlyKwh] = useState("3500");
  const [valuePerKwh, setValuePerKwh] = useState("0,10");

  const result = useMemo(() => {
    const estimatedKwh =
      mode === "kilometers"
        ? (parsePositiveNumber(yearlyKilometers) * parsePositiveNumber(consumptionPer100Km)) / 100
        : parsePositiveNumber(yearlyKwh);
    const value = parsePositiveNumber(valuePerKwh);
    const gross = estimatedKwh * value;
    const fee = gross * 0.1;
    const net = gross - fee;

    return { estimatedKwh, gross, fee, net };
  }, [consumptionPer100Km, mode, valuePerKwh, yearlyKilometers, yearlyKwh]);

  return (
    <section className="section section-muted" id="opbrengst" aria-labelledby="calculator-title">
      <div className="container calculator-layout">
        <div>
          <p className="eyebrow">Opbrengst</p>
          <h2 id="calculator-title">Wat kan je laadpaal opleveren?</h2>
          <p className="section-copy">Kies kilometers of kWh en vul je aannames in.</p>
        </div>

        <div className="calculator-card">
          <div className="mode-tabs" aria-label="Berekeningswijze">
            <button
              aria-pressed={mode === "kilometers"}
              className={mode === "kilometers" ? "mode-tab mode-tab-active" : "mode-tab"}
              onClick={() => setMode("kilometers")}
              type="button"
            >
              Per jaarlijkse kilometers
            </button>
            <button
              aria-pressed={mode === "kwh"}
              className={mode === "kwh" ? "mode-tab mode-tab-active" : "mode-tab"}
              onClick={() => setMode("kwh")}
              type="button"
            >
              Per jaarlijkse kWh
            </button>
          </div>

          <div className={mode === "kilometers" ? "form-grid form-grid-three" : "form-grid"}>
            {mode === "kilometers" ? (
              <>
                <label className="field">
                  <span>Jaarlijkse kilometers</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => setYearlyKilometers(event.target.value)}
                    type="text"
                    value={yearlyKilometers}
                  />
                </label>

                <label className="field">
                  <span>Verbruik kWh / 100 km</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => setConsumptionPer100Km(event.target.value)}
                    type="text"
                    value={consumptionPer100Km}
                  />
                </label>
              </>
            ) : (
              <label className="field">
                <span>Jaarlijkse kWh</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setYearlyKwh(event.target.value)}
                  type="text"
                  value={yearlyKwh}
                />
              </label>
            )}

            <label className="field">
              <span>Waarde per kWh</span>
              <input
                inputMode="decimal"
                onChange={(event) => setValuePerKwh(event.target.value)}
                type="text"
                value={valuePerKwh}
              />
            </label>
          </div>

          <div className={mode === "kilometers" ? "result-grid" : "result-grid result-grid-three"} aria-live="polite">
            {mode === "kilometers" ? (
              <div className="result-item">
                <span>Geschatte kWh</span>
                <strong>{kwhFormatter.format(result.estimatedKwh)}</strong>
              </div>
            ) : null}
            <div className="result-item">
              <span>Bruto indicatie</span>
              <strong>{euroFormatter.format(result.gross)}</strong>
            </div>
            <div className="result-item">
              <span>ENVAL fee</span>
              <strong>{euroFormatter.format(result.fee)}</strong>
            </div>
            <div className="result-item result-item-strong">
              <span>Indicatie na fee</span>
              <strong>{euroFormatter.format(result.net)}</strong>
            </div>
          </div>

          <p className="fine-print">Indicatie. Geen garantie.</p>
        </div>
      </div>
    </section>
  );
}
