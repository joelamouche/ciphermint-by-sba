import type { Status } from "../App";
import type { PendingVaultRequest } from "../hooks/useVaultData";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultInfoCardProps {
  vaultStatus: Status;
  onRefreshVault: () => void;
  csbaBalance: bigint | null;
  pendingCsbaAmount: bigint | null;
  pendingSbaEstimate: bigint;
  pendingActive: boolean;
  pendingUnlockBlock: bigint;
  blocksUntilUnlock: bigint;
  currentBlock?: bigint;
  sharePriceScaled?: bigint;
  monthlyRateBps?: bigint;
  blocksPerMonth?: bigint;
  pendingRequests: PendingVaultRequest[];
  completeStatus: Status;
  onCompleteRequest: (requestIndex: number) => void;
  onCompleteMatured: () => void;
}

export function VaultInfoCard({
  vaultStatus,
  onRefreshVault,
  csbaBalance,
  pendingCsbaAmount,
  pendingSbaEstimate,
  pendingActive,
  pendingUnlockBlock,
  blocksUntilUnlock,
  currentBlock,
  sharePriceScaled,
  monthlyRateBps,
  blocksPerMonth,
  pendingRequests,
  completeStatus,
  onCompleteRequest,
  onCompleteMatured,
}: VaultInfoCardProps) {
  const encryptedCsba = csbaBalance == null;
  const encryptedPending = pendingCsbaAmount == null;

  return (
    <section className="card">
      <h2>Vault Position</h2>
      <p className="muted">
        Vault values are encrypted on-chain and shown after decryption signature.
      </p>
      <div className="status-row">
        <span>Refresh vault data</span>
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
          <span>Pending locked CSBA</span>
          <strong className={encryptedPending ? "status-warn" : ""}>
            {encryptedPending
              ? "Encrypted"
              : pendingActive
                ? `${formatTokenAmount(pendingCsbaAmount)} CSBA`
                : "None"}
          </strong>
        </div>
        <div>
          <span>Pending value in SBA (est.)</span>
          <strong>{pendingActive ? `${formatTokenAmount(pendingSbaEstimate)} SBA` : "0 SBA"}</strong>
        </div>
        <div>
          <span>Unlock status</span>
          <strong>
            {!pendingActive
              ? "No pending withdrawal"
              : blocksUntilUnlock > 0n
                ? `${blocksUntilUnlock.toString()} blocks remaining`
                : "Ready to complete"}
          </strong>
        </div>
        <div>
          <span>Pending requests</span>
          <strong>{pendingRequests.length}</strong>
        </div>
        <div>
          <span>Current block</span>
          <strong>{currentBlock != null ? currentBlock.toString() : "-"}</strong>
        </div>
        <div>
          <span>Unlock block</span>
          <strong>{pendingActive ? pendingUnlockBlock.toString() : "-"}</strong>
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
      {pendingRequests.length > 0 && (
        <div className="status-grid">
          <div className="status-row">
            <span>Matured requests</span>
            <button
              type="button"
              className="ghost"
              onClick={onCompleteMatured}
              disabled={
                completeStatus === "loading" ||
                completeStatus === "confirming" ||
                !pendingRequests.some((req) => req.ready)
              }
            >
              {completeStatus === "loading"
                ? "Submitting..."
                : completeStatus === "confirming"
                  ? "Waiting..."
                  : "Complete all matured"}
            </button>
          </div>
          {pendingRequests.map((request) => (
            <div key={request.index} className="status-row">
              <span>
                #{request.index} {formatTokenAmount(request.amountCsba)} CSBA (
                {request.ready
                  ? "ready"
                  : `${request.blocksUntilUnlock.toString()} blocks`}
                )
              </span>
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
                Complete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
