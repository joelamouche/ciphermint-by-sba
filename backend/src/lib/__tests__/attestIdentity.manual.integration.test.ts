/**
 * Manual smoke test for attestIdentity against a live network.
 *
 * Usage:
 *   MANUAL_ATTEST_ENABLED=true \
 *   ZAMA_IDENTITY_REGISTRY_ADDRESS=0x... \
 *   ZAMA_RPC_URL=https://sepolia.infura.io/v3/... \
 *   ZAMA_TEST_REGISTRAR_PRIVATE_KEY=0x... \
 *   MANUAL_TEST_USER_ADDRESS=0x... \
 *   MANUAL_TEST_FULL_NAME="Your Unique Name $(date +%s)" \
 *   MANUAL_TEST_BIRTH_YEAR=1992 \
 *   npm run test:attest:manual
 *
 * Notes:
 * - This test performs a real on-chain transaction.
 * - Use a dedicated test registrar key with registrar permissions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { attestIdentity, initializeZamaSDK } from "../zama";

const isManualEnabled = (): boolean =>
  process.env.MANUAL_ATTEST_ENABLED === "true";

const describeIf = (condition: boolean, name: string, fn: () => void) => {
  if (condition) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

describeIf(isManualEnabled(), "Manual attestIdentity smoke test", () => {
  const originalRegistrarKey = process.env.ZAMA_REGISTRAR_PRIVATE_KEY;
  const overrideRegistrarKey = process.env.ZAMA_TEST_REGISTRAR_PRIVATE_KEY;

  const userAddress =
    process.env.MANUAL_TEST_USER_ADDRESS ??
    "0x0000000000000000000000000000000000000001";
  const fullName =
    process.env.MANUAL_TEST_FULL_NAME ?? `Manual Test User ${Date.now()}`;
  const birthYear = Number(process.env.MANUAL_TEST_BIRTH_YEAR ?? "1992");

  beforeAll(async () => {
    if (overrideRegistrarKey) {
      process.env.ZAMA_REGISTRAR_PRIVATE_KEY = overrideRegistrarKey;
    }

    const missing: string[] = [];
    if (!process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS) {
      missing.push("ZAMA_IDENTITY_REGISTRY_ADDRESS");
    }
    if (!process.env.ZAMA_REGISTRAR_PRIVATE_KEY) {
      missing.push("ZAMA_REGISTRAR_PRIVATE_KEY or ZAMA_TEST_REGISTRAR_PRIVATE_KEY");
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required env vars for manual attest test: ${missing.join(", ")}`
      );
    }

    await initializeZamaSDK();
  });

  afterAll(() => {
    if (originalRegistrarKey) {
      process.env.ZAMA_REGISTRAR_PRIVATE_KEY = originalRegistrarKey;
    } else {
      delete process.env.ZAMA_REGISTRAR_PRIVATE_KEY;
    }
  });

  it(
    "attests identity with live values",
    async () => {
      const result = await attestIdentity({
        userAddress,
        birthYear,
        fullName,
      });

      expect(result.success).toBe(true);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      console.log(
        `[manual-attest] success tx=${result.transactionHash} user=${userAddress}`
      );
    },
    { timeout: 180000 }
  );
});

