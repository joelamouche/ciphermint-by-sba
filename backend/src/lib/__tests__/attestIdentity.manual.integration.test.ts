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
import { ethers } from "ethers";
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
  const rpcUrl = process.env.ZAMA_RPC_URL ?? "https://rpc.sepolia.org";

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

  it(
    "manually claims UBI tokens with test user wallet",
    async () => {
      if (process.env.MANUAL_CLAIM_ENABLED !== "true") {
        console.log("[manual-claim] skipped (set MANUAL_CLAIM_ENABLED=true)");
        return;
      }

      const ubiAddress = process.env.ZAMA_COMPLIANT_UBI_ADDRESS;
      const userPrivateKey = process.env.MANUAL_TEST_USER_PRIVATE_KEY;
      if (!ubiAddress || !userPrivateKey) {
        throw new Error(
          "Missing env vars for manual claim test: ZAMA_COMPLIANT_UBI_ADDRESS, MANUAL_TEST_USER_PRIVATE_KEY"
        );
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const userSigner = new ethers.Wallet(userPrivateKey, provider);
      if (userSigner.address.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(
          `MANUAL_TEST_USER_ADDRESS (${userAddress}) does not match private key address (${userSigner.address})`
        );
      }

      const ubiContract = new ethers.Contract(
        ubiAddress,
        ["function claimTokens() external returns (bool)"],
        userSigner
      );

      const tx = await ubiContract.claimTokens();
      expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);

      console.log(
        `[manual-claim] success tx=${tx.hash} user=${userSigner.address} contract=${ubiAddress}`
      );
    },
    { timeout: 180000 }
  );
});

