import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useBlockNumber, useReadContract, useSignTypedData } from "wagmi";
import type { Status } from "../App";
import { cipherCentralBankAbi } from "../abis/cipherCentralBank";
import { CIPHER_CENTRAL_BANK_ADDRESS } from "../config";
import { userDecryptEuint64 } from "../lib/fhevm";

interface UseVaultDataParams {
  userAddress?: `0x${string}`;
  setError: (message: string | null) => void;
}

export function useVaultData({ userAddress, setError }: UseVaultDataParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const [csbaBalance, setCsbaBalance] = useState<bigint | null>(null);
  const [pendingCsbaAmount, setPendingCsbaAmount] = useState<bigint | null>(null);

  const { data: sharePriceScaled, refetch: refetchSharePrice } = useReadContract({
    address: CIPHER_CENTRAL_BANK_ADDRESS,
    abi: cipherCentralBankAbi,
    functionName: "sharePriceScaled",
    query: { enabled: Boolean(CIPHER_CENTRAL_BANK_ADDRESS) },
  });

  const { data: monthlyRateBps, refetch: refetchMonthlyRate } = useReadContract({
    address: CIPHER_CENTRAL_BANK_ADDRESS,
    abi: cipherCentralBankAbi,
    functionName: "monthlyRateBps",
    query: { enabled: Boolean(CIPHER_CENTRAL_BANK_ADDRESS) },
  });

  const { data: blocksPerMonth, refetch: refetchBlocksPerMonth } = useReadContract({
    address: CIPHER_CENTRAL_BANK_ADDRESS,
    abi: cipherCentralBankAbi,
    functionName: "BLOCKS_PER_MONTH",
    query: { enabled: Boolean(CIPHER_CENTRAL_BANK_ADDRESS) },
  });

  const { data: pendingRaw, refetch: refetchPending } = useReadContract({
    address: CIPHER_CENTRAL_BANK_ADDRESS,
    abi: cipherCentralBankAbi,
    functionName: "pendingWithdrawals",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(CIPHER_CENTRAL_BANK_ADDRESS && userAddress) },
  });

  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Read encrypted handles using normal hooks, decrypt through mutation.
  const { refetch: refetchBalanceHandle } = useReadContract({
    address: CIPHER_CENTRAL_BANK_ADDRESS,
    abi: cipherCentralBankAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(CIPHER_CENTRAL_BANK_ADDRESS && userAddress) },
  });

  const decryptMutation = useMutation({
    mutationFn: async () => {
      if (!userAddress || !CIPHER_CENTRAL_BANK_ADDRESS) {
        throw new Error("Connect your wallet and configure CipherCentralBank address.");
      }
      const [{ data: csbaHandle }, { data: pending }] = await Promise.all([
        refetchBalanceHandle(),
        refetchPending(),
      ]);
      if (csbaHandle == null) {
        setCsbaBalance(0n);
      } else {
        const decryptedBalance = await userDecryptEuint64({
          encryptedValue: csbaHandle,
          contractAddress: CIPHER_CENTRAL_BANK_ADDRESS,
          userAddress,
          signTypedDataAsync,
        });
        setCsbaBalance(decryptedBalance ?? 0n);
      }

      const tuple = (pending ?? [null, 0n, false]) as [unknown, bigint, boolean];
      if (!tuple[2]) {
        setPendingCsbaAmount(0n);
        return;
      }
      const decryptedPending = await userDecryptEuint64({
        encryptedValue: tuple[0],
        contractAddress: CIPHER_CENTRAL_BANK_ADDRESS,
        userAddress,
        signTypedDataAsync,
      });
      setPendingCsbaAmount(decryptedPending ?? 0n);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Vault refresh failed.");
    },
  });

  useEffect(() => {
    decryptMutation.reset();
    setCsbaBalance(null);
    setPendingCsbaAmount(null);
  }, [userAddress]);

  const pendingTuple = (pendingRaw ?? [0n, 0n, false]) as [unknown, bigint, boolean];
  const pendingUnlockBlock = pendingTuple[1] ? BigInt(pendingTuple[1]) : 0n;
  const pendingActive = Boolean(pendingTuple[2]);
  const blocksUntilUnlock =
    pendingActive && currentBlock != null && pendingUnlockBlock > currentBlock
      ? pendingUnlockBlock - currentBlock
      : 0n;
  const canCompleteWithdraw =
    pendingActive &&
    currentBlock != null &&
    pendingUnlockBlock > 0n &&
    currentBlock >= pendingUnlockBlock;

  const pendingSbaEstimate = useMemo(() => {
    if (!pendingActive || pendingCsbaAmount == null || !sharePriceScaled) return 0n;
    return (pendingCsbaAmount * BigInt(sharePriceScaled)) / 10n ** 8n;
  }, [pendingActive, pendingCsbaAmount, sharePriceScaled]);

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
