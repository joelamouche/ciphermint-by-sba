import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWriteContract } from "wagmi";
import type { Status } from "../App";

interface UseClaimTokensParams {
  tokenAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  abi: unknown;
}

export function useClaimTokens({
  tokenAddress,
  setError,
  abi,
}: UseClaimTokensParams) {
  const { writeContractAsync } = useWriteContract();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!tokenAddress) {
        throw new Error("CompliantERC20 address not configured.");
      }
      await writeContractAsync({
        address: tokenAddress,
        abi: abi as any,
        functionName: "claimTokens",
        args: [],
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Claim failed.");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [tokenAddress]);

  const status: Status =
    mutation.status === "pending"
      ? "loading"
      : mutation.status === "success"
      ? "success"
      : mutation.status === "error"
      ? "error"
      : "idle";

  const handleClaim = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleClaim, status };
}
