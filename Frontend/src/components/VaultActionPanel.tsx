import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultActionPanelProps {
  isConnected: boolean;
  isAttested: boolean;
  sbaBalance: bigint | null;
  csbaBalance: bigint | null;
  depositAmount: string;
  withdrawAmount: string;
  onDepositAmountChange: (value: string) => void;
  onWithdrawAmountChange: (value: string) => void;
  onDeposit: () => void;
  onRequestWithdraw: () => void;
  depositStatus: Status;
  depositConfirmationsRemaining: number | null;
  depositPhase: "idle" | "encrypting" | "signing" | "confirming";
  requestStatus: Status;
  requestConfirmationsRemaining: number | null;
  requestPhase: "idle" | "encrypting" | "signing" | "confirming";
  hasPendingWithdraw: boolean;
  depositExceeded: boolean;
  withdrawExceeded: boolean;
}

export function VaultActionPanel({
  isConnected,
  isAttested,
  sbaBalance,
  csbaBalance,
  depositAmount,
  withdrawAmount,
  onDepositAmountChange,
  onWithdrawAmountChange,
  onDeposit,
  onRequestWithdraw,
  depositStatus,
  depositConfirmationsRemaining,
  depositPhase,
  requestStatus,
  requestConfirmationsRemaining,
  requestPhase,
  hasPendingWithdraw,
  depositExceeded,
  withdrawExceeded,
}: VaultActionPanelProps) {
  const sbaKnown = sbaBalance != null;
  const csbaKnown = csbaBalance != null;

  return (
    <section className="card panel">
      <h2>Central Bank Vault</h2>
      <p className="muted">
        Deposit SBA into the vault for CSBA shares, request withdrawal, then complete
        after the lock period.
      </p>

      <label className="field">
        <span>Deposit amount (SBA, up to 8 decimals)</span>
        <input
          value={depositAmount}
          onChange={(event) => onDepositAmountChange(event.target.value)}
          placeholder="10.00000000"
        />
      </label>
      <p className="muted">
        {sbaKnown
          ? `Available SBA: ${formatTokenAmount(sbaBalance)}`
          : "Available SBA: decrypt SBA balance first"}
      </p>
      {depositExceeded && (
        <p className="status-warn status-center">
          Amount exceeds available SBA balance.
        </p>
      )}
      <button
        type="button"
        className={depositStatus === "confirming" ? "status-warn" : undefined}
        onClick={onDeposit}
        disabled={
          !isConnected ||
          !isAttested ||
          !depositAmount ||
          !sbaKnown ||
          depositExceeded ||
          depositStatus === "loading" ||
          depositStatus === "confirming"
        }
      >
        {depositStatus === "loading"
          ? depositPhase === "encrypting"
            ? "Encrypting input..."
            : "Waiting for signature..."
          : depositStatus === "confirming"
            ? "Waiting for confirmations..."
            : depositStatus === "success"
              ? "Deposit again"
              : depositStatus === "error"
                ? "Retry deposit"
                : "Deposit SBA"}
      </button>
      {depositStatus === "loading" && depositPhase === "encrypting" && (
        <p className="muted status-center">
          Encrypting SBA amount with Zama relayer...
        </p>
      )}
      {depositStatus === "loading" && depositPhase === "signing" && (
        <p className="muted status-center">Confirm transaction in your wallet.</p>
      )}
      {depositStatus === "confirming" && depositConfirmationsRemaining != null && (
        <p className="status-warn status-center">
          {depositConfirmationsRemaining} block
          {depositConfirmationsRemaining === 1 ? "" : "s"} confirmations remaining
        </p>
      )}

      <label className="field">
        <span>Request withdrawal amount (CSBA, up to 8 decimals)</span>
        <input
          value={withdrawAmount}
          onChange={(event) => onWithdrawAmountChange(event.target.value)}
          placeholder="5.00000000"
        />
      </label>
      <p className="muted">
        {csbaKnown
          ? `Available CSBA: ${formatTokenAmount(csbaBalance)}`
          : "Available CSBA: refresh vault data to decrypt balance"}
      </p>
      {withdrawExceeded && (
        <p className="status-warn status-center">
          Amount exceeds available CSBA balance.
        </p>
      )}
      <button
        type="button"
        className={requestStatus === "confirming" ? "status-warn" : undefined}
        onClick={onRequestWithdraw}
        disabled={
          !isConnected ||
          !isAttested ||
          !withdrawAmount ||
          !csbaKnown ||
          withdrawExceeded ||
          requestStatus === "loading" ||
          requestStatus === "confirming"
        }
      >
        {requestStatus === "loading"
          ? requestPhase === "encrypting"
            ? "Encrypting input..."
            : "Waiting for signature..."
          : requestStatus === "confirming"
            ? "Waiting for confirmations..."
            : requestStatus === "success"
              ? "Request another withdrawal"
              : requestStatus === "error"
                ? "Retry request"
                : "Request withdrawal"}
      </button>
      {requestStatus === "loading" && requestPhase === "encrypting" && (
        <p className="muted status-center">
          Encrypting CSBA amount with Zama relayer...
        </p>
      )}
      {requestStatus === "loading" && requestPhase === "signing" && (
        <p className="muted status-center">Confirm transaction in your wallet.</p>
      )}
      {requestStatus === "confirming" && requestConfirmationsRemaining != null && (
        <p className="status-warn status-center">
          {requestConfirmationsRemaining} block
          {requestConfirmationsRemaining === 1 ? "" : "s"} confirmations remaining
        </p>
      )}

      {hasPendingWithdraw && (
        <p className="muted status-center">
          Pending requests can be completed from the Vault Positions panel once unlocked.
        </p>
      )}
    </section>
  );
}
