import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useReadContract, useSignTypedData } from "wagmi";
import type { Status } from "../App";
import { compliantErc20Abi } from "../abis/compliantErc20";
import { COMPLIANT_ERC20_ADDRESS } from "../config";
import { userDecryptEuint64 } from "../lib/fhevm";

interface UseRefreshBalanceParams {
  userAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  setBalance: (value: bigint | null) => void;
}

export function useRefreshBalance({
  userAddress,
  setError,
  setBalance,
}: UseRefreshBalanceParams) {
  const { signTypedDataAsync } = useSignTypedData();
  const { refetch: refetchBalance } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "balanceOf",
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
      const { data } = await refetchBalance();
      if (data == null) {
        throw new Error("Encrypted balance not available yet.");
      }
      const decrypted = await userDecryptEuint64({
        encryptedValue: data ?? null,
        contractAddress: COMPLIANT_ERC20_ADDRESS,
        userAddress,
        signTypedDataAsync,
      });
      if (decrypted === null) {
        setBalance(0n);
        return;
      }
      setBalance(decrypted);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Balance refresh failed.");
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

  const handleRefreshBalance = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleRefreshBalance, status };
}
