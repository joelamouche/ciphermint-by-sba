import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { SiweMessage } from "siwe";
import type { Status } from "../App";
import { API_BASE_URL } from "../config";

interface UseKycSessionParams {
  address?: string;
  chainId: number;
  signMessageAsync: (params: { message: string }) => Promise<string>;
  onError?: (message: string) => void;
}

interface KycSessionResponse {
  sessionUrl: string;
}

export function useKycSession({
  address,
  chainId,
  signMessageAsync,
  onError,
}: UseKycSessionParams) {
  const mutation = useMutation<KycSessionResponse, Error>({
    mutationFn: async () => {
      if (!address) {
        throw new Error("Connect your wallet first.");
      }

      const nonceRes = await fetch(
        `${API_BASE_URL}/api/auth/nonce?walletAddress=${address}`
      );
      if (!nonceRes.ok) {
        throw new Error("Failed to fetch SIWE nonce.");
      }
      const nonceBody = (await nonceRes.json()) as { nonce: string };
      const nonce = nonceBody.nonce;

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CipherMint",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });
      const messageToSign = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message: messageToSign });

      const sessionRes = await fetch(`${API_BASE_URL}/api/kyc/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          siweMessage: messageToSign,
          siweSignature: signature,
        }),
      });
      if (!sessionRes.ok) {
        throw new Error("Failed to create KYC session.");
      }
      return (await sessionRes.json()) as KycSessionResponse;
    },
    onError: (err) => {
      onError?.(err.message ?? "KYC session failed.");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [address, chainId]);

  const status: Status =
    mutation.status === "pending"
      ? "loading"
      : mutation.status === "success"
      ? "success"
      : mutation.status === "error"
      ? "error"
      : "idle";

  const startKyc = async () => {
    mutation.reset();
    try {
      await mutation.mutateAsync();
    } catch {
      // Error is handled in onError.
    }
  };

  return {
    startKyc,
    status,
    sessionUrl: mutation.data?.sessionUrl ?? null,
  };
}
