import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import {
  API_BASE_URL,
  CIPHER_CENTRAL_BANK_ADDRESS,
  DAILY_CIPHER_CENTRAL_BANK_ADDRESS,
  COMPLIANT_ERC20_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
} from "./config";
import { compliantErc20Abi } from "./abis/compliantErc20";
import {
  AboutPage,
  ActionPanel,
  BalanceCard,
  Landing,
  StatusCard,
  StepperPanel,
  TvsCard,
  VaultActionPanel,
  VaultInfoCard,
  VaultWithdrawalsPanel,
} from "./components";
import { steps } from "./constants/steps";
import {
  useClaimTokens,
  useClaimMonthlyIncome,
  useGetKycSession,
  useIdentityStatus,
  useClaimableMonthlyIncome,
  useTotalValueShielded,
  useStartKycSession,
  useRefreshBalance,
  useRefreshMint,
  useTransferTokens,
  useVaultActions,
  useVaultData,
} from "./hooks";
import "./App.css";
import { parseTokenAmount } from "./lib/tokenFormat";
import {
  loadCachedBigint,
  loadCachedBoolean,
  saveCachedBigint,
  saveCachedBoolean,
} from "./lib/stateCache";

export type Status =
  | "idle"
  | "loading"
  | "confirming"
  | "success"
  | "error";

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
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawRequestAmount, setWithdrawRequestAmount] = useState("");
  const [dailyDepositAmount, setDailyDepositAmount] = useState("");
  const [dailyWithdrawRequestAmount, setDailyWithdrawRequestAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [activePage, setActivePage] = useState<
    "ubi" | "vault" | "vaultDaily" | "about"
  >(
    "ubi"
  );
  const [kycPollingEnabled, setKycPollingEnabled] = useState(false);
  const [hasSeenLanding, setHasSeenLanding] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ciphermint-landing-seen") === "true";
  });

  const identityReady = Boolean(IDENTITY_REGISTRY_ADDRESS);
  const tokenReady = Boolean(COMPLIANT_ERC20_ADDRESS);
  const vaultReady = Boolean(CIPHER_CENTRAL_BANK_ADDRESS);
  const dailyVaultReady = Boolean(DAILY_CIPHER_CENTRAL_BANK_ADDRESS);

  const { isAttested, refetchAttested } = useIdentityStatus({ address });

  const { totalValueShielded, refetchTotalValueShielded, tvsStatus } =
    useTotalValueShielded();

  useEffect(() => {
    if (!address || !COMPLIANT_ERC20_ADDRESS) {
      setClaimed(null);
      setBalance(null);
      return;
    }

    const claimedKey = `ciphermint-claimed-${address}`;
    const balanceKey = `ciphermint-balance-${address}`;

    const cachedClaimed = loadCachedBoolean(claimedKey);
    const cachedBalance = loadCachedBigint(balanceKey);

    setClaimed(cachedClaimed);
    setBalance(cachedBalance);
  }, [address, COMPLIANT_ERC20_ADDRESS]);

  const setClaimedWithCache = (value: boolean | null) => {
    setClaimed(value);
    if (address && value !== null) {
      saveCachedBoolean(`ciphermint-claimed-${address}`, value);
    }
  };

  const setBalanceWithCache = (value: bigint | null) => {
    setBalance(value);
    if (address && value !== null) {
      saveCachedBigint(`ciphermint-balance-${address}`, value);
    }
  };

  const canClaim = useMemo(() => {
    return Boolean(isAttested) && claimed !== true;
  }, [isAttested, claimed]);

  const isMintEncrypted = claimed === null;
  const isBalanceEncrypted = balance === null;

  const parsedDepositAmount = useMemo(() => {
    try {
      return depositAmount.trim() ? parseTokenAmount(depositAmount) : null;
    } catch {
      return null;
    }
  }, [depositAmount]);

  const parsedWithdrawAmount = useMemo(() => {
    try {
      return withdrawRequestAmount.trim()
        ? parseTokenAmount(withdrawRequestAmount)
        : null;
    } catch {
      return null;
    }
  }, [withdrawRequestAmount]);
  const parsedDailyDepositAmount = useMemo(() => {
    try {
      return dailyDepositAmount.trim() ? parseTokenAmount(dailyDepositAmount) : null;
    } catch {
      return null;
    }
  }, [dailyDepositAmount]);

  const parsedDailyWithdrawAmount = useMemo(() => {
    try {
      return dailyWithdrawRequestAmount.trim()
        ? parseTokenAmount(dailyWithdrawRequestAmount)
        : null;
    } catch {
      return null;
    }
  }, [dailyWithdrawRequestAmount]);

  const depositExceeded =
    parsedDepositAmount != null &&
    balance != null &&
    parsedDepositAmount > balance;

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

  const {
    status: kycSessionStatus,
    relayerDegraded: kycRelayerDegraded,
    attestationAttempts: kycAttestationAttempts,
    lastError: kycLastError,
  } = useGetKycSession({
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

  const {
    handleClaim,
    status: claimStatus,
    confirmationsRemaining: claimConfirmationsRemaining,
  } = useClaimTokens({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    setError,
    abi: compliantErc20Abi,
    onSuccess: () => {
      refetchTotalValueShielded();
    },
  });

  const {
    handleTransfer,
    status: transferStatus,
    confirmationsRemaining: transferConfirmationsRemaining,
    phase: transferPhase,
  } = useTransferTokens({
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
    setClaimed: setClaimedWithCache,
  });

  const { handleRefreshBalance, status: balanceStatus } = useRefreshBalance({
    userAddress: address,
    setError,
    setBalance: setBalanceWithCache,
  });

  const { claimableIncome, refetchClaimableIncome, claimableIncomeStatus } =
    useClaimableMonthlyIncome({
      userAddress: address,
    });

  const {
    handleClaimMonthlyIncome,
    status: claimMonthlyStatus,
    confirmationsRemaining: incomeConfirmationsRemaining,
  } = useClaimMonthlyIncome({
    tokenAddress: COMPLIANT_ERC20_ADDRESS,
    setError,
    abi: compliantErc20Abi,
    onSuccess: () => {
      refetchTotalValueShielded();
      refetchClaimableIncome();
      handleRefreshBalance();
    },
  });

  const {
    csbaBalance,
    pendingCsbaAmount,
    pendingRequests,
    maturedRequestIndices,
    pendingSbaEstimate,
    pendingActive,
    pendingUnlockBlock,
    blocksUntilUnlock,
    blocksPerMonth,
    sharePriceScaled,
    monthlyRateBps,
    currentBlock,
    refreshVaultData,
    vaultStatus,
  } = useVaultData({
    userAddress: address,
    bankAddress: CIPHER_CENTRAL_BANK_ADDRESS,
    setError,
  });
  const {
    csbaBalance: dcsbaBalance,
    pendingRequests: dailyPendingRequests,
    maturedRequestIndices: dailyMaturedRequestIndices,
    pendingActive: dailyPendingActive,
    blocksPerMonth: dailyBlocksPerMonth,
    sharePriceScaled: dailySharePriceScaled,
    monthlyRateBps: dailyRateBps,
    refreshVaultData: refreshDailyVaultData,
    vaultStatus: dailyVaultStatus,
  } = useVaultData({
    userAddress: address,
    bankAddress: DAILY_CIPHER_CENTRAL_BANK_ADDRESS,
    setError,
  });
  const withdrawExceeded =
    parsedWithdrawAmount != null &&
    csbaBalance != null &&
    parsedWithdrawAmount > csbaBalance;
  const dailyDepositExceeded =
    parsedDailyDepositAmount != null &&
    balance != null &&
    parsedDailyDepositAmount > balance;
  const dailyWithdrawExceeded =
    parsedDailyWithdrawAmount != null &&
    dcsbaBalance != null &&
    parsedDailyWithdrawAmount > dcsbaBalance;

  const {
    deposit,
    requestWithdraw,
    completeWithdraw,
    completeWithdrawMany,
    depositState,
    requestState,
    completeState,
  } = useVaultActions({
    userAddress: address,
    bankAddress: CIPHER_CENTRAL_BANK_ADDRESS,
    setError,
    onSuccess: async (action) => {
      if (action === "deposit") {
        // After deposit confirmation, re-decrypt both balances exactly once.
        await Promise.all([refreshVaultData(), handleRefreshBalance()]);
        return;
      }
      await refreshVaultData();
    },
  });
  const {
    deposit: depositDaily,
    requestWithdraw: requestWithdrawDaily,
    completeWithdraw: completeWithdrawDaily,
    completeWithdrawMany: completeWithdrawManyDaily,
    depositState: dailyDepositState,
    requestState: dailyRequestState,
    completeState: dailyCompleteState,
  } = useVaultActions({
    userAddress: address,
    bankAddress: DAILY_CIPHER_CENTRAL_BANK_ADDRESS,
    setError,
    onSuccess: async (action) => {
      if (action === "deposit") {
        await Promise.all([refreshDailyVaultData(), handleRefreshBalance()]);
        return;
      }
      await refreshDailyVaultData();
    },
  });

  async function handleVaultDeposit() {
    if (
      parsedDepositAmount != null &&
      balance != null &&
      parsedDepositAmount > balance
    ) {
      setError("Deposit amount exceeds your available SBA balance.");
      return;
    }
    await deposit(depositAmount);
  }

  async function handleVaultRequestWithdraw() {
    if (
      parsedWithdrawAmount != null &&
      csbaBalance != null &&
      parsedWithdrawAmount > csbaBalance
    ) {
      setError("Withdrawal request exceeds your available CSBA balance.");
      return;
    }
    await requestWithdraw(withdrawRequestAmount);
  }

  async function handleVaultCompleteWithdraw(requestIndex: number) {
    await completeWithdraw(requestIndex);
  }

  async function handleVaultCompleteMatured() {
    await completeWithdrawMany(maturedRequestIndices);
  }
  async function handleDailyVaultDeposit() {
    if (
      parsedDailyDepositAmount != null &&
      balance != null &&
      parsedDailyDepositAmount > balance
    ) {
      setError("Deposit amount exceeds your available SBA balance.");
      return;
    }
    await depositDaily(dailyDepositAmount);
  }

  async function handleDailyVaultRequestWithdraw() {
    if (
      parsedDailyWithdrawAmount != null &&
      dcsbaBalance != null &&
      parsedDailyWithdrawAmount > dcsbaBalance
    ) {
      setError("Withdrawal request exceeds your available DCSBA balance.");
      return;
    }
    await requestWithdrawDaily(dailyWithdrawRequestAmount);
  }

  async function handleDailyVaultCompleteWithdraw(requestIndex: number) {
    await completeWithdrawDaily(requestIndex);
  }

  async function handleDailyVaultCompleteMatured() {
    await completeWithdrawManyDaily(dailyMaturedRequestIndices);
  }

  useEffect(() => {
    if (!isConnected) return;
    if (activePage === "vault") {
      refreshVaultData();
      return;
    }
    if (activePage === "vaultDaily") {
      refreshDailyVaultData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activePage, address]);

  function handleCompleteLanding() {
    setHasSeenLanding(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ciphermint-landing-seen", "true");
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

  if (!hasSeenLanding) {
    return (
      <div className="app">
        <Landing onContinue={handleCompleteLanding} />
      </div>
    );
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
              <span className="brand-subtitle-text">UBI using Zama</span>
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
            className={`nav-link ${activePage === "ubi" ? "active" : ""}`}
            onClick={() => setActivePage("ubi")}
          >
            UBI Token
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "vault" ? "active" : ""}`}
            onClick={() => setActivePage("vault")}
            disabled={!vaultReady}
          >
            Central Bank Vault
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "vaultDaily" ? "active" : ""}`}
            onClick={() => setActivePage("vaultDaily")}
            disabled={!dailyVaultReady}
          >
            Daily Central Bank Vault
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
            {activePage === "ubi" ? (
              <>
                <StepperPanel steps={steps} activeStepId={activeStepId} />

                <ActionPanel
                  activeStepId={activeStepId}
                  isConnected={isConnected}
                  userAddress={address}
                  sessionUrl={sessionUrl}
                  kycSessionStatus={kycSessionStatus}
                  kycRelayerDegraded={kycRelayerDegraded}
                  kycAttestationAttempts={kycAttestationAttempts}
                  kycLastError={kycLastError}
                  kycStatus={kycStatus}
                  canClaim={canClaim}
                  claimStatus={claimStatus}
                  transferTo={transferTo}
                  transferAmount={transferAmount}
                  transferStatus={transferStatus}
                  transferPhase={transferPhase}
                  claimConfirmationsRemaining={claimConfirmationsRemaining}
                  transferConfirmationsRemaining={
                    transferConfirmationsRemaining
                  }
                  onStartKyc={handleStartKyc}
                  onOpenKyc={handleOpenKyc}
                  onClaim={handleClaim}
                  onTransferToChange={setTransferTo}
                  onTransferAmountChange={setTransferAmount}
                  onTransfer={handleTransfer}
                />
              </>
            ) : activePage === "vault" ? (
              <>
                <VaultActionPanel
                  title="Central Bank Vault"
                  description="Deposit SBA into the monthly vault for CSBA shares, request withdrawal, then complete after the monthly lock period."
                  shareSymbol="CSBA"
                  baseSymbol="SBA"
                  isConnected={isConnected}
                  isAttested={Boolean(isAttested)}
                  sbaBalance={balance}
                  csbaBalance={csbaBalance}
                  depositAmount={depositAmount}
                  withdrawAmount={withdrawRequestAmount}
                  onDepositAmountChange={setDepositAmount}
                  onWithdrawAmountChange={setWithdrawRequestAmount}
                  onDeposit={handleVaultDeposit}
                  onRequestWithdraw={handleVaultRequestWithdraw}
                  depositStatus={depositState.status}
                  depositConfirmationsRemaining={depositState.confirmationsRemaining}
                  depositPhase={depositState.phase}
                  depositStepLabel={depositState.stepLabel}
                  requestStatus={requestState.status}
                  requestConfirmationsRemaining={requestState.confirmationsRemaining}
                  requestPhase={requestState.phase}
                  requestStepLabel={requestState.stepLabel}
                  hasPendingWithdraw={pendingActive}
                  depositExceeded={depositExceeded}
                  withdrawExceeded={withdrawExceeded}
                />
                <VaultWithdrawalsPanel
                  title="Vault Withdrawals"
                  description="Each withdrawal request creates one position. Positions unlock independently after the monthly lock and can be completed one-by-one or in batch."
                  shareSymbol="CSBA"
                  baseSymbol="SBA"
                  unlockUnitLabel="month"
                  unlockUnitDays={30}
                  vaultStatus={vaultStatus}
                  onRefreshVault={refreshVaultData}
                  pendingRequests={pendingRequests}
                  blocksPerMonth={blocksPerMonth}
                  completeStatus={completeState.status}
                  completePhase={completeState.phase}
                  completeConfirmationsRemaining={completeState.confirmationsRemaining}
                  onCompleteRequest={handleVaultCompleteWithdraw}
                  onCompleteMatured={handleVaultCompleteMatured}
                />
              </>
            ) : (
              <>
                <VaultActionPanel
                  title="Daily Central Bank Vault"
                  description="Deposit SBA into the daily vault for DCSBA shares, request withdrawal, then complete after the daily lock period."
                  shareSymbol="DCSBA"
                  baseSymbol="SBA"
                  isConnected={isConnected}
                  isAttested={Boolean(isAttested)}
                  sbaBalance={balance}
                  csbaBalance={dcsbaBalance}
                  depositAmount={dailyDepositAmount}
                  withdrawAmount={dailyWithdrawRequestAmount}
                  onDepositAmountChange={setDailyDepositAmount}
                  onWithdrawAmountChange={setDailyWithdrawRequestAmount}
                  onDeposit={handleDailyVaultDeposit}
                  onRequestWithdraw={handleDailyVaultRequestWithdraw}
                  depositStatus={dailyDepositState.status}
                  depositConfirmationsRemaining={
                    dailyDepositState.confirmationsRemaining
                  }
                  depositPhase={dailyDepositState.phase}
                  depositStepLabel={dailyDepositState.stepLabel}
                  requestStatus={dailyRequestState.status}
                  requestConfirmationsRemaining={
                    dailyRequestState.confirmationsRemaining
                  }
                  requestPhase={dailyRequestState.phase}
                  requestStepLabel={dailyRequestState.stepLabel}
                  hasPendingWithdraw={dailyPendingActive}
                  depositExceeded={dailyDepositExceeded}
                  withdrawExceeded={dailyWithdrawExceeded}
                />
                <VaultWithdrawalsPanel
                  title="Daily Vault Withdrawals"
                  description="Each withdrawal request creates one daily position. Positions unlock independently and can be completed one-by-one or in batch."
                  shareSymbol="DCSBA"
                  baseSymbol="SBA"
                  unlockUnitLabel="day"
                  unlockUnitDays={1}
                  vaultStatus={dailyVaultStatus}
                  onRefreshVault={refreshDailyVaultData}
                  pendingRequests={dailyPendingRequests}
                  blocksPerMonth={dailyBlocksPerMonth}
                  completeStatus={dailyCompleteState.status}
                  completePhase={dailyCompleteState.phase}
                  completeConfirmationsRemaining={
                    dailyCompleteState.confirmationsRemaining
                  }
                  onCompleteRequest={handleDailyVaultCompleteWithdraw}
                  onCompleteMatured={handleDailyVaultCompleteMatured}
                />
              </>
            )}
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

            {activePage === "ubi" ? (
              <>
                <BalanceCard
                  balance={balance}
                  isBalanceEncrypted={isBalanceEncrypted}
                  balanceStatus={balanceStatus}
                  onRefreshBalance={handleRefreshBalance}
                  claimableIncome={claimableIncome}
                  claimableIncomeStatus={claimableIncomeStatus}
                  claimMonthlyStatus={claimMonthlyStatus}
                  claimMonthlyConfirmationsRemaining={incomeConfirmationsRemaining}
                  onRefreshIncome={refetchClaimableIncome}
                  onClaimIncome={handleClaimMonthlyIncome}
                />

                <TvsCard
                  totalValueShielded={totalValueShielded}
                  tvsStatus={tvsStatus as any}
                  onRefreshTvs={refetchTotalValueShielded}
                />
              </>
            ) : activePage === "vault" ? (
              <>
                <VaultInfoCard
                  title="Vault Overview"
                  description="Your CSBA position and expected monthly return."
                  shareSymbol="CSBA"
                  baseSymbol="SBA"
                  roiLabel="Monthly ROI"
                  vaultStatus={vaultStatus}
                  onRefreshVault={refreshVaultData}
                  csbaBalance={csbaBalance}
                  sharePriceScaled={sharePriceScaled}
                  monthlyRateBps={monthlyRateBps}
                />
                <BalanceCard
                  balance={balance}
                  isBalanceEncrypted={isBalanceEncrypted}
                  balanceStatus={balanceStatus}
                  onRefreshBalance={handleRefreshBalance}
                  claimableIncome={claimableIncome}
                  claimableIncomeStatus={claimableIncomeStatus}
                  claimMonthlyStatus={claimMonthlyStatus}
                  claimMonthlyConfirmationsRemaining={incomeConfirmationsRemaining}
                  onRefreshIncome={refetchClaimableIncome}
                  onClaimIncome={handleClaimMonthlyIncome}
                />
              </>
            ) : (
              <>
                <VaultInfoCard
                  title="Daily Vault Overview"
                  description="Your DCSBA position and expected daily return."
                  shareSymbol="DCSBA"
                  baseSymbol="SBA"
                  roiLabel="Daily ROI"
                  vaultStatus={dailyVaultStatus}
                  onRefreshVault={refreshDailyVaultData}
                  csbaBalance={dcsbaBalance}
                  sharePriceScaled={dailySharePriceScaled}
                  monthlyRateBps={dailyRateBps}
                />
                <BalanceCard
                  balance={balance}
                  isBalanceEncrypted={isBalanceEncrypted}
                  balanceStatus={balanceStatus}
                  onRefreshBalance={handleRefreshBalance}
                  claimableIncome={claimableIncome}
                  claimableIncomeStatus={claimableIncomeStatus}
                  claimMonthlyStatus={claimMonthlyStatus}
                  claimMonthlyConfirmationsRemaining={incomeConfirmationsRemaining}
                  onRefreshIncome={refetchClaimableIncome}
                  onClaimIncome={handleClaimMonthlyIncome}
                />
              </>
            )}
          </aside>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
