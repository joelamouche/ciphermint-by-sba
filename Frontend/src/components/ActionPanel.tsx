import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Status } from "../App";

type ActionStep = "connect" | "verify" | "claim" | "transfer";

interface ActionPanelProps {
  activeStepId: ActionStep;
  isConnected: boolean;
  userAddress?: string;
  sessionUrl: string | null;
  kycSessionStatus: "created" | "in_progress" | "done" | null;
  kycStatus: Status;
  canClaim: boolean;
  claimStatus: Status;
  transferTo: string;
  transferAmount: string;
  transferStatus: Status;
  claimConfirmationsRemaining: number | null;
  transferConfirmationsRemaining: number | null;
  onStartKyc: () => void;
  onOpenKyc: () => void;
  onClaim: () => void;
  onTransferToChange: (value: string) => void;
  onTransferAmountChange: (value: string) => void;
  onTransfer: () => void;
}

export function ActionPanel({
  activeStepId,
  isConnected,
  userAddress,
  sessionUrl,
  kycSessionStatus,
  kycStatus,
  canClaim,
  claimStatus,
  transferTo,
  transferAmount,
  transferStatus,
  claimConfirmationsRemaining,
  transferConfirmationsRemaining,
  onStartKyc,
  onOpenKyc,
  onClaim,
  onTransferToChange,
  onTransferAmountChange,
  onTransfer,
}: ActionPanelProps) {
  const normalizedUserAddress = userAddress?.toLowerCase();
  const normalizedTransferTo = transferTo.trim().toLowerCase();
  const isSelfTransfer =
    Boolean(normalizedUserAddress) &&
    Boolean(normalizedTransferTo) &&
    normalizedUserAddress === normalizedTransferTo;

  return (
    <section className="card panel">
      {activeStepId === "connect" && (
        <>
          <h2>Connect your wallet</h2>
          <p className="muted">
            Connect a wallet to begin the verification and mint flow.
          </p>
          <ConnectButton />
        </>
      )}

      {activeStepId === "verify" && (
        <>
          <h2>Verify identity</h2>
          <p>
            Start the Didit flow in another tab. Once completed, the backend
            writes your identity on-chain.
          </p>
          {sessionUrl ? (
            <button
              type="button"
              onClick={onOpenKyc}
              disabled={
                kycSessionStatus === "in_progress" ||
                kycSessionStatus === "done"
              }
            >
              {kycSessionStatus === "in_progress"
                ? "Verification in progress"
                : kycSessionStatus === "done"
                  ? "Verification complete"
                  : "Open Didit verification"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartKyc}
              disabled={!isConnected || kycStatus === "loading"}
            >
              {kycStatus === "loading" ? "Creating session..." : "Start KYC"}
            </button>
          )}
        </>
      )}

      {activeStepId === "claim" && (
        <>
          <h2>Claim tokens</h2>
          <p className="muted">
            Claiming is available once per identity. If you already claimed, the
            contract safely mints 0.
          </p>
          <button
            type="button"
            className={claimStatus === "confirming" ? "status-warn" : undefined}
            onClick={onClaim}
            disabled={
              !canClaim ||
              claimStatus === "loading" ||
              claimStatus === "confirming" ||
              claimStatus === "success"
            }
          >
            {claimStatus === "loading"
              ? "Submitting claim..."
              : claimStatus === "confirming"
                ? "Waiting..."
              : claimStatus === "success"
                ? "Claimed"
                : claimStatus === "error"
                  ? "Retry claim"
                  : "Claim 100 tokens"}
          </button>
          {claimStatus === "confirming" &&
            claimConfirmationsRemaining != null && (
              <p className="status-warn status-center">
                {claimConfirmationsRemaining} block
                {claimConfirmationsRemaining === 1 ? "" : "s"} confirmations
                remaining
              </p>
            )}
        </>
      )}

      {activeStepId === "transfer" && (
        <>
          <h2>Transfer</h2>
          <p className="muted">
            Transfers are confidential; failed compliance results in a silent
            transfer of 0.
          </p>
          <label className="field">
            <span>Recipient address</span>
            <input
              value={transferTo}
              onChange={(event) => onTransferToChange(event.target.value)}
              placeholder="0x..."
            />
          </label>
          {isSelfTransfer && (
            <p className="status-warn status-center">
              You cannot send tokens to your own address.
            </p>
          )}
          <label className="field">
            <span>Amount (SBA, up to 8 decimals)</span>
            <input
              value={transferAmount}
              onChange={(event) => onTransferAmountChange(event.target.value)}
              placeholder="1.00000000"
            />
          </label>
          {transferStatus === "success" && (
            <p className="status-good status-center">Transfer sent</p>
          )}
          <button
            type="button"
            className={
              transferStatus === "confirming" ? "status-warn" : undefined
            }
            onClick={onTransfer}
            disabled={
              !transferTo ||
              !transferAmount ||
              transferStatus === "loading" ||
              transferStatus === "confirming" ||
              isSelfTransfer
            }
          >
            {transferStatus === "loading"
              ? "Submitting transfer..."
              : transferStatus === "confirming"
                ? "Waiting..."
              : transferStatus === "success"
                ? "Send another transfer"
                : transferStatus === "error"
                  ? "Retry transfer"
                  : "Send transfer"}
          </button>
          {transferStatus === "confirming" &&
            transferConfirmationsRemaining != null && (
              <p className="muted status-center">
                {transferConfirmationsRemaining} block
                {transferConfirmationsRemaining === 1 ? "" : "s"} confirmations
                remaining
              </p>
            )}
        </>
      )}
    </section>
  );
}
