import type { Status } from "../App";

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
        Aggregate plaintext supply across all encrypted balances (UBI + income).
      </p>
      <strong>
        {typeof totalValueShielded === "bigint"
          ? `${totalValueShielded.toString()} SBA`
          : "Encrypted / unavailable"}
      </strong>
    </section>
  );
}

