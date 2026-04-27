# CipherMint Smart Contracts

Smart contracts for CipherMint, a confidential compliant token system built on Zama fhEVM. The package now includes the base compliant token (`CompliantERC20`), the UBI/policy token (`CompliantUBI`), and the central-bank-style vault share token (`CipherCentralBank`) in addition to identity/compliance registry components.

## Quick Start

This is part of the CipherMint monorepo. For the full project overview, see the [main README](../../README.md).

For FHEVM development details, see:
[FHEVM Hardhat Quick Start Tutorial](https://docs.zama.ai/protocol/solidity-guides/getting-started/quick-start-tutorial)

### Prerequisites

- **Node.js**: Version 20 or higher
- **npm or yarn/pnpm**: Package manager

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env and set MNEMONIC, INFURA_API_KEY, ETHERSCAN_API_KEY (optional)
   ```

3. **Compile and test**

   ```bash
   npm run compile
   npm run test
   ```

4. **Deploy to local network**

   ```bash
   # Start a local FHEVM-ready node
   npx hardhat node
   # Deploy to local network
   npx hardhat deploy --network localhost
   ```

5. **Deploy to Sepolia Testnet**

   ```bash
   # Deploy full suite (deploy.ts only)
   npm run deploy:sepolia
   # Verify contract on Etherscan
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

   To deploy only the IdentityRegistry:

   ```bash
   npx hardhat deploy --network sepolia --tags IdentityRegistry
   ```

6. **Run Sepolia smoke suite (ACL regression guard)**

   ```bash
   export SEPOLIA_IDENTITY_REGISTRY_ADDRESS=0x...
   export SEPOLIA_COMPLIANCE_RULES_ADDRESS=0x...
   export SEPOLIA_COMPLIANT_UBI_ADDRESS=0x...
   export SEPOLIA_CIPHER_CENTRAL_BANK_ADDRESS=0x...
   # optional: defaults to 1 SBA (1e8 base units)
   export SEPOLIA_SMOKE_DEPOSIT_SBA_BASE_UNITS=100000000

   npm run smoke:sepolia
   ```

   The smoke runner validates live Sepolia behavior for the ACL-sensitive path:
   - wiring checks (`authorizedCallers`, `defaultAccessGrantee`)
   - `attestIdentity`
   - `claimTokens`
   - `deposit`
   - `requestWithdraw`
   - optional `completeWithdraw` on any already-matured pending request

### Sepolia Deployments

- `IdentityRegistry`: `0x7012F9F2c76355e904f34D23cb887c4D279efde8`
- `ComplianceRules`: `0x00893FFc8696Ff6E1bD2C02aab30C53ab80AE79d`
- `CompliantUBI (SBA)`: `0x39e170f640A4aa0fEC501d425661e24Ff2dFaE20`
- `CipherCentralBank (CSBA)`: `0xb4EA516F2D44f5ee494fDc6Bc15A5183872e361B`

Frontend env (Sepolia):
- `VITE_COMPLIANCE_RULES_ADDRESS=0x00893FFc8696Ff6E1bD2C02aab30C53ab80AE79d`
- `VITE_COMPLIANT_UBI_ADDRESS=0x39e170f640A4aa0fEC501d425661e24Ff2dFaE20`
- `VITE_CIPHER_CENTRAL_BANK_ADDRESS=0xb4EA516F2D44f5ee494fDc6Bc15A5183872e361B`

7. **Test on Sepolia Testnet**

   ```bash
   # Once deployed, you can run a simple test on Sepolia.
   npx hardhat test --network sepolia
   ```

## Contract Highlights

- `CompliantERC20`: encrypted balances/supply, branch-free compliance-gated transfers, encrypted allowances, and two-step ownership via `Ownable2Step`.
- `CompliantUBI`: one-time claim (`100 SBA`), per-block linear UBI accrual (`10 SBA/month` target), and policy mint/burn controller flows with `centralBankController` inventory support.
- `CipherCentralBank` (`CSBA`): deposit SBA for CSBA shares at a compounded share price, configurable monthly rate (`monthlyRateBps`), and two-step withdrawal with a one-month block lock before SBA payout.

## 📁 Project Structure

```
ciphermint-contracts/
├── contracts/           # Smart contract source files
│   ├── IdentityRegistry.sol   # Identity verification registry
│   ├── ComplianceRules.sol    # Compliance checking rules engine
│   ├── CompliantERC20.sol     # Base encrypted/compliant token primitive
│   ├── CompliantUBI.sol       # SBA token with UBI + policy controls
│   └── CipherCentralBank.sol  # CSBA vault-share token over SBA
├── deploy/              # Deployment scripts
├── test/                # Test files
│   ├── IdentityRegistry.ts    # IdentityRegistry unit tests
│   └── FullCompliantTokenIntegration.ts  # Full integration tests
├── hardhat.config.ts    # Hardhat configuration
└── package.json         # Dependencies and scripts
```

## 📜 Available Scripts

| Script             | Description              |
| ------------------ | ------------------------ |
| `npm run compile`  | Compile all contracts    |
| `npm run test`     | Run all tests            |
| `npm run smoke:sepolia` | Run live Sepolia ACL smoke flow |
| `npm run coverage` | Generate coverage report |
| `npm run lint`     | Run linting checks       |
| `npm run clean`    | Clean build artifacts    |

## Refactor Regression Guard

Use this checklist after any FHE refactor that changes encrypted-handle flow, ACL ownership, or cross-contract calls:

- Initialize every newly introduced encrypted state slot before first arithmetic/read path.
- Apply `FHE.allowThis(...)` on intermediate encrypted handles used later in the same contract.
- Apply explicit ACL grants (`FHE.allow(...)`) for every cross-contract consumer of encrypted handles.
- For constructor-created encrypted handles, verify initial ACL ownership and intended readers.
- Keep deployment wiring aligned with tests (`authorizedCallers`, `defaultAccessGrantee`, registrars, minters/controllers).
- Run `npm run smoke:sepolia` before frontend/backend deploy and treat failures as release blockers.

## 📚 Documentation

- [CipherMint Project Overview](../../README.md) - Full project specification and architecture
- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [FHEVM Hardhat Setup Guide](https://docs.zama.ai/protocol/solidity-guides/getting-started/setup)
- [FHEVM Testing Guide](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/write_test)
- [FHEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)

## 📄 License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](../../LICENSE) file for details.

## 🆘 Support

- **Project Repository**: [CipherMint by SBA](https://github.com/stevens-blockchain-advisory/ciphermint-by-sba)
- **FHEVM Documentation**: [FHEVM Docs](https://docs.zama.ai)
- **Zama Community**: [Zama Discord](https://discord.gg/zama)

---

**Built by Stevens Blockchain Advisory**
