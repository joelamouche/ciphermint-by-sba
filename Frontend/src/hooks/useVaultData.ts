import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useSignTypedData,
} from "wagmi";
import type { Status } from "../App";
import { cipherCentralBankAbi } from "../abis/cipherCentralBank";
import { userDecryptEuint64 } from "../lib/fhevm";
import { loadCachedBigint, saveCachedBigint } from "../lib/stateCache";

export interface PendingVaultRequest {
  index: number;
  amountCsba: bigint;
  amountSbaEstimate: bigint;
  unlockBlock: bigint;
  active: boolean;
  ready: boolean;
  blocksUntilUnlock: bigint;
}

interface UseVaultDataParams {
  userAddress?: `0x${string}`;
  bankAddress?: `0x${string}`;
  setError: (message: string | null) => void;
}

export function useVaultData({
  userAddress,
  bankAddress,
  setError,
}: UseVaultDataParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const publicClient = usePublicClient();
  const [csbaBalance, setCsbaBalance] = useState<bigint | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingVaultRequest[]>(
    []
  );
  const csbaBalanceKey = userAddress ? `ciphermint-csba-balance-${userAddress}` : null;

  const { data: sharePriceScaled, refetch: refetchSharePrice } = useReadContract({
    address: bankAddress,
    abi: cipherCentralBankAbi,
    functionName: "sharePriceScaled",
    query: { enabled: Boolean(bankAddress) },
  });

  const { data: monthlyRateBps, refetch: refetchMonthlyRate } = useReadContract({
    address: bankAddress,
    abi: cipherCentralBankAbi,
    functionName: "monthlyRateBps",
    query: { enabled: Boolean(bankAddress) },
  });

  const { data: blocksPerMonth, refetch: refetchBlocksPerMonth } = useReadContract({
    address: bankAddress,
    abi: cipherCentralBankAbi,
    functionName: "BLOCKS_PER_MONTH",
    query: { enabled: Boolean(bankAddress) },
  });

  const { refetch: refetchPendingCount } = useReadContract({
    address: bankAddress,
    abi: cipherCentralBankAbi,
    functionName: "getPendingWithdrawCount",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(bankAddress && userAddress) },
  });

  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Read encrypted handles using normal hooks, decrypt through mutation.
  const { refetch: refetchBalanceHandle } = useReadContract({
    address: bankAddress,
    abi: cipherCentralBankAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(bankAddress && userAddress) },
  });

  const decryptMutation = useMutation({
    mutationFn: async () => {
      if (!userAddress || !bankAddress) {
        throw new Error("Connect your wallet and configure CipherCentralBank address.");
      }
      if (!publicClient) {
        throw new Error("Public client unavailable.");
      }
      const [{ data: csbaHandle }, { data: pendingCountRaw }, { data: priceRaw }] =
        await Promise.all([
        refetchBalanceHandle(),
        refetchPendingCount(),
        refetchSharePrice(),
      ]);
      const priceScaled = priceRaw ? BigInt(priceRaw) : 0n;

      if (csbaHandle == null) {
        setCsbaBalance(0n);
        if (csbaBalanceKey) {
          saveCachedBigint(csbaBalanceKey, 0n);
        }
      } else {
        const decryptedBalance = await userDecryptEuint64({
          encryptedValue: csbaHandle,
          contractAddress: bankAddress,
          userAddress,
          signTypedDataAsync,
        });
        const nextBalance = decryptedBalance ?? 0n;
        setCsbaBalance(nextBalance);
        if (csbaBalanceKey) {
          saveCachedBigint(csbaBalanceKey, nextBalance);
        }
      }

      const pendingCount = pendingCountRaw ? Number(pendingCountRaw) : 0;
      const current = await publicClient.getBlockNumber();
      const requests: PendingVaultRequest[] = [];

      for (let i = 0; i < pendingCount; i += 1) {
        const tuple = (await publicClient.readContract({
          address: bankAddress,
          abi: cipherCentralBankAbi,
          functionName: "getPendingWithdraw",
          args: [userAddress, BigInt(i)],
        })) as [unknown, bigint, boolean];
        const active = Boolean(tuple[2]);
        if (!active) continue;

        const decryptedPending = await userDecryptEuint64({
          encryptedValue: tuple[0],
          contractAddress: bankAddress,
          userAddress,
          signTypedDataAsync,
        });
        const amountCsba = decryptedPending ?? 0n;
        const unlockBlock = BigInt(tuple[1]);
        const blocksUntilUnlock = unlockBlock > current ? unlockBlock - current : 0n;
        const ready = unlockBlock > 0n && current >= unlockBlock;
        const amountSbaEstimate =
          priceScaled > 0n ? (amountCsba * priceScaled) / 10n ** 8n : 0n;

        requests.push({
          index: i,
          amountCsba,
          amountSbaEstimate,
          unlockBlock,
          active: true,
          ready,
          blocksUntilUnlock,
        });
      }

      setPendingRequests(requests);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Vault refresh failed.");
    },
  });

  useEffect(() => {
    decryptMutation.reset();
    if (!csbaBalanceKey) {
      setCsbaBalance(null);
    } else {
      const cachedCsbaBalance = loadCachedBigint(csbaBalanceKey);
      setCsbaBalance(cachedCsbaBalance);
    }
    setPendingRequests([]);
  }, [csbaBalanceKey]);

  const pendingActive = pendingRequests.length > 0;
  const maturedRequestIndices = useMemo(
    () => pendingRequests.filter((r) => r.ready).map((r) => r.index),
    [pendingRequests]
  );
  const canCompleteWithdraw = maturedRequestIndices.length > 0;
  const pendingUnlockBlock = useMemo(() => {
    if (!pendingRequests.length) return 0n;
    return pendingRequests.reduce(
      (latest, req) => (req.unlockBlock > latest ? req.unlockBlock : latest),
      0n
    );
  }, [pendingRequests]);
  const blocksUntilUnlock =
    currentBlock != null && pendingUnlockBlock > currentBlock
      ? pendingUnlockBlock - currentBlock
      : 0n;

  const pendingSbaEstimate = useMemo(() => {
    return pendingRequests.reduce((acc, req) => acc + req.amountSbaEstimate, 0n);
  }, [pendingRequests]);

  const pendingCsbaAmount = useMemo(() => {
    return pendingRequests.reduce((acc, req) => acc + req.amountCsba, 0n);
  }, [pendingRequests]);

  const status: Status =
    decryptMutation.status === "pending"
      ? "loading"
      : decryptMutation.status === "success"
        ? "success"
        : decryptMutation.status === "error"
          ? "error"
          : "idle";

  const refreshVaultData = async () => {
    setError(null);
    await Promise.all([refetchSharePrice(), refetchMonthlyRate(), refetchBlocksPerMonth()]);
    try {
      await decryptMutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return {
    csbaBalance,
    pendingCsbaAmount,
    pendingRequests,
    maturedRequestIndices,
    pendingSbaEstimate,
    pendingActive,
    pendingUnlockBlock,
    blocksUntilUnlock,
    canCompleteWithdraw,
    sharePriceScaled: sharePriceScaled ? BigInt(sharePriceScaled) : undefined,
    monthlyRateBps: monthlyRateBps ? BigInt(monthlyRateBps) : undefined,
    blocksPerMonth: blocksPerMonth ? BigInt(blocksPerMonth) : undefined,
    currentBlock,
    refreshVaultData,
    vaultStatus: status,
  };
}
