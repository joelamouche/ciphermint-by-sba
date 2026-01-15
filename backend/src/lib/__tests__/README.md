# Testing Guide

We use **Vitest** for testing, which handles ES modules natively and works seamlessly with TypeScript.

## Installation

After installing dependencies, Vitest will be available:

```bash
npm install
```

## Unit Tests

Unit tests use mocks and don't require any external services or environment variables.

```bash
npm test
```

## Integration Tests

Integration tests make real blockchain calls and require:

1. **Environment Variables** (in `.env`):
   ```env
   INTEGRATION_TESTS_ENABLED=true
   ZAMA_IDENTITY_REGISTRY_ADDRESS=0x... # Deployed IdentityRegistry contract
   ZAMA_REGISTRAR_PRIVATE_KEY=0x...      # Private key of registrar/deployer
   ZAMA_RPC_URL=https://rpc.sepolia.org # Optional, defaults to Sepolia
   TEST_USER_ADDRESS=0x...               # Optional, defaults to 0x0000...0001
   ```

2. **Network Requirements**:
   - The contract must be deployed on the network specified by `ZAMA_RPC_URL`
   - The registrar private key must have permissions to call `attestIdentity`
   - The registrar account must have test funds for gas fees

3. **Run Integration Tests**:
   ```bash
   npm run test:integration
   ```

## Test Structure

- **`zama.integration.test.ts`**: Integration tests with real network calls (slower, requires setup)

## Notes

- Integration tests are **skipped by default** unless `INTEGRATION_TESTS_ENABLED=true`
- Integration tests make **real transactions** on the specified network
- Make sure you're using a **test network** (Sepolia, local, etc.) and have test funds
- Integration tests have longer timeouts (30-120 seconds) to account for blockchain delays
- Vitest automatically loads `.env` files, so your environment variables will be available