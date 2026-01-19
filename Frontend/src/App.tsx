import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignMessage,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { SiweMessage } from "siwe";
import { isAddress, isHex, type Address, type Hex } from "viem";
import {
  API_BASE_URL,
  COMPLIANT_ERC20_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
} from "./config";
import { identityRegistryAbi } from "./abis/identityRegistry";
import { compliantErc20Abi } from "./abis/compliantErc20";
import {
  encryptUint64,
  userDecryptEbool,
  userDecryptEuint64,
} from "./lib/fhevm";
import "./App.css";

type Status = "idle" | "loading" | "success" | "error";

function formatAddress(value?: string) {
  if (!value) return "Disconnected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<Status>("idle");
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

  const steps = [
    {
      id: "connect",
      title: "Connect wallet",
      description: "Link a wallet to begin.",
    },
    {
      id: "verify",
      title: "Verify identity",
      description: "Complete Didit KYC.",
    },
    {
      id: "claim",
      title: "Claim tokens",
      description: "Mint once if eligible.",
    },
    {
      id: "transfer",
      title: "Transfer",
      description: "Send confidential tokens.",
    },
  ] as const;

  async function handleStartKyc() {
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }
    setError(null);
    setKycStatus("loading");
    setSessionUrl(null);
    try {
      const nonceRes = await fetch(
        `${API_BASE_URL}/api/auth/nonce?walletAddress=${address}`
      );
      if (!nonceRes.ok) {
        throw new Error("Failed to fetch SIWE nonce.");
      }
      const nonceBody = (await nonceRes.json()) as { nonce: string };
      const nonce = nonceBody.nonce;

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CipherMint",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });
      const messageToSign = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message: messageToSign });
      const sessionRes = await fetch(`${API_BASE_URL}/api/kyc/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          siweMessage: messageToSign,
          siweSignature: signature,
        }),
      });
      if (!sessionRes.ok) {
        throw new Error("Failed to create KYC session.");
      }
      const sessionBody = (await sessionRes.json()) as { sessionUrl: string };
      setSessionUrl(sessionBody.sessionUrl);
      setKycStatus("success");
    } catch (err) {
      setKycStatus("error");
      setError(err instanceof Error ? err.message : "KYC session failed.");
    }
  }

  async function handleClaim() {
    if (!COMPLIANT_ERC20_ADDRESS) {
      setError("CompliantERC20 address not configured.");
      return;
    }
    setError(null);
    setClaimStatus("loading");
    try {
      await writeContractAsync({
        address: COMPLIANT_ERC20_ADDRESS,
        abi: compliantErc20Abi,
        functionName: "claimTokens",
        args: [],
      });
      setClaimStatus("success");
    } catch (err) {
      setClaimStatus("error");
      setError(err instanceof Error ? err.message : "Claim failed.");
    }
  }

  async function handleTransfer() {
    if (!address || !COMPLIANT_ERC20_ADDRESS) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setTransferStatus("loading");
    try {
      const amountValue = BigInt(transferAmount);
      if (amountValue <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }
      const { handle, inputProof } = await encryptUint64(
        COMPLIANT_ERC20_ADDRESS,
        address,
        amountValue
      );
      if (!isAddress(transferTo)) {
        throw new Error("Recipient address is invalid.");
      }
      if (!isHex(handle) || !isHex(inputProof)) {
        throw new Error("Encrypted payload is invalid.");
      }
      const recipient = transferTo as Address;
      const handleHex = handle as Hex;
      const inputProofHex = inputProof as Hex;

      await writeContractAsync({
        address: COMPLIANT_ERC20_ADDRESS,
        abi: compliantErc20Abi,
        functionName: "transfer",
        args: [recipient, handleHex, inputProofHex],
      });
      setTransferStatus("success");
    } catch (err) {
      setTransferStatus("error");
      setError(err instanceof Error ? err.message : "Transfer failed.");
    }
  }

  async function handleRefreshIdentity() {
    await refetchAttested();
  }

  async function handleRefreshMint() {
    if (!address || !COMPLIANT_ERC20_ADDRESS) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setMintStatus("loading");
    try {
      const { data } = await refetchClaimed();
      console.log("refetchClaimed data", data);
      const decrypted = await userDecryptEbool({
        encryptedValue: data ?? null,
        contractAddress: COMPLIANT_ERC20_ADDRESS,
        userAddress: address,
        signTypedDataAsync,
      });
      console.log("decrypted", decrypted);
      setClaimed(decrypted);
      setMintStatus("success");
    } catch (err) {
      setMintStatus("error");
      setError(err instanceof Error ? err.message : "Mint refresh failed.");
    }
  }

  async function handleRefreshBalance() {
    if (!address || !COMPLIANT_ERC20_ADDRESS) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setBalanceStatus("loading");
    try {
      const { data } = await refetchBalance();
      const decrypted = await userDecryptEuint64({
        encryptedValue: data ?? null,
        contractAddress: COMPLIANT_ERC20_ADDRESS,
        userAddress: address,
        signTypedDataAsync,
      });
      setBalance(decrypted);
      setBalanceStatus("success");
    } catch (err) {
      setBalanceStatus("error");
      setError(err instanceof Error ? err.message : "Balance refresh failed.");
    }
  }

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
        <ConnectButton />
      </header>

      <div className="layout">
        <main className="main">
          <section className="card stepper">
            <h2>Progress</h2>
            <ol className="stepper-list">
              {steps.map((step, index) => {
                const activeIndex = steps.findIndex(
                  (entry) => entry.id === activeStepId
                );
                const isActive = step.id === activeStepId;
                const isDone = index < activeIndex;
                return (
                  <li
                    key={step.id}
                    className={`step ${isActive ? "active" : ""} ${
                      isDone ? "done" : ""
                    }`}
                  >
                    <span className="step-index">{index + 1}</span>
                    <div>
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.description}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

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
                  Start the Didit flow in another tab. Once completed, the
                  backend writes your identity on-chain.
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
                    onClick={handleStartKyc}
                    disabled={!isConnected || kycStatus === "loading"}
                  >
                    {kycStatus === "loading"
                      ? "Creating session..."
                      : "Start KYC"}
                  </button>
                )}
              </>
            )}

            {activeStepId === "claim" && (
              <>
                <h2>Claim tokens</h2>
                <p className="muted">
                  Claiming is available once per identity. If you already
                  claimed, the contract safely mints 0.
                </p>
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={!canClaim || claimStatus === "loading"}
                >
                  {claimStatus === "loading"
                    ? "Claiming..."
                    : "Claim 100 tokens"}
                </button>
              </>
            )}

            {activeStepId === "transfer" && (
              <>
                <h2>Transfer</h2>
                <p className="muted">
                  Transfers are confidential; failed compliance results in a
                  silent transfer of 0.
                </p>
                <label className="field">
                  <span>Recipient address</span>
                  <input
                    value={transferTo}
                    onChange={(event) => setTransferTo(event.target.value)}
                    placeholder="0x..."
                  />
                </label>
                <label className="field">
                  <span>Amount (plaintext units)</span>
                  <input
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    placeholder="100"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={
                    !transferTo || !transferAmount || transferStatus === "loading"
                  }
                >
                  {transferStatus === "loading" ? "Sending..." : "Send transfer"}
                </button>
              </>
            )}
          </section>
        </main>

        <aside className="sidebar">
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
                    <button
                      type="button"
                      className="ghost"
                      onClick={handleCopyAddress}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div className="status-row">
                  <span>Identity</span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleRefreshIdentity}
                  >
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
                    onClick={handleRefreshMint}
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

          <section className="card">
            <h2>Balance</h2>
            <p className="muted">
              Decryption requires a signature. Balance is shown in plaintext units.
            </p>
            <div className="status-grid">
              <div>
                <div className="status-row">
                  <span>Encrypted balance</span>
                  <button
                    type="button"
                    className={`ghost ${isBalanceEncrypted ? "ghost-warn" : ""}`}
                    onClick={handleRefreshBalance}
                    disabled={balanceStatus === "loading"}
                  >
                    {balanceStatus === "loading"
                      ? "Refreshing..."
                      : isBalanceEncrypted
                      ? "Decrypt"
                      : "Refresh"}
                  </button>
                </div>
                <strong className={isBalanceEncrypted ? "status-warn" : ""}>
                  {isBalanceEncrypted ? "Encrypted" : balance.toString()}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
