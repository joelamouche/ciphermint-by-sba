import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Status } from "../App";

type ActionStep = "connect" | "verify" | "claim" | "transfer";

interface ActionPanelProps {
  activeStepId: ActionStep;
  isConnected: boolean;
  sessionUrl: string | null;
  kycStatus: Status;
  canClaim: boolean;
  claimStatus: Status;
  transferTo: string;
  transferAmount: string;
  transferStatus: Status;
  onStartKyc: () => void;
  onClaim: () => void;
  onTransferToChange: (value: string) => void;
  onTransferAmountChange: (value: string) => void;
  onTransfer: () => void;
}

export function ActionPanel({
  activeStepId,
  isConnected,
  sessionUrl,
  kycStatus,
  canClaim,
  claimStatus,
  transferTo,
  transferAmount,
  transferStatus,
  onStartKyc,
  onClaim,
  onTransferToChange,
  onTransferAmountChange,
  onTransfer,
}: ActionPanelProps) {
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
            <a
              className="primary-link"
              href={sessionUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Didit verification
            </a>
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
            onClick={onClaim}
            disabled={!canClaim || claimStatus === "loading"}
          >
            {claimStatus === "loading" ? "Claiming..." : "Claim 100 tokens"}
          </button>
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
          <label className="field">
            <span>Amount (plaintext units)</span>
            <input
              value={transferAmount}
              onChange={(event) => onTransferAmountChange(event.target.value)}
              placeholder="100"
            />
          </label>
          <button
            type="button"
            onClick={onTransfer}
            disabled={
              !transferTo || !transferAmount || transferStatus === "loading"
            }
          >
            {transferStatus === "loading" ? "Sending..." : "Send transfer"}
          </button>
        </>
      )}
    </section>
  );
}
