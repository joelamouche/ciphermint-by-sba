import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultInfoCardProps {
  vaultStatus: Status;
  onRefreshVault: () => void;
  csbaBalance: bigint | null;
  sharePriceScaled?: bigint;
  monthlyRateBps?: bigint;
  blocksPerMonth?: bigint;
}

export function VaultInfoCard({
  vaultStatus,
  onRefreshVault,
  csbaBalance,
  sharePriceScaled,
  monthlyRateBps,
  blocksPerMonth,
}: VaultInfoCardProps) {
  const encryptedCsba = csbaBalance == null;

  return (
    <section className="card">
      <h2>Vault Overview</h2>
      <p className="muted">CSBA balance and vault pricing parameters.</p>
      <div className="status-row">
        <span>Refresh CSBA balance</span>
        <button
          type="button"
          className={`ghost ${vaultStatus === "loading" ? "ghost-warn" : ""}`}
          onClick={onRefreshVault}
          disabled={vaultStatus === "loading"}
        >
          {vaultStatus === "loading" ? "Refreshing..." : "Refresh"}
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
          <span>Share price scaled (1e8)</span>
          <strong>{sharePriceScaled != null ? sharePriceScaled.toString() : "-"}</strong>
        </div>
        <div>
          <span>Monthly rate</span>
          <strong>{monthlyRateBps != null ? `${monthlyRateBps.toString()} bps` : "-"}</strong>
        </div>
        <div>
          <span>Blocks per month</span>
          <strong>{blocksPerMonth != null ? blocksPerMonth.toString() : "-"}</strong>
        </div>
      </div>
    </section>
  );
}
