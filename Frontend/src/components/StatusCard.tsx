import type { Status } from "../App";

interface StatusCardProps {
  address?: string;
  isConnected: boolean;
  isAttested?: boolean;
  claimed: boolean | null;
  copied: boolean;
  identityReady: boolean;
  tokenReady: boolean;
  isMintEncrypted: boolean;
  mintStatus: Status;
  onCopyAddress: () => void;
  onRefreshIdentity: () => void;
  onRefreshMint: () => void;
  formatAddress: (value?: string) => string;
}

export function StatusCard({
  address,
  isConnected,
  isAttested,
  claimed,
  copied,
  identityReady,
  tokenReady,
  isMintEncrypted,
  mintStatus,
  onCopyAddress,
  onRefreshIdentity,
  onRefreshMint,
  formatAddress,
}: StatusCardProps) {
  return (
    <section className="card status-card">
      <h2>Status</h2>
      {!identityReady && (
        <p className="warning">Set VITE_IDENTITY_REGISTRY_ADDRESS.</p>
      )}
      {!tokenReady && (
        <p className="warning">Set VITE_COMPLIANT_ERC20_ADDRESS.</p>
      )}
      <div className="status-grid">
        <div>
          <span>Wallet</span>
          <div className="address-row">
            <strong>{formatAddress(isConnected ? address : undefined)}</strong>
            {isConnected && (
              <button type="button" className="ghost" onClick={onCopyAddress}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="status-row">
            <span>Identity</span>
            <button type="button" className="ghost" onClick={onRefreshIdentity}>
              Refresh
            </button>
          </div>
          <strong className={isAttested ? "status-good" : "status-warn"}>
            {isAttested ? "Attested" : "Not attested"}
          </strong>
        </div>
        <div>
          <div className="status-row">
            <span>Mint claimed</span>
            <button
              type="button"
              className={`ghost ${isMintEncrypted ? "ghost-warn" : ""}`}
              onClick={onRefreshMint}
              disabled={mintStatus === "loading"}
            >
              {mintStatus === "loading"
                ? "Refreshing..."
                : isMintEncrypted
                ? "Decrypt"
                : "Refresh"}
            </button>
          </div>
          <strong className={isMintEncrypted ? "status-warn" : ""}>
            {isMintEncrypted ? "Encrypted" : claimed ? "Yes" : "No"}
          </strong>
        </div>
      </div>
    </section>
  );
}
