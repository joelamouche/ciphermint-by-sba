import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface BalanceCardProps {
  balance: bigint | null;
  isBalanceEncrypted: boolean;
  balanceStatus: Status;
  onRefreshBalance: () => void;
  claimableIncome?: bigint;
  claimableIncomeStatus: Status;
  claimMonthlyStatus: Status;
  claimMonthlyConfirmationsRemaining: number | null;
  onRefreshIncome: () => void;
  onClaimIncome: () => void;
}

export function BalanceCard({
  balance,
  isBalanceEncrypted,
  balanceStatus,
  onRefreshBalance,
  claimableIncome,
  claimableIncomeStatus,
  claimMonthlyStatus,
  claimMonthlyConfirmationsRemaining,
  onRefreshIncome,
  onClaimIncome,
}: BalanceCardProps) {
  const hasIncome = Boolean(claimableIncome && claimableIncome > 0n);

  return (
    <section className="card">
      <h2>Balance</h2>
      <p className="muted">
        Decryption requires a signature. Values are shown in SBA (8 decimals).
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
            {isBalanceEncrypted ? "Encrypted" : formatTokenAmount(balance)}
          </strong>
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <div className="status-row">
            <span>Accrued income</span>
            <button
              type="button"
              className="ghost"
              onClick={onRefreshIncome}
              disabled={claimableIncomeStatus === "loading"}
            >
              {claimableIncomeStatus === "loading"
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
          <div className="status-row" style={{ marginTop: "0.75rem" }}>
            <div>
              <strong>
                {formatTokenAmount(hasIncome ? claimableIncome : 0n)}
              </strong>
              {claimMonthlyStatus === "success" && (
                <div className="status-good">Claimed</div>
              )}
              {!hasIncome && claimMonthlyStatus !== "success" && (
                <div className="muted">No income yet</div>
              )}
              {claimMonthlyStatus === "confirming" &&
                claimMonthlyConfirmationsRemaining != null && (
                  <div className="status-warn">
                    {claimMonthlyConfirmationsRemaining} block
                    {claimMonthlyConfirmationsRemaining === 1 ? "" : "s"}{" "}
                    confirmations remaining
                  </div>
                )}
            </div>
            <button
              type="button"
              className={`ghost ${
                claimMonthlyStatus === "confirming" ? "ghost-warn" : ""
              }`}
              onClick={onClaimIncome}
              disabled={
                !hasIncome ||
                claimMonthlyStatus === "loading" ||
                claimMonthlyStatus === "confirming"
              }
            >
              {claimMonthlyStatus === "loading"
                ? "Submitting claim..."
                : claimMonthlyStatus === "confirming"
                  ? "Waiting..."
                  : claimMonthlyStatus === "error"
                    ? "Retry claim"
                    : "Claim income"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
