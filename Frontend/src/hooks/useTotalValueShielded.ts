import { useReadContract } from "wagmi";
import { compliantErc20Abi } from "../abis/compliantErc20";
import { COMPLIANT_ERC20_ADDRESS } from "../config";

export function useTotalValueShielded() {
  const { data, refetch, status } = useReadContract({
    address: COMPLIANT_ERC20_ADDRESS,
    abi: compliantErc20Abi,
    functionName: "getTotalValueShielded",
    query: {
      enabled: Boolean(COMPLIANT_ERC20_ADDRESS),
    },
  });

  return {
    totalValueShielded: data as bigint | undefined,
    refetchTotalValueShielded: refetch,
    tvsStatus: status,
  };
}

