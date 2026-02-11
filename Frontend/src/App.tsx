import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import {
  API_BASE_URL,
  COMPLIANT_ERC20_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
} from "./config";
import { compliantErc20Abi } from "./abis/compliantErc20";
import {
  AboutPage,
  ActionPanel,
  BalanceCard,
  StatusCard,
  StepperPanel,
} from "./components";
import { steps } from "./constants/steps";
import {
  useClaimTokens,
  useGetKycSession,
  useIdentityStatus,
  useStartKycSession,
  useRefreshBalance,
  useRefreshMint,
  useTransferTokens,
} from "./hooks";
import "./App.css";

export type Status = "idle" | "loading" | "success" | "error";

function formatAddress(value?: string) {
  if (!value) return "Disconnected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [activePage, setActivePage] = useState<"app" | "about">("app");
  const [kycPollingEnabled, setKycPollingEnabled] = useState(false);

  const identityReady = Boolean(IDENTITY_REGISTRY_ADDRESS);
  const tokenReady = Boolean(COMPLIANT_ERC20_ADDRESS);

  const { isAttested, refetchAttested } = useIdentityStatus({ address });

  useEffect(() => {
    setClaimed(null);
    setBalance(null);
  }, [address, COMPLIANT_ERC20_ADDRESS]);

  const canClaim = useMemo(() => {
    return Boolean(isAttested) && claimed !== true;
  }, [isAttested, claimed]);

  const isMintEncrypted = claimed === null;
  const isBalanceEncrypted = balance === null;

  const activeStepId = useMemo(() => {
    if (!isConnected) return "connect";
    if (!isAttested) return "verify";
    if (claimed === true) return "transfer";
    return "claim";
  }, [isConnected, isAttested, claimed]);

  const {
    startKyc,
    status: kycStatus,
    sessionUrl,
    sessionId,
  } = useStartKycSession({
    address,
    chainId,
    signMessageAsync,
    onError: (message) => setError(message),
  });

  const { status: kycSessionStatus } = useGetKycSession({
    sessionId,
    enabled: kycPollingEnabled,
    onDone: () => {
      setKycPollingEnabled(false);
      refetchAttested();
    },
  });

  useEffect(() => {
    if (!sessionUrl) {
      setKycPollingEnabled(false);
    }
  }, [sessionUrl]);

  async function handleStartKyc() {
    setError(null);
    await startKyc();
  }

  function handleOpenKyc() {
    if (!sessionUrl) return;
    window.open(sessionUrl, "_blank", "noopener,noreferrer");
    setKycPollingEnabled(true);
  }

  const { handleClaim, status: claimStatus } = useClaimTokens({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    setError,
    abi: compliantErc20Abi,
  });

  const { handleTransfer, status: transferStatus } = useTransferTokens({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    userAddress: address,
    transferTo,
    transferAmount,
    setError,
    abi: compliantErc20Abi,
  });

  async function handleRefreshIdentity() {
    await refetchAttested();
  }

  const { handleRefreshMint, status: mintStatus } = useRefreshMint({
    userAddress: address,
    setError,
    setClaimed,
  });

  const { handleRefreshBalance, status: balanceStatus } = useRefreshBalance({
    userAddress: address,
    setError,
    setBalance,
  });

  async function handleCopyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError("Failed to copy address.");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <a
            className="brand-logo-link"
            href="https://stevensba.com"
            target="_blank"
            rel="noreferrer"
          >
            <img
              className="brand-logo"
              src="/sba-logo-transparent.png"
              alt="SBA logo"
            />
          </a>
          <div className="brand-text">
            <h1 className="brand-title">
              CipherMint <span className="brand-by">by</span>{" "}
              <a
                className="brand-link"
                href="https://stevensba.com"
                target="_blank"
                rel="noreferrer"
              >
                SBA
              </a>
            </h1>
            <div className="brand-subtitle">
              <span className="brand-subtitle-text">using Zama</span>
              <img
                className="brand-subtitle-logo"
                src="/zama-logo.png"
                alt="Zama logo"
              />
            </div>
          </div>
        </div>
        <nav className="topbar-actions" aria-label="Primary">
          <button
            type="button"
            className={`nav-link ${activePage === "app" ? "active" : ""}`}
            onClick={() => setActivePage("app")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "about" ? "active" : ""}`}
            onClick={() => setActivePage("about")}
          >
            About
          </button>
        </nav>
      </header>

      {activePage === "about" ? (
        <AboutPage />
      ) : (
        <div className="layout">
          <main className="main">
            <StepperPanel steps={steps} activeStepId={activeStepId} />

            <ActionPanel
              activeStepId={activeStepId}
              isConnected={isConnected}
              userAddress={address}
              sessionUrl={sessionUrl}
              kycSessionStatus={kycSessionStatus}
              kycStatus={kycStatus}
              canClaim={canClaim}
              claimStatus={claimStatus}
              transferTo={transferTo}
              transferAmount={transferAmount}
              transferStatus={transferStatus}
              onStartKyc={handleStartKyc}
              onOpenKyc={handleOpenKyc}
              onClaim={handleClaim}
              onTransferToChange={setTransferTo}
              onTransferAmountChange={setTransferAmount}
              onTransfer={handleTransfer}
            />
          </main>

          <aside className="sidebar">
            <StatusCard
              address={address}
              isConnected={isConnected}
              isAttested={isAttested}
              claimed={claimed}
              copied={copied}
              identityReady={identityReady}
              tokenReady={tokenReady}
              isMintEncrypted={isMintEncrypted}
              mintStatus={mintStatus}
              onCopyAddress={handleCopyAddress}
              onRefreshIdentity={handleRefreshIdentity}
              onRefreshMint={handleRefreshMint}
              formatAddress={formatAddress}
            />

            <BalanceCard
              balance={balance}
              isBalanceEncrypted={isBalanceEncrypted}
              balanceStatus={balanceStatus}
              onRefreshBalance={handleRefreshBalance}
            />
          </aside>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
