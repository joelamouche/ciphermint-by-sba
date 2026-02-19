import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { usePublicClient, useWriteContract } from "wagmi";
import type { Status } from "../App";

interface UseClaimMonthlyIncomeParams {
  tokenAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  abi: unknown;
  onSuccess?: () => void;
}

export function useClaimMonthlyIncome({
  tokenAddress,
  setError,
  abi,
  onSuccess,
}: UseClaimMonthlyIncomeParams) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState<Status>("idle");
  const [confirmationsRemaining, setConfirmationsRemaining] = useState<
    number | null
  >(null);

  const REQUIRED_CONFIRMATIONS = 6;
  const mutation = useMutation({
    mutationFn: async (): Promise<`0x${string}`> => {
      if (!tokenAddress) {
        throw new Error("CompliantERC20 address not configured.");
      }
      setStatus("loading");
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: abi as any,
        functionName: "claimMonthlyIncome",
        args: [],
      });

      setStatus("confirming");
      setConfirmationsRemaining(REQUIRED_CONFIRMATIONS);

      return hash;
    },
    onError: (err) => {
      setError(
        err instanceof Error ? err.message : "Monthly income claim failed.",
      );
      setStatus("error");
      setConfirmationsRemaining(null);
    },
    onSuccess: async (hash) => {
      if (!publicClient) {
        setStatus("success");
        setConfirmationsRemaining(null);
        onSuccess?.();
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
        onSuccess?.();
      } catch (error) {
        setStatus("error");
        setConfirmationsRemaining(null);
        setError(
          error instanceof Error
            ? error.message
            : "Monthly income claim failed.",
        );
      }
    },
  });

  useEffect(() => {
    mutation.reset();
    setStatus("idle");
    setConfirmationsRemaining(null);
  }, [tokenAddress]);

  const handleClaimMonthlyIncome = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // handled in onError
    }
  };

  return { handleClaimMonthlyIncome, status, confirmationsRemaining };
}

