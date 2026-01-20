import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useReadContract, useSignTypedData } from "wagmi";
import type { Status } from "../App";
import { compliantErc20Abi } from "../abis/compliantErc20";
import { COMPLIANT_ERC20_ADDRESS } from "../config";
import { userDecryptEbool } from "../lib/fhevm";

interface UseRefreshMintParams {
  userAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  setClaimed: (value: boolean | null) => void;
}

export function useRefreshMint({
  userAddress,
  setError,
  setClaimed,
}: UseRefreshMintParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const { refetch: refetchClaimed } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "hasClaimedMint",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(userAddress && COMPLIANT_ERC20_ADDRESS),
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!userAddress || !COMPLIANT_ERC20_ADDRESS) {
        throw new Error("Connect your wallet and configure CompliantERC20 address.");
      }
      const { data } = await refetchClaimed();
      if (data == null) {
        throw new Error("Encrypted mint status not available yet.");
      }
      const decrypted = await userDecryptEbool({
        encryptedValue: data ?? null,
        contractAddress: COMPLIANT_ERC20_ADDRESS,
        userAddress,
        signTypedDataAsync,
      });
      if (decrypted === null) {
        setClaimed(false);
        return;
      }
      setClaimed(decrypted);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Mint refresh failed.");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [userAddress]);

  const status: Status =
    mutation.status === "pending"
      ? "loading"
      : mutation.status === "success"
      ? "success"
      : mutation.status === "error"
      ? "error"
      : "idle";

  const handleRefreshMint = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleRefreshMint, status };
}
