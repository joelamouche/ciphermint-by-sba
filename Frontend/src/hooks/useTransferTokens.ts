import { useCallback } from "react";
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
  setStatus: (status: Status) => void;
  abi: unknown;
}

export function useTransferTokens({
  tokenAddress,
  userAddress,
  transferTo,
  transferAmount,
  setError,
  setStatus,
  abi,
}: UseTransferTokensParams) {
  const { writeContractAsync } = useWriteContract();
  const handleTransfer = useCallback(async () => {
    if (!userAddress || !tokenAddress) {
      setError("Connect your wallet and configure CompliantERC20 address.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
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
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transfer failed.");
    }
  }, [
    userAddress,
    tokenAddress,
    transferTo,
    transferAmount,
    setError,
    setStatus,
    writeContractAsync,
    abi,
  ]);

  return { handleTransfer };
}
