/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_IDENTITY_REGISTRY_ADDRESS?: string;
  readonly VITE_COMPLIANT_ERC20_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
