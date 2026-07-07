import type { DashboardAsset } from "./dashboardTypes";

type AssetListProps = {
  assets: DashboardAsset[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
};

export function AssetList({ assets, selectedAssetId, onSelectAsset }: AssetListProps) {
  return (
    <section className="dashboard-card dashboard-panel" aria-labelledby="assets-title">
      <div className="dashboard-panel-header">
        <div>
          <p className="eyebrow">Assets</p>
          <h2 id="assets-title">Uw dossiers</h2>
        </div>
      </div>

      <div className="asset-list">
        {assets.map((asset) => (
          <article
            className={asset.id === selectedAssetId ? "asset-card asset-card-active" : "asset-card"}
            key={asset.id}
          >
            <button
              className="asset-card-main"
              onClick={() => onSelectAsset(asset.id)}
              type="button"
            >
              <span className="asset-type">{asset.typeLabel}</span>
              <strong>{asset.name}</strong>
              <span>{asset.identity}</span>
            </button>

            <div className="asset-meta-grid">
              <span>Status: {asset.statusLabel}</span>
              <span>{asset.locationsCount} locatie(s)</span>
              <span>{asset.chargersCount} laadpaal/laadpalen</span>
              <span>{asset.openActions} open actie(s)</span>
            </div>

            <p className="asset-next-action">{asset.nextAction}</p>

            {asset.openActions > 0 ? (
              <div className="asset-actions">
                <button className="button button-secondary" onClick={() => onSelectAsset(asset.id)} type="button">
                  Bekijk dossier
                </button>
                <button className="button button-ghost" type="button">
                  Aanvullen
                </button>
              </div>
            ) : (
              <div className="asset-actions">
                <button className="button button-secondary" onClick={() => onSelectAsset(asset.id)} type="button">
                  Bekijk dossier
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
