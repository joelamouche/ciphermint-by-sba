import { useReadContract } from "wagmi";
import { identityRegistryAbi } from "../abis/identityRegistry";
import { IDENTITY_REGISTRY_ADDRESS } from "../config";

interface UseIdentityStatusParams {
  address?: `0x${string}`;
}

export function useIdentityStatus({ address }: UseIdentityStatusParams) {
  const { data, refetch } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "isAttested",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && IDENTITY_REGISTRY_ADDRESS),
    },
  });

  return { isAttested: data, refetchAttested: refetch };
}
