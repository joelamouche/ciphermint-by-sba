import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { isHex, toHex, type Hex } from "viem";
import type { Status } from "../App";
import { cipherCentralBankAbi } from "../abis/cipherCentralBank";
import { compliantErc20Abi } from "../abis/compliantErc20";
import {
  COMPLIANT_UBI_ADDRESS,
  TX_CONFIRMATIONS_REQUIRED,
} from "../config";
import { encryptUint64 } from "../lib/fhevm";
import { parseTokenAmount } from "../lib/tokenFormat";

interface UseVaultActionsParams {
  userAddress?: `0x${string}`;
  bankAddress?: `0x${string}`;
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
  stepLabel: string | null;
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
  bankAddress,
  setError,
  onSuccess,
}: UseVaultActionsParams) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [depositState, setDepositState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
    stepLabel: null,
  });
  const [requestState, setRequestState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
    stepLabel: null,
  });
  const [completeState, setCompleteState] = useState<ActionState>({
    status: "idle",
    confirmationsRemaining: null,
    phase: "idle",
    stepLabel: null,
  });

  const waitForConfirmations = async (
    hash: `0x${string}`,
    setState: (next: ActionState) => void,
    stepLabel: string
  ) => {
    if (!publicClient) {
      setState({
        status: "success",
        confirmationsRemaining: null,
        phase: "idle",
        stepLabel: null,
      });
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
        stepLabel,
      });
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    setState({ status: "success", confirmationsRemaining: null, phase: "idle", stepLabel: null });
  };

  const deposit = async (rawAmount: string) => {
    setError(null);
    try {
      if (!userAddress || !COMPLIANT_UBI_ADDRESS || !bankAddress) {
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
        stepLabel: "Step 1/2: Encrypting approval input...",
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
        stepLabel: "Step 1/2: Approve SBA spending in your wallet.",
      });
      const approveHash = await writeContractAsync({
        address: COMPLIANT_UBI_ADDRESS,
        abi: compliantErc20Abi,
        functionName: "approve",
        args: [bankAddress, approveHandle, approveProof],
      });
      setDepositState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
        stepLabel: "Step 1/2: Waiting for approval confirmations...",
      });
      await waitForConfirmations(
        approveHash,
        setDepositState,
        "Step 1/2: Waiting for approval confirmations...",
      );

      setDepositState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "encrypting",
        stepLabel: "Step 2/2: Encrypting deposit input...",
      });
      const depositAmount = await encryptUint64(
        bankAddress,
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
        stepLabel: "Step 2/2: Confirm deposit in your wallet.",
      });
      const depositHash = await writeContractAsync({
        address: bankAddress,
        abi: cipherCentralBankAbi,
        functionName: "deposit",
        args: [depositHandle, depositProof],
      });
      setDepositState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
        stepLabel: "Step 2/2: Waiting for deposit confirmations...",
      });
      await waitForConfirmations(
        depositHash,
        setDepositState,
        "Step 2/2: Waiting for deposit confirmations...",
      );
      await onSuccess?.("deposit");
    } catch (err) {
      setDepositState({
        status: "error",
        confirmationsRemaining: null,
        phase: "idle",
        stepLabel: null,
      });
      setError(err instanceof Error ? err.message : "Vault deposit failed.");
    }
  };

  const requestWithdraw = async (rawAmount: string) => {
    setError(null);
    try {
      if (!userAddress || !bankAddress) {
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
        stepLabel: "Encrypting withdraw request input...",
      });
      const encrypted = await encryptUint64(bankAddress, userAddress, amount);
      const handle = normalizeHex(encrypted.handle);
      const proof = normalizeHex(encrypted.inputProof);
      if (!handle || !proof) {
        throw new Error("Invalid encrypted payload for withdraw request.");
      }
      setRequestState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
        stepLabel: "Confirm withdraw request in your wallet.",
      });
      const hash = await writeContractAsync({
        address: bankAddress,
        abi: cipherCentralBankAbi,
        functionName: "requestWithdraw",
        args: [handle, proof],
      });
      setRequestState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
        stepLabel: "Waiting for withdraw request confirmations...",
      });
      await waitForConfirmations(
        hash,
        setRequestState,
        "Waiting for withdraw request confirmations...",
      );
      await onSuccess?.("requestWithdraw");
    } catch (err) {
      setRequestState({
        status: "error",
        confirmationsRemaining: null,
        phase: "idle",
        stepLabel: null,
      });
      setError(err instanceof Error ? err.message : "Withdraw request failed.");
    }
  };

  const completeWithdraw = async (requestIndex: number) => {
    setError(null);
    try {
      if (!bankAddress) {
        throw new Error("Bank address is not configured.");
      }
      if (!Number.isInteger(requestIndex) || requestIndex < 0) {
        throw new Error("Invalid withdrawal request index.");
      }
      setCompleteState({
        status: "loading",
        confirmationsRemaining: null,
        phase: "signing",
        stepLabel: "Confirm complete withdraw in your wallet.",
      });
      const hash = await writeContractAsync({
        address: bankAddress,
        abi: cipherCentralBankAbi,
        functionName: "completeWithdraw",
        args: [BigInt(requestIndex)],
      });
      setCompleteState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
        stepLabel: "Waiting for complete withdraw confirmations...",
      });
      await waitForConfirmations(
        hash,
        setCompleteState,
        "Waiting for complete withdraw confirmations...",
      );
      await onSuccess?.("completeWithdraw");
    } catch (err) {
      setCompleteState({
        status: "error",
        confirmationsRemaining: null,
        phase: "idle",
        stepLabel: null,
      });
      setError(err instanceof Error ? err.message : "Complete withdraw failed.");
    }
  };

  const completeWithdrawMany = async (requestIndices: number[]) => {
    setError(null);
    try {
      if (!bankAddress) {
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
        stepLabel: "Confirm batch completion in your wallet.",
      });
      const hash = await writeContractAsync({
        address: bankAddress,
        abi: cipherCentralBankAbi,
        functionName: "completeWithdrawMany",
        args: [normalized],
      });
      setCompleteState({
        status: "confirming",
        confirmationsRemaining: REQUIRED_CONFIRMATIONS,
        phase: "confirming",
        stepLabel: "Waiting for batch completion confirmations...",
      });
      await waitForConfirmations(
        hash,
        setCompleteState,
        "Waiting for batch completion confirmations...",
      );
      await onSuccess?.("completeWithdrawMany");
    } catch (err) {
      setCompleteState({
        status: "error",
        confirmationsRemaining: null,
        phase: "idle",
        stepLabel: null,
      });
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
