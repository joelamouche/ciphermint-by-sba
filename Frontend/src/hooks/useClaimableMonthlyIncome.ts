import { useReadContract } from "wagmi";
import type { Status } from "../App";
import { compliantErc20Abi } from "../abis/compliantErc20";
import { COMPLIANT_ERC20_ADDRESS } from "../config";

interface UseClaimableMonthlyIncomeParams {
  userAddress?: `0x${string}`;
}

export function useClaimableMonthlyIncome({
  userAddress,
}: UseClaimableMonthlyIncomeParams) {
  const { data, refetch, status } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "claimableMonthlyIncome",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(userAddress && COMPLIANT_ERC20_ADDRESS),
    },
  });

  const mappedStatus: Status =
    status === "pending"
      ? "loading"
      : status === "success"
      ? "success"
      : status === "error"
      ? "error"
      : "idle";

  return {
    claimableIncome: data as bigint | undefined,
    refetchClaimableIncome: refetch,
    claimableIncomeStatus: mappedStatus,
  };
}

