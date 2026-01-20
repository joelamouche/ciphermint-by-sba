import { useCallback } from "react";
import { useWriteContract } from "wagmi";
import type { Status } from "../App";

interface UseClaimTokensParams {
  tokenAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  setStatus: (status: Status) => void;
  abi: unknown;
}

export function useClaimTokens({
  tokenAddress,
  setError,
  setStatus,
  abi,
}: UseClaimTokensParams) {
  const { writeContractAsync } = useWriteContract();
  const handleClaim = useCallback(async () => {
    if (!tokenAddress) {
      setError("CompliantERC20 address not configured.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      await writeContractAsync({
        address: tokenAddress,
        abi: abi as any,
        functionName: "claimTokens",
        args: [],
      });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Claim failed.");
    }
  }, [tokenAddress, setError, setStatus, writeContractAsync, abi]);

  return { handleClaim };
}
