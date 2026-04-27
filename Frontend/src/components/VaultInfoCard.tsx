import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultInfoCardProps {
  vaultStatus: Status;
  onRefreshVault: () => void;
  csbaBalance: bigint | null;
  sharePriceScaled?: bigint;
  monthlyRateBps?: bigint;
}

export function VaultInfoCard({
  vaultStatus,
  onRefreshVault,
  csbaBalance,
  sharePriceScaled,
  monthlyRateBps,
}: VaultInfoCardProps) {
  const encryptedCsba = csbaBalance == null;
  const currentSbaValue =
    csbaBalance != null && sharePriceScaled != null
      ? (csbaBalance * sharePriceScaled) / 10n ** 8n
      : null;
  const monthlyRoiPercent =
    monthlyRateBps != null ? (Number(monthlyRateBps) / 100).toFixed(2) : null;

  return (
    <section className="card">
      <h2>Vault Overview</h2>
      <p className="muted">Your CSBA position and expected monthly return.</p>
      <div className="status-row vault-info-actions">
        <button
          type="button"
          className={`ghost ${vaultStatus === "loading" ? "ghost-warn" : ""}`}
          onClick={onRefreshVault}
          disabled={vaultStatus === "loading"}
        >
          {vaultStatus === "loading" ? "Refreshing..." : "Refresh vault data"}
        </button>
      </div>

      <div className="status-grid">
        <div>
          <span>CSBA balance</span>
          <strong className={encryptedCsba ? "status-warn" : ""}>
            {encryptedCsba ? "Encrypted" : `${formatTokenAmount(csbaBalance)} CSBA`}
          </strong>
        </div>
        <div>
          <span>Current SBA value</span>
          <strong className={currentSbaValue == null ? "status-warn" : ""}>
            {currentSbaValue == null ? "Encrypted" : `${formatTokenAmount(currentSbaValue)} SBA`}
          </strong>
        </div>
        <div>
          <span>Monthly ROI</span>
          <strong>{monthlyRoiPercent != null ? `${monthlyRoiPercent}%` : "-"}</strong>
        </div>
      </div>
    </section>
  );
}
