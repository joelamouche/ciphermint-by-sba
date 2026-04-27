import type { Status } from "../App";
import type { PendingVaultRequest } from "../hooks/useVaultData";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultWithdrawalsPanelProps {
  title: string;
  description: string;
  shareSymbol: string;
  baseSymbol: string;
  unlockUnitLabel: string;
  unlockUnitDays: number;
  vaultStatus: Status;
  onRefreshVault: () => void;
  pendingRequests: PendingVaultRequest[];
  blocksPerMonth?: bigint;
  completeStatus: Status;
  completePhase: "idle" | "encrypting" | "signing" | "confirming";
  completeConfirmationsRemaining: number | null;
  onCompleteRequest: (requestIndex: number) => void;
  onCompleteMatured: () => void;
}

export function VaultWithdrawalsPanel({
  title,
  description,
  shareSymbol,
  baseSymbol,
  unlockUnitLabel,
  unlockUnitDays,
  vaultStatus,
  onRefreshVault,
  pendingRequests,
  blocksPerMonth,
  completeStatus,
  completePhase,
  completeConfirmationsRemaining,
  onCompleteRequest,
  onCompleteMatured,
}: VaultWithdrawalsPanelProps) {
  const maturedCount = pendingRequests.filter((request) => request.ready).length;
  const getApproxUnlockTime = (blocksUntilUnlock: bigint) => {
    if (!blocksPerMonth || blocksPerMonth <= 0n) return null;
    const months = Number(blocksUntilUnlock) / Number(blocksPerMonth);
    if (!Number.isFinite(months)) return null;
    if (months >= 1) {
      const roundedMonths = Math.round(months * 10) / 10;
      return `${roundedMonths} month${roundedMonths === 1 ? "" : "s"}`;
    }
    const days = months * unlockUnitDays;
    if (days >= 1) {
      const roundedDays = Math.max(1, Math.round(days));
      return `${roundedDays} day${roundedDays === 1 ? "" : "s"}`;
    }
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  };

  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{description}</p>

      <div className="status-row">
        <span>Refresh withdrawal positions</span>
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
          <span>Pending positions</span>
          <strong>{pendingRequests.length}</strong>
        </div>
        <div>
          <span>Matured positions</span>
          <strong>{maturedCount}</strong>
        </div>
      </div>
      <div className="status-grid">
        <div>
          <span>Total pending unlock ({shareSymbol})</span>
          <strong>
            {formatTokenAmount(
              pendingRequests.reduce((acc, request) => acc + request.amountCsba, 0n),
            )}{" "}
            {shareSymbol}
          </strong>
        </div>
        <div>
          <span>Total pending value (est. {baseSymbol})</span>
          <strong>
            {formatTokenAmount(
              pendingRequests.reduce(
                (acc, request) => acc + request.amountSbaEstimate,
                0n,
              ),
            )}{" "}
            {baseSymbol}
          </strong>
        </div>
      </div>

      {pendingRequests.length > 0 ? (
        <div className="status-grid">
          <div className="status-row">
            <span>Matured positions</span>
            <button
              type="button"
              className="ghost"
              onClick={onCompleteMatured}
              disabled={
                completeStatus === "loading" ||
                completeStatus === "confirming" ||
                maturedCount === 0
              }
            >
              {completeStatus === "loading"
                ? "Waiting for signature..."
                : completeStatus === "confirming"
                  ? "Waiting for confirmations..."
                  : "Complete all matured"}
            </button>
          </div>
          {completeStatus === "loading" && completePhase === "signing" && (
            <p className="muted status-center">Confirm transaction in your wallet.</p>
          )}
          {completeStatus === "confirming" &&
            completeConfirmationsRemaining != null && (
              <p className="status-warn status-center">
                {completeConfirmationsRemaining} block
                {completeConfirmationsRemaining === 1 ? "" : "s"} confirmations
                remaining
              </p>
            )}

          {pendingRequests.map((request) => (
            <div key={request.index} className="vault-position-item">
              <div className="vault-position-title-row">
                <strong>Position #{request.index}</strong>
                <span className={request.ready ? "status-good" : "status-warn"}>
                  {request.ready
                    ? "Ready to complete"
                    : (() => {
                        const approxUnlock = getApproxUnlockTime(
                          request.blocksUntilUnlock
                        );
                        const blocksLabel = `${request.blocksUntilUnlock.toLocaleString()} blocks`;
                        return approxUnlock
                          ? `${blocksLabel} (~${approxUnlock} ${unlockUnitLabel} window) to unlock`
                          : `${blocksLabel} to unlock`;
                      })()}
                </span>
              </div>
              <div className="vault-position-metrics">
                <div>
                  <span>Locked {shareSymbol}</span>
                  <strong>{formatTokenAmount(request.amountCsba)} {shareSymbol}</strong>
                </div>
                <div>
                  <span>{baseSymbol} value (est.)</span>
                  <strong>{formatTokenAmount(request.amountSbaEstimate)} {baseSymbol}</strong>
                </div>
                <div>
                  <span>Unlock block</span>
                  <strong>{request.unlockBlock.toString()}</strong>
                </div>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => onCompleteRequest(request.index)}
                disabled={
                  !request.ready ||
                  completeStatus === "loading" ||
                  completeStatus === "confirming"
                }
              >
                {completeStatus === "loading"
                  ? "Waiting for signature..."
                  : completeStatus === "confirming"
                    ? "Waiting for confirmations..."
                    : "Complete position"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No pending withdrawal positions.</p>
      )}
    </section>
  );
}
