import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "../config";

type KycSessionStatus =
  | "created"
  | "didit_in_progress"
  | "attesting"
  | "degraded"
  | "done";

interface KycSessionState {
  status: KycSessionStatus;
  relayerDegraded: boolean;
  attestationAttempts: number;
  lastError: string | null;
}

interface UseGetKycSessionParams {
  sessionId: string | null;
  enabled: boolean;
  onDone?: () => void;
}

export function useGetKycSession({
  sessionId,
  enabled,
  onDone,
}: UseGetKycSessionParams) {
  const query = useQuery({
    queryKey: ["kyc-session-status", sessionId],
    enabled: Boolean(sessionId && enabled),
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/kyc/session/${sessionId}/status`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch KYC session status.");
      }
      const body = (await response.json()) as {
        status?: string;
        relayerDegraded?: boolean;
        attestationAttempts?: number;
        lastError?: string | null;
      };
      return {
        status: (body.status as KycSessionStatus | undefined) ?? "created",
        relayerDegraded: Boolean(body.relayerDegraded),
        attestationAttempts: body.attestationAttempts ?? 0,
        lastError: body.lastError ?? null,
      } satisfies KycSessionState;
    },
    refetchInterval: (queryState) =>
      queryState.state.data?.status === "done" ? false : 5000,
  });

  useEffect(() => {
    if (query.data?.status === "done") {
      onDone?.();
    }
  }, [query.data?.status, onDone]);

  return {
    status: query.data?.status ?? null,
    relayerDegraded: query.data?.relayerDegraded ?? false,
    attestationAttempts: query.data?.attestationAttempts ?? 0,
    lastError: query.data?.lastError ?? null,
    isPolling: Boolean(sessionId && enabled && query.data?.status !== "done"),
  };
}
