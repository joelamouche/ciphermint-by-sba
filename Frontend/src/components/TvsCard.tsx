import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface TvsCardProps {
  totalValueShielded?: bigint;
  tvsStatus: Status | "pending" | "error" | "success" | "idle";
  onRefreshTvs: () => void;
}

export function TvsCard({
  totalValueShielded,
  tvsStatus,
  onRefreshTvs,
}: TvsCardProps) {
  const isLoading = tvsStatus === "pending";

  return (
    <section className="card">
      <div className="status-row">
        <h2>Total value shielded</h2>
        <button
          type="button"
          className="ghost"
          onClick={onRefreshTvs}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <p className="muted">
        Sum of all encrypted balances held by UBI members, expressed in SBA (8 decimals).
      </p>
      <p className="muted">
        <a
          href="https://www.binance.com/en/square/post/35913205283209"
          target="_blank"
          rel="noreferrer"
          className="brand-link"
        >
          Learn more about shielded value
        </a>
      </p>
      <strong>
        {typeof totalValueShielded === "bigint"
          ? `${formatTokenAmount(totalValueShielded)} SBA`
          : "Encrypted / unavailable"}
      </strong>
    </section>
  );
}

