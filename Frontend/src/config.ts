export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const IDENTITY_REGISTRY_ADDRESS =
  (import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS as
    | `0x${string}`
    | undefined) ?? undefined;
export const COMPLIANT_UBI_ADDRESS =
  (import.meta.env.VITE_COMPLIANT_UBI_ADDRESS as `0x${string}` | undefined) ??
  (import.meta.env.VITE_COMPLIANT_ERC20_ADDRESS as `0x${string}` | undefined) ??
  undefined;
// Backward-compatible alias used across existing hooks/components.
export const COMPLIANT_ERC20_ADDRESS = COMPLIANT_UBI_ADDRESS;
export const CIPHER_CENTRAL_BANK_ADDRESS =
  (import.meta.env.VITE_CIPHER_CENTRAL_BANK_ADDRESS as
    | `0x${string}`
    | undefined) ?? undefined;
