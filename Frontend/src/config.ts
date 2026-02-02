export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const IDENTITY_REGISTRY_ADDRESS =
  (import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS as
    | `0x${string}`
    | undefined) ?? undefined;
export const COMPLIANT_ERC20_ADDRESS =
  (import.meta.env.VITE_COMPLIANT_ERC20_ADDRESS as `0x${string}` | undefined) ??
  undefined;
