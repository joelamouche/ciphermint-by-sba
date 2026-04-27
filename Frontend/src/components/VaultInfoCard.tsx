import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultInfoCardProps {
  title: string;
  description: string;
  shareSymbol: string;
  baseSymbol: string;
  roiLabel: string;
  vaultStatus: Status;
  onRefreshVault: () => void;
  csbaBalance: bigint | null;
  sharePriceScaled?: bigint;
  monthlyRateBps?: bigint;
}

export function VaultInfoCard({
  title,
  description,
  shareSymbol,
  baseSymbol,
  roiLabel,
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
      <h2>{title}</h2>
      <p className="muted">{description}</p>
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
            {encryptedCsba ? "Encrypted" : `${formatTokenAmount(csbaBalance)} ${shareSymbol}`}
          </strong>
        </div>
        <div>
          <span>Current {baseSymbol} value</span>
          <strong className={currentSbaValue == null ? "status-warn" : ""}>
            {currentSbaValue == null ? "Encrypted" : `${formatTokenAmount(currentSbaValue)} ${baseSymbol}`}
          </strong>
        </div>
        <div>
          <span>{roiLabel}</span>
          <strong>{monthlyRoiPercent != null ? `${monthlyRoiPercent}%` : "-"}</strong>
        </div>
      </div>
    </section>
  );
}
