import type { Status } from "../App";

interface BalanceCardProps {
  balance: bigint | null;
  isBalanceEncrypted: boolean;
  balanceStatus: Status;
  onRefreshBalance: () => void;
}

export function BalanceCard({
  balance,
  isBalanceEncrypted,
  balanceStatus,
  onRefreshBalance,
}: BalanceCardProps) {
  return (
    <section className="card">
      <h2>Balance</h2>
      <p className="muted">
        Decryption requires a signature. Balance is shown in plaintext units.
      </p>
      <div className="status-grid">
        <div>
          <div className="status-row">
            <span>Encrypted balance</span>
            <button
              type="button"
              className={`ghost ${isBalanceEncrypted ? "ghost-warn" : ""}`}
              onClick={onRefreshBalance}
              disabled={balanceStatus === "loading"}
            >
              {balanceStatus === "loading"
                ? "Refreshing..."
                : isBalanceEncrypted
                ? "Decrypt"
                : "Refresh"}
            </button>
          </div>
          <strong className={isBalanceEncrypted ? "status-warn" : ""}>
            {isBalanceEncrypted ? "Encrypted" : balance?.toString() ?? "0"}
          </strong>
        </div>
      </div>
    </section>
  );
}
