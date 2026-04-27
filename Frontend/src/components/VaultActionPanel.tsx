import type { Status } from "../App";
import { formatTokenAmount } from "../lib/tokenFormat";

interface VaultActionPanelProps {
  title: string;
  description: string;
  shareSymbol: string;
  baseSymbol: string;
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
  depositStepLabel: string | null;
  requestStatus: Status;
  requestConfirmationsRemaining: number | null;
  requestPhase: "idle" | "encrypting" | "signing" | "confirming";
  requestStepLabel: string | null;
  hasPendingWithdraw: boolean;
  depositExceeded: boolean;
  withdrawExceeded: boolean;
}

export function VaultActionPanel({
  title,
  description,
  shareSymbol,
  baseSymbol,
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
  depositStepLabel,
  requestStatus,
  requestConfirmationsRemaining,
  requestPhase,
  requestStepLabel,
  hasPendingWithdraw,
  depositExceeded,
  withdrawExceeded,
}: VaultActionPanelProps) {
  const sbaKnown = sbaBalance != null;
  const csbaKnown = csbaBalance != null;

  return (
    <section className="card panel">
      <h2>{title}</h2>
      <p className="muted">{description}</p>

      <label className="field">
        <span>Deposit amount ({baseSymbol}, up to 8 decimals)</span>
        <input
          value={depositAmount}
          onChange={(event) => onDepositAmountChange(event.target.value)}
          placeholder="10.00000000"
        />
      </label>
      <p className="muted">
        {sbaKnown
          ? `Available ${baseSymbol}: ${formatTokenAmount(sbaBalance)}`
          : `Available ${baseSymbol}: decrypt ${baseSymbol} balance first`}
      </p>
      {depositExceeded && (
        <p className="status-warn status-center">
          Amount exceeds available {baseSymbol} balance.
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
                : `Approve ${baseSymbol} first`}
      </button>
      {(depositStatus === "loading" || depositStatus === "confirming") &&
        depositStepLabel && <p className="muted status-center">{depositStepLabel}</p>}
      {depositStatus === "loading" && depositPhase === "encrypting" && (
        <p className="muted status-center">
          Encrypting {baseSymbol} amount with Zama relayer...
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
        <span>Request withdrawal amount ({shareSymbol}, up to 8 decimals)</span>
        <input
          value={withdrawAmount}
          onChange={(event) => onWithdrawAmountChange(event.target.value)}
          placeholder="5.00000000"
        />
      </label>
      <p className="muted">
        {csbaKnown
          ? `Available ${shareSymbol}: ${formatTokenAmount(csbaBalance)}`
          : `Available ${shareSymbol}: refresh vault data to decrypt balance`}
      </p>
      {withdrawExceeded && (
        <p className="status-warn status-center">
          Amount exceeds available {shareSymbol} balance.
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
      {(requestStatus === "loading" || requestStatus === "confirming") &&
        requestStepLabel && <p className="muted status-center">{requestStepLabel}</p>}
      {requestStatus === "loading" && requestPhase === "encrypting" && (
        <p className="muted status-center">
          Encrypting {shareSymbol} amount with Zama relayer...
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
