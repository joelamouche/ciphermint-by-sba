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
import { encryptUint64, userDecryptEbool } from "./lib/fhevm";
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
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
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

  const { data: claimedEncrypted, refetch: refetchClaimed } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "hasClaimedMint",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && tokenReady),
    },
  });

  useEffect(() => {
    setClaimed(null);
    setMintStatus("idle");
  }, [address, COMPLIANT_ERC20_ADDRESS]);

  const canClaim = useMemo(() => {
    return Boolean(isAttested) && claimed !== true;
  }, [isAttested, claimed]);

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
      console.log("messageToSign", messageToSign);
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
      <header>
        <h1>CipherMint</h1>
        <ConnectButton />
      </header>

      <section className="card">
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
              <strong>
                {formatAddress(isConnected ? address : undefined)}
              </strong>
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
            <span>Identity</span>
            <strong>{isAttested ? "Attested" : "Not attested"}</strong>
          </div>
          <div>
            <span>Mint claimed</span>
            <strong>
              {claimed === null
                ? "Encrypted / unknown"
                : claimed
                ? "Yes"
                : "No"}
            </strong>
          </div>
        </div>
        <div className="status-actions">
          <button type="button" onClick={handleRefreshIdentity}>
            Refresh identity
          </button>
          <button
            type="button"
            onClick={handleRefreshMint}
            disabled={mintStatus === "loading"}
          >
            {mintStatus === "loading"
              ? "Refreshing..."
              : "Refresh mint claimed"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>KYC</h2>
        <p>
          If you are not attested yet, start the Didit flow in another tab. Once
          completed, the backend will write your identity on-chain.
        </p>
        {sessionUrl ? (
          <p className="link">
            <a href={sessionUrl} target="_blank" rel="noreferrer">
              Open Didit verification
            </a>
          </p>
        ) : (
          <button
            type="button"
            onClick={handleStartKyc}
            disabled={!isConnected || kycStatus === "loading"}
          >
            {kycStatus === "loading" ? "Creating session..." : "Start KYC"}
          </button>
        )}
      </section>

      <section className="card">
        <h2>Claim tokens</h2>
        <button
          type="button"
          onClick={handleClaim}
          disabled={!canClaim || claimStatus === "loading"}
        >
          {claimStatus === "loading" ? "Claiming..." : "Claim 100 tokens"}
        </button>
        {!canClaim && (
          <p className="muted">
            You must be attested to claim. If claim status is unknown, claiming
            will safely mint 0 when already claimed.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Transfer</h2>
        <p className="muted">
          Transfers are confidential; failed compliance results in a silent
          transfer of 0.
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
      </section>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
