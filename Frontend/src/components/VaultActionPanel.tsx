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
  onCompleteWithdraw: () => void;
  depositStatus: Status;
  depositConfirmationsRemaining: number | null;
  requestStatus: Status;
  requestConfirmationsRemaining: number | null;
  completeStatus: Status;
  completeConfirmationsRemaining: number | null;
  canCompleteWithdraw: boolean;
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
  onCompleteWithdraw,
  depositStatus,
  depositConfirmationsRemaining,
  requestStatus,
  requestConfirmationsRemaining,
  completeStatus,
  completeConfirmationsRemaining,
  canCompleteWithdraw,
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
          ? "Submitting..."
          : depositStatus === "confirming"
            ? "Waiting..."
            : depositStatus === "success"
              ? "Deposit again"
              : depositStatus === "error"
                ? "Retry deposit"
                : "Deposit SBA"}
      </button>
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
          hasPendingWithdraw ||
          requestStatus === "loading" ||
          requestStatus === "confirming"
        }
      >
        {requestStatus === "loading"
          ? "Submitting..."
          : requestStatus === "confirming"
            ? "Waiting..."
            : requestStatus === "success"
              ? "Request another withdrawal"
              : requestStatus === "error"
                ? "Retry request"
                : hasPendingWithdraw
                  ? "Pending withdrawal active"
                  : "Request withdrawal"}
      </button>
      {requestStatus === "confirming" && requestConfirmationsRemaining != null && (
        <p className="status-warn status-center">
          {requestConfirmationsRemaining} block
          {requestConfirmationsRemaining === 1 ? "" : "s"} confirmations remaining
        </p>
      )}

      <button
        type="button"
        className={completeStatus === "confirming" ? "status-warn" : undefined}
        onClick={onCompleteWithdraw}
        disabled={
          !isConnected ||
          !hasPendingWithdraw ||
          !canCompleteWithdraw ||
          completeStatus === "loading" ||
          completeStatus === "confirming"
        }
      >
        {completeStatus === "loading"
          ? "Submitting..."
          : completeStatus === "confirming"
            ? "Waiting..."
            : completeStatus === "success"
              ? "Completed"
              : completeStatus === "error"
                ? "Retry complete"
                : "Complete withdrawal"}
      </button>
      {!canCompleteWithdraw && hasPendingWithdraw && (
        <p className="muted status-center">
          Completion unlocks after the lock period ends.
        </p>
      )}
      {completeStatus === "confirming" && completeConfirmationsRemaining != null && (
        <p className="status-warn status-center">
          {completeConfirmationsRemaining} block
          {completeConfirmationsRemaining === 1 ? "" : "s"} confirmations remaining
        </p>
      )}
    </section>
  );
}
