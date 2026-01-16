# Frontend Specs

## Overview

The frontend is a React + TypeScript app that:
- Connects to MetaMask via RainbowKit.
- Authenticates with the backend via SIWE (no JWT).
- Runs the Phase 1 user flow described in the root README.
- Interacts with Zama FHEVM contracts (IdentityRegistry + CompliantERC20).

## Tech Stack

- React + TypeScript
- RainbowKit + wagmi (wallet connection)
- FHEVM relayer web module for contract interaction
- Ethers (contract calls) or viem (if preferred; pick one)
- React Query (recommended for data fetching/caching)

## Wallet & Auth

- Use RainbowKit to connect MetaMask.
- SIWE flow:
  - Request nonce from backend.
  - Sign SIWE message with wallet.
  - Send signature to backend for SIWE verification.

## User Flow (Phase 1)

This follows the root README section "Identity & Mint Logic — Phase 1".

1. Wallet login
   - Connect wallet.
   - Call IdentityRegistry for `isAttested` and CompliantERC20 for `hasClaimedMint`.

2. Name exists
   - If `isAttested` and not claimed: show "Claim 100 tokens".
   - If `isAttested` and claimed: show "Already claimed".

3. No associated name
   - Display Didit KYC link; user completes flow in another tab.
   - Backend receives webhook and writes identity to IdentityRegistry.
   - Frontend checks `isAttested` on-chain until identity is available.

4. Write to IdentityRegistry (backend)
   - Backend submits the write.
   - Frontend shows confirmation and refreshes status.

5. Mint
   - Frontend calls CompliantERC20 `claimTokens()` when eligible.
   - Contract validates compliance via IdentityRegistry.

6. Transfers
   - Transfers only succeed when the recipient is verified.
   - Failures are silent due to the confidential flow.

## Backend Integration (Expected)

See `backend/README.md` for API endpoints and SIWE flow details.

## Contract Integration

- IdentityRegistry
  - `isAttested(address)`
  - `hasClaimedMint(address)` (or equivalent)
- CompliantERC20
  - `claimTokens()`
  - `hasClaimedMint(address)`
  - `transfer(address, externalEuint64, bytes)` (encrypted amount + proof)

Use the generated contract types from `ciphermint-contracts/types`.

## UI Pages / Components

- `WalletGate`: handles connect + auth.
- `Dashboard`:
  - Identity status
  - Mint status
  - Mint action
  - Transfer form
- `KycPanel`:
  - Trigger Didit flow
  - Status updates
- `ErrorBanner`: standard error display.

## State & Data Fetching

- Keep `address`, `identityStatus`, and `mintStatus` in global state.
- Cache contract reads with React Query or wagmi hooks.
- Poll `isAttested` on-chain while KYC is pending.

## Error States

- Rejected wallet signature.
- Backend SIWE verification failure.
