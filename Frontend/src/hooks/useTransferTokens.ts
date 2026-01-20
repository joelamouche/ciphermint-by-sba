import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWriteContract } from "wagmi";
import { isAddress, isHex, type Address, type Hex } from "viem";
import type { Status } from "../App";
import { encryptUint64 } from "../lib/fhevm";

interface UseTransferTokensParams {
  tokenAddress?: `0x${string}`;
  userAddress?: `0x${string}`;
  transferTo: string;
  transferAmount: string;
  setError: (message: string | null) => void;
  abi: unknown;
}

export function useTransferTokens({
  tokenAddress,
  userAddress,
  transferTo,
  transferAmount,
  setError,
  abi,
}: UseTransferTokensParams) {
  const { writeContractAsync } = useWriteContract();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!userAddress || !tokenAddress) {
        throw new Error("Connect your wallet and configure CompliantERC20 address.");
      }
      const amountValue = BigInt(transferAmount);
      if (amountValue <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }
      const { handle, inputProof } = await encryptUint64(
        tokenAddress,
        userAddress,
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
        address: tokenAddress,
        abi: abi as any,
        functionName: "transfer",
        args: [recipient, handleHex, inputProofHex],
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Transfer failed.");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [tokenAddress, userAddress, transferTo, transferAmount]);

  const status: Status =
    mutation.status === "pending"
      ? "loading"
      : mutation.status === "success"
      ? "success"
      : mutation.status === "error"
      ? "error"
      : "idle";

  const handleTransfer = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleTransfer, status };
}
