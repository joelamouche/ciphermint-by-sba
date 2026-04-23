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

### Sepolia Deployments

- `IdentityRegistry`: `0x776CAFDe491cD1F5f23278B479F49DbE81c9631D`
- `ComplianceRules`: `0xbB596231fBe70dC6e5e373Cea835a274A08E582E`
- `CompliantERC20`: `0xC23Af555664244ce049Ec9846DCD7fe7bB8abc1a`

Frontend env (Sepolia):
- `VITE_COMPLIANT_ERC20_ADDRESS=0xC23Af555664244ce049Ec9846DCD7fe7bB8abc1a`

6. **Test on Sepolia Testnet**

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
| `npm run coverage` | Generate coverage report |
| `npm run lint`     | Run linting checks       |
| `npm run clean`    | Clean build artifacts    |

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
