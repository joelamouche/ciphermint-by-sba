import { useCallback } from "react";
import { useSignTypedData } from "wagmi";
import type { Status } from "../App";
import { userDecryptEuint64 } from "../lib/fhevm";

interface UseRefreshBalanceParams {
  tokenAddress?: string;
  userAddress?: string;
  setError: (message: string | null) => void;
  setStatus: (status: Status) => void;
  setBalance: (value: bigint | null) => void;
  refetchBalance: () => Promise<{ data: unknown }>;
}

export function useRefreshBalance({
  tokenAddress,
  userAddress,
  setError,
  setStatus,
  setBalance,
  refetchBalance,
}: UseRefreshBalanceParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const handleRefreshBalance = useCallback(async () => {
    if (!userAddress || !tokenAddress) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const { data } = await refetchBalance();
      const decrypted = await userDecryptEuint64({
        encryptedValue: data ?? null,
        contractAddress: tokenAddress,
        userAddress,
        signTypedDataAsync,
      });
      setBalance(decrypted);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Balance refresh failed.");
    }
  }, [
    userAddress,
    tokenAddress,
    setError,
    setStatus,
    setBalance,
    signTypedDataAsync,
    refetchBalance,
  ]);

  return { handleRefreshBalance };
}
