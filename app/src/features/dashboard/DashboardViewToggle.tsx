import type { DashboardView } from "./dashboardTypes";

type DashboardViewToggleProps = {
  value: DashboardView;
  onChange: (view: DashboardView) => void;
};

export function DashboardViewToggle({ value, onChange }: DashboardViewToggleProps) {
  return (
    <div className="mode-tabs dashboard-view-toggle" aria-label="Weergave">
      <button
        aria-pressed={value === "customer"}
        className={value === "customer" ? "mode-tab mode-tab-active" : "mode-tab"}
        onClick={() => onChange("customer")}
        type="button"
      >
        Klantweergave
      </button>
      <button
        aria-pressed={value === "enval"}
        className={value === "enval" ? "mode-tab mode-tab-active" : "mode-tab"}
        onClick={() => onChange("enval")}
        type="button"
      >
        ENVAL view
      </button>
    </div>
  );
}
