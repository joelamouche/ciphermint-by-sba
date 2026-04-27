import type { Status } from "../App";
import type { PendingVaultRequest } from "../hooks/useVaultData";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultWithdrawalsPanelProps {
  vaultStatus: Status;
  onRefreshVault: () => void;
  pendingRequests: PendingVaultRequest[];
  completeStatus: Status;
  completePhase: "idle" | "encrypting" | "signing" | "confirming";
  completeConfirmationsRemaining: number | null;
  onCompleteRequest: (requestIndex: number) => void;
  onCompleteMatured: () => void;
}

export function VaultWithdrawalsPanel({
  vaultStatus,
  onRefreshVault,
  pendingRequests,
  completeStatus,
  completePhase,
  completeConfirmationsRemaining,
  onCompleteRequest,
  onCompleteMatured,
}: VaultWithdrawalsPanelProps) {
  const maturedCount = pendingRequests.filter((request) => request.ready).length;

  return (
    <section className="card">
      <h2>Vault Withdrawals</h2>
      <p className="muted">
        Each withdrawal request creates one position. Positions unlock independently
        after the lock period and can be completed one-by-one or in batch.
      </p>

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
                    : `${request.blocksUntilUnlock.toString()} blocks to unlock`}
                </span>
              </div>
              <div className="vault-position-metrics">
                <div>
                  <span>Locked CSBA</span>
                  <strong>{formatTokenAmount(request.amountCsba)} CSBA</strong>
                </div>
                <div>
                  <span>SBA value (est.)</span>
                  <strong>{formatTokenAmount(request.amountSbaEstimate)} SBA</strong>
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
