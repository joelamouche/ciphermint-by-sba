import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "../config";

type KycSessionStatus = "created" | "in_progress" | "done";

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
      const body = (await response.json()) as { status?: string };
      return (body.status as KycSessionStatus | undefined) ?? "created";
    },
    refetchInterval: (queryState) =>
      queryState.state.data === "done" ? false : 5000,
  });

  useEffect(() => {
    if (query.data === "done") {
      onDone?.();
    }
  }, [query.data, onDone]);

  return {
    status: query.data ?? null,
    isPolling: Boolean(sessionId && enabled && query.data !== "done"),
  };
}
