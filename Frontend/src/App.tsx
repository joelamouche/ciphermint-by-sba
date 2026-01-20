import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignMessage,
} from "wagmi";
import {
  API_BASE_URL,
  COMPLIANT_ERC20_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
} from "./config";
import { identityRegistryAbi } from "./abis/identityRegistry";
import { compliantErc20Abi } from "./abis/compliantErc20";
import { ActionPanel, BalanceCard, StatusCard, StepperPanel } from "./components";
import { steps } from "./constants/steps";
import {
  useClaimTokens,
  useKycSession,
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

  const [claimStatus, setClaimStatus] = useState<Status>("idle");
  const [transferStatus, setTransferStatus] = useState<Status>("idle");
  const [mintStatus, setMintStatus] = useState<Status>("idle");
  const [balanceStatus, setBalanceStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const identityReady = Boolean(IDENTITY_REGISTRY_ADDRESS);
  const tokenReady = Boolean(COMPLIANT_ERC20_ADDRESS);

  const { data: isAttested, refetch: refetchAttested } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "isAttested",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && identityReady),
    },
  });

  const { data: _claimedEncrypted, refetch: refetchClaimed } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "hasClaimedMint",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && tokenReady),
    },
  });

  const { data: _balanceEncrypted, refetch: refetchBalance } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && tokenReady),
    },
  });

  useEffect(() => {
    setClaimed(null);
    setMintStatus("idle");
    setBalance(null);
    setBalanceStatus("idle");
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

  const { startKyc, status: kycStatus, sessionUrl } = useKycSession({
    address,
    chainId,
    signMessageAsync,
    onError: (message) => setError(message),
  });

  async function handleStartKyc() {
    setError(null);
    await startKyc();
  }

  const { handleClaim } = useClaimTokens({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    setError,
    setStatus: setClaimStatus,
    abi: compliantErc20Abi,
  });

  const { handleTransfer } = useTransferTokens({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    userAddress: address,
    transferTo,
    transferAmount,
    setError,
    setStatus: setTransferStatus,
    abi: compliantErc20Abi,
  });

  async function handleRefreshIdentity() {
    await refetchAttested();
  }

  const { handleRefreshMint } = useRefreshMint({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    userAddress: address,
    setError,
    setStatus: setMintStatus,
    setClaimed,
    refetchClaimed,
  });

  const { handleRefreshBalance } = useRefreshBalance({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    userAddress: address,
    setError,
    setStatus: setBalanceStatus,
    setBalance,
    refetchBalance,
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
        <h1>CipherMint</h1>
      </header>

      <div className="layout">
        <main className="main">
          <StepperPanel steps={steps} activeStepId={activeStepId} />

          <ActionPanel
            activeStepId={activeStepId}
            isConnected={isConnected}
            sessionUrl={sessionUrl}
            kycStatus={kycStatus}
            canClaim={canClaim}
            claimStatus={claimStatus}
            transferTo={transferTo}
            transferAmount={transferAmount}
            transferStatus={transferStatus}
            onStartKyc={handleStartKyc}
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

      {error && <div className="error">{error}</div>}
    </div>
  );
}
