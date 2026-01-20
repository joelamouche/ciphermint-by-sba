import { useCallback } from "react";
import { useSignTypedData } from "wagmi";
import type { Status } from "../App";
import { userDecryptEbool } from "../lib/fhevm";

interface UseRefreshMintParams {
  tokenAddress?: string;
  userAddress?: string;
  setError: (message: string | null) => void;
  setStatus: (status: Status) => void;
  setClaimed: (value: boolean | null) => void;
  refetchClaimed: () => Promise<{ data: unknown }>;
}

export function useRefreshMint({
  tokenAddress,
  userAddress,
  setError,
  setStatus,
  setClaimed,
  refetchClaimed,
}: UseRefreshMintParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const handleRefreshMint = useCallback(async () => {
    if (!userAddress || !tokenAddress) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const { data } = await refetchClaimed();
      const decrypted = await userDecryptEbool({
        encryptedValue: data ?? null,
        contractAddress: tokenAddress,
        userAddress,
        signTypedDataAsync,
      });
      setClaimed(decrypted);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Mint refresh failed.");
    }
  }, [
    userAddress,
    tokenAddress,
    setError,
    setStatus,
    setClaimed,
    signTypedDataAsync,
    refetchClaimed,
  ]);

  return { handleRefreshMint };
}
