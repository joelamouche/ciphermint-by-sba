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
  claimMonthlyConfirmationsRemaining?: number | null;
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
        <div style={{ marginTop: "1rem" }}>
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
            {isBalanceEncrypted
              ? "Encrypted"
              : `${formatTokenAmount(balance)} SBA`}
          </strong>
        </div>
        <div>
          <div className="status-row">
            <span>Claimable monthly income</span>
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
          <div className="status-row">
            <strong>
              {formatTokenAmount(hasIncome ? claimableIncome : 0n)}
            </strong>
            {hasIncome ? (
              <button
                type="button"
                className="ghost"
                onClick={onClaimIncome}
                disabled={
                  claimMonthlyStatus === "loading" ||
                  claimMonthlyStatus === "success"
                }
              >
                {claimMonthlyStatus === "loading"
                  ? "Claiming..."
                  : claimMonthlyStatus === "success"
                    ? "Claimed"
                    : claimMonthlyStatus === "error"
                      ? "Retry claim"
                      : "Claim income"}
              </button>
            ) : (
              <span className="muted">No income yet</span>
            )}
          </div>
          {claimMonthlyStatus === "confirming" &&
            claimMonthlyConfirmationsRemaining != null && (
              <p className="status-warn status-center">
                {claimMonthlyConfirmationsRemaining} block
                {claimMonthlyConfirmationsRemaining === 1 ? "" : "s"} confirmations remaining
              </p>
            )}
        </div>
      </div>
    </section>
  );
}
