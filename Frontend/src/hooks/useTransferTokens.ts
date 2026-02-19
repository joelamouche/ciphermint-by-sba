import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { usePublicClient, useWriteContract } from "wagmi";
import { isAddress, isHex, toHex, type Address, type Hex } from "viem";
import type { Status } from "../App";
import { encryptUint64 } from "../lib/fhevm";
import { parseTokenAmount } from "../lib/tokenFormat";

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
  const publicClient = usePublicClient();
  const [status, setStatus] = useState<Status>("idle");
  const [confirmationsRemaining, setConfirmationsRemaining] = useState<
    number | null
  >(null);
  const REQUIRED_CONFIRMATIONS = 6;
  const normalizeHex = (value: unknown): Hex | null => {
    if (typeof value === "string") {
      return isHex(value) ? (value as Hex) : null;
    }
    if (value instanceof Uint8Array) {
      return toHex(value);
    }
    if (value instanceof ArrayBuffer) {
      return toHex(new Uint8Array(value));
    }
    if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
      return toHex(new Uint8Array(value));
    }
    return null;
  };
  const mutation = useMutation({
    mutationFn: async (): Promise<`0x${string}`> => {
      if (!userAddress || !tokenAddress) {
        throw new Error(
          "Connect your wallet and configure CompliantERC20 address."
        );
      }
      let amountValue: bigint;
      try {
        amountValue = parseTokenAmount(transferAmount);
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "Invalid amount format."
        );
      }
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
      const handleHex = normalizeHex(handle);
      const inputProofHex = normalizeHex(inputProof);
      if (!handleHex || !inputProofHex) {
        throw new Error("Encrypted payload is invalid.");
      }
      const recipient = transferTo as Address;

      setStatus("loading");
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: abi as any,
        functionName: "transfer",
        args: [recipient, handleHex, inputProofHex],
      });
      setStatus("confirming");
      setConfirmationsRemaining(REQUIRED_CONFIRMATIONS);

      return hash;
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setStatus("error");
      setConfirmationsRemaining(null);
    },
    onSuccess: async (hash) => {
      if (!publicClient) {
        setStatus("success");
        setConfirmationsRemaining(null);
        return;
      }

      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

        const minedBlock = receipt.blockNumber;

        // Poll until we reach the required confirmations, updating remaining count
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const latestBlock = await publicClient.getBlockNumber();
          const confirmations =
            Number(latestBlock - minedBlock + 1n);
          const remaining = Math.max(
            0,
            REQUIRED_CONFIRMATIONS - confirmations,
          );

          setConfirmationsRemaining(remaining);

          if (remaining <= 0) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        setStatus("success");
        setConfirmationsRemaining(null);
      } catch (error) {
        setStatus("error");
        setConfirmationsRemaining(null);
        setError(
          error instanceof Error ? error.message : "Transfer failed.",
        );
      }
    },
  });

  useEffect(() => {
    mutation.reset();
    setStatus("idle");
    setConfirmationsRemaining(null);
  }, [tokenAddress, userAddress, transferTo, transferAmount]);

  const handleTransfer = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleTransfer, status, confirmationsRemaining };
}
