import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { isHex, toHex, type Hex } from "viem";
import type { Status } from "../App";
import { cipherCentralBankAbi } from "../abis/cipherCentralBank";
import { compliantErc20Abi } from "../abis/compliantErc20";
import {
  CIPHER_CENTRAL_BANK_ADDRESS,
  COMPLIANT_UBI_ADDRESS,
  TX_CONFIRMATIONS_REQUIRED,
} from "../config";
import { encryptUint64 } from "../lib/fhevm";
import { parseTokenAmount } from "../lib/tokenFormat";

interface UseVaultActionsParams {
  userAddress?: `0x${string}`;
  setError: (message: string | null) => void;
  onSuccess?: (
    action:
      | "deposit"
      | "requestWithdraw"
      | "completeWithdraw"
      | "completeWithdrawMany"
  ) => void | Promise<void>;
}

interface ActionState {
  status: Status;
  confirmationsRemaining: number | null;
  phase: "idle" | "encrypting" | "signing" | "confirming";
}

const REQUIRED_CONFIRMATIONS = TX_CONFIRMATIONS_REQUIRED;

function normalizeHex(value: unknown): Hex | null {
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
}

export function useVaultActions({
  userAddress,
  setError,
  onSuccess,
}: UseVaultActionsParams) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [depositState, setDepositState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
  });
  const [requestState, setRequestState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
  });
  const [completeState, setCompleteState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
  });

  const waitForConfirmations = async (
    hash: `0x${string}`,
    setState: (next: ActionState) => void
  ) => {
    if (!publicClient) {
      setState({ status: "success", confirmationsRemaining: null, phase: "idle" });
      return;
    }
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
    const minedBlock = receipt.blockNumber;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const latestBlock = await publicClient.getBlockNumber();
      const confirmations = Number(latestBlock - minedBlock + 1n);
      const remaining = Math.max(0, REQUIRED_CONFIRMATIONS - confirmations);
      setState({
        status: "confirming",
        confirmationsRemaining: remaining,
        phase: "confirming",
      });
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    setState({ status: "success", confirmationsRemaining: null, phase: "idle" });
  };

  const deposit = async (rawAmount: string) => {
    setError(null);
    try {
      if (!userAddress || !COMPLIANT_UBI_ADDRESS || !CIPHER_CENTRAL_BANK_ADDRESS) {
        throw new Error("Wallet, SBA address, or bank address is not configured.");
      }
      const amount = parseTokenAmount(rawAmount);
      if (amount <= 0n) {
        throw new Error("Deposit amount must be greater than zero.");
      }
      setDepositState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "encrypting",
      });

      const approvedAmount = await encryptUint64(COMPLIANT_UBI_ADDRESS, userAddress, amount);
      const approveHandle = normalizeHex(approvedAmount.handle);
      const approveProof = normalizeHex(approvedAmount.inputProof);
      if (!approveHandle || !approveProof) {
        throw new Error("Invalid encrypted payload for SBA approval.");
      }
      setDepositState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
      });
      const approveHash = await writeContractAsync({
        address: COMPLIANT_UBI_ADDRESS,
        abi: compliantErc20Abi,
        functionName: "approve",
        args: [CIPHER_CENTRAL_BANK_ADDRESS, approveHandle, approveProof],
      });
      setDepositState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
      });
      await waitForConfirmations(approveHash, setDepositState);

      setDepositState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "encrypting",
      });
      const depositAmount = await encryptUint64(
        CIPHER_CENTRAL_BANK_ADDRESS,
        userAddress,
        amount
      );
      const depositHandle = normalizeHex(depositAmount.handle);
      const depositProof = normalizeHex(depositAmount.inputProof);
      if (!depositHandle || !depositProof) {
        throw new Error("Invalid encrypted payload for vault deposit.");
      }
      setDepositState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
      });
      const depositHash = await writeContractAsync({
        address: CIPHER_CENTRAL_BANK_ADDRESS,
        abi: cipherCentralBankAbi,
        functionName: "deposit",
        args: [depositHandle, depositProof],
      });
      setDepositState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
      });
      await waitForConfirmations(depositHash, setDepositState);
      await onSuccess?.("deposit");
    } catch (err) {
      setDepositState({ status: "error", confirmationsRemaining: null, phase: "idle" });
      setError(err instanceof Error ? err.message : "Vault deposit failed.");
    }
  };

  const requestWithdraw = async (rawAmount: string) => {
    setError(null);
    try {
      if (!userAddress || !CIPHER_CENTRAL_BANK_ADDRESS) {
        throw new Error("Wallet or bank address is not configured.");
      }
      const amount = parseTokenAmount(rawAmount);
      if (amount <= 0n) {
        throw new Error("Withdrawal request amount must be greater than zero.");
      }
      setRequestState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "encrypting",
      });
      const encrypted = await encryptUint64(CIPHER_CENTRAL_BANK_ADDRESS, userAddress, amount);
      const handle = normalizeHex(encrypted.handle);
      const proof = normalizeHex(encrypted.inputProof);
      if (!handle || !proof) {
        throw new Error("Invalid encrypted payload for withdraw request.");
      }
      setRequestState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
      });
      const hash = await writeContractAsync({
        address: CIPHER_CENTRAL_BANK_ADDRESS,
        abi: cipherCentralBankAbi,
        functionName: "requestWithdraw",
        args: [handle, proof],
      });
      setRequestState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
      });
      await waitForConfirmations(hash, setRequestState);
      await onSuccess?.("requestWithdraw");
    } catch (err) {
      setRequestState({ status: "error", confirmationsRemaining: null, phase: "idle" });
      setError(err instanceof Error ? err.message : "Withdraw request failed.");
    }
  };

  const completeWithdraw = async (requestIndex: number) => {
    setError(null);
    try {
      if (!CIPHER_CENTRAL_BANK_ADDRESS) {
        throw new Error("Bank address is not configured.");
      }
      if (!Number.isInteger(requestIndex) || requestIndex < 0) {
        throw new Error("Invalid withdrawal request index.");
      }
      setCompleteState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
      });
      const hash = await writeContractAsync({
        address: CIPHER_CENTRAL_BANK_ADDRESS,
        abi: cipherCentralBankAbi,
        functionName: "completeWithdraw",
        args: [BigInt(requestIndex)],
      });
      setCompleteState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
      });
      await waitForConfirmations(hash, setCompleteState);
      await onSuccess?.("completeWithdraw");
    } catch (err) {
      setCompleteState({ status: "error", confirmationsRemaining: null, phase: "idle" });
      setError(err instanceof Error ? err.message : "Complete withdraw failed.");
    }
  };

  const completeWithdrawMany = async (requestIndices: number[]) => {
    setError(null);
    try {
      if (!CIPHER_CENTRAL_BANK_ADDRESS) {
        throw new Error("Bank address is not configured.");
      }
      if (!requestIndices.length) {
        throw new Error("No matured withdrawal requests selected.");
      }
      const normalized = requestIndices.map((value) => {
        if (!Number.isInteger(value) || value < 0) {
          throw new Error("Invalid withdrawal request index.");
        }
        return BigInt(value);
      });
      setCompleteState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
      });
      const hash = await writeContractAsync({
        address: CIPHER_CENTRAL_BANK_ADDRESS,
        abi: cipherCentralBankAbi,
        functionName: "completeWithdrawMany",
        args: [normalized],
      });
      setCompleteState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
      });
      await waitForConfirmations(hash, setCompleteState);
      await onSuccess?.("completeWithdrawMany");
    } catch (err) {
      setCompleteState({ status: "error", confirmationsRemaining: null, phase: "idle" });
      setError(err instanceof Error ? err.message : "Batch complete withdraw failed.");
    }
  };

  return {
    deposit,
    requestWithdraw,
    completeWithdraw,
    completeWithdrawMany,
    depositState,
    requestState,
    completeState,
  };
}
