import type { DashboardAsset, DashboardRequest } from "./dashboardTypes";

type DashboardOverviewProps = {
  assets: DashboardAsset[];
  requests: DashboardRequest[];
};

export function DashboardOverview({ assets, requests }: DashboardOverviewProps) {
  const underReview = assets.filter((asset) => asset.status === "under_review").length;
  const expectedValue = "Indicatief";

  const cards = [
    { label: "Open acties", value: String(requests.length), note: "Nog door klant te doen" },
    { label: "Actieve assets", value: String(assets.length), note: "Woningen, bedrijf en VVE" },
    { label: "In beoordeling", value: String(underReview), note: "ENVAL is bezig" },
    { label: "Verwachte waarde", value: expectedValue, note: "Geen garantie" },
  ];

  return (
    <section className="dashboard-summary-grid" aria-label="Dashboard samenvatting">
      {cards.map((card) => (
        <article className="dashboard-card dashboard-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <p>{card.note}</p>
        </article>
      ))}
    </section>
  );
}
