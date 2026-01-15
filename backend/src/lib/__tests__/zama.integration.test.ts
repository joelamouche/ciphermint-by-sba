/**
 * Integration tests for Zama FHEVM integration
 *
 * These tests use real environment variables and make actual blockchain calls.
 * They are skipped if required environment variables are not set.
 *
 * To run these tests:
 * 1. Set up your .env file with:
 *    - INTEGRATION_TESTS_ENABLED=true
 *    - ZAMA_IDENTITY_REGISTRY_ADDRESS (deployed contract address)
 *    - ZAMA_REGISTRAR_PRIVATE_KEY (private key of registrar/deployer)
 *    - ZAMA_RPC_URL (optional, defaults to Sepolia)
 *
 * 2. Run: npm run test:integration
 *
 * Note: These tests will make real transactions on the network specified by ZAMA_RPC_URL.
 * Make sure you're using a test network and have test funds available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import {
  attestIdentity,
  hashName,
  calculateBirthYearOffset,
  isUserAttested,
  isRegistrar,
  initializeZamaSDK,
} from "../zama";

// Check if integration test environment is configured
const isIntegrationTestEnabled = (): boolean => {
  return !!(
    process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS &&
    process.env.ZAMA_REGISTRAR_PRIVATE_KEY &&
    process.env.INTEGRATION_TESTS_ENABLED === "true"
  );
};

// Vitest's describe.skip works differently - we'll use conditional execution
const describeIf = (condition: boolean, name: string, fn: () => void) => {
  if (condition) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

describeIf(
  isIntegrationTestEnabled(),
  "Zama Integration - Real Network Tests",
  () => {
    const testUserAddress =
      process.env.TEST_USER_ADDRESS ||
      "0x0000000000000000000000000000000000000001";
    const testBirthYear = 1990;
    const testFullName = "Integration Test User";

    beforeAll(() => {
      if (!isIntegrationTestEnabled()) {
        const missing = [];
        if (!process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS) {
          missing.push("ZAMA_IDENTITY_REGISTRY_ADDRESS");
        }
        if (!process.env.ZAMA_REGISTRAR_PRIVATE_KEY) {
          missing.push("ZAMA_REGISTRAR_PRIVATE_KEY");
        }
        if (process.env.INTEGRATION_TESTS_ENABLED !== "true") {
          missing.push("INTEGRATION_TESTS_ENABLED=true");
        }

        console.warn(
          "\n⚠️  Integration tests are disabled.\n" +
            `Missing environment variables: ${missing.join(", ")}\n` +
            "To enable them, set in your .env:\n" +
            "  INTEGRATION_TESTS_ENABLED=true\n" +
            "  ZAMA_IDENTITY_REGISTRY_ADDRESS=0x...\n" +
            "  ZAMA_REGISTRAR_PRIVATE_KEY=0x...\n" +
            "  ZAMA_RPC_URL=https://rpc.sepolia.org (optional)\n" +
            "  TEST_USER_ADDRESS=0x... (optional, defaults to 0x0000...0001)\n"
        );
      } else {
        console.log(
          "\n✅ Integration tests enabled. Environment variables configured."
        );
      }
    });

    describe("Helper Functions - Real Implementation", () => {
      it("should hash a name correctly", () => {
        const name = "John Doe";
        const hash = hashName(name);

        expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(hash.length).toBe(66); // 0x + 64 hex chars
      });

      it("should calculate birth year offset correctly", () => {
        expect(calculateBirthYearOffset(1990)).toBe(90);
        expect(calculateBirthYearOffset(2000)).toBe(100);
        expect(calculateBirthYearOffset(2024)).toBe(124);
      });

      it("should throw for invalid birth years", () => {
        expect(() => calculateBirthYearOffset(1899)).toThrow(
          "Invalid birth year"
        );
        expect(() =>
          calculateBirthYearOffset(new Date().getFullYear() + 1)
        ).toThrow("Invalid birth year");
      });
    });

    describe("SDK Initialization", () => {
      it(
        "should initialize Zama SDK with real config",
        async () => {
          // Should not throw
          await expect(initializeZamaSDK()).resolves.not.toThrow();
        },
        { timeout: 30000 }
      ); // 30 second timeout for SDK initialization
    });

    describe("Contract Interaction - Real Network", () => {
      it(
        "should check if signer is authorized as registrar",
        async () => {
          const registrarPrivateKey = process.env.ZAMA_REGISTRAR_PRIVATE_KEY;
          if (!registrarPrivateKey) {
            throw new Error("ZAMA_REGISTRAR_PRIVATE_KEY not configured");
          }

          const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const signer = new ethers.Wallet(registrarPrivateKey, provider);
          const signerAddress = signer.address;

          const result = await isRegistrar(signerAddress);

          expect(result).toBe(true);
          console.log(`✅ Signer ${signerAddress} is authorized as registrar`);
        },
        { timeout: 30000 }
      );

      it(
        "should check if user is attested (read-only)",
        async () => {
          const result = await isUserAttested(testUserAddress);

          expect(typeof result).toBe("boolean");
        },
        { timeout: 30000 }
      );

      it(
        "should attest identity on real network",
        async () => {
          // Use a unique name to avoid conflicts
          const uniqueName = `${testFullName} ${Date.now()}`;
          const params = {
            userAddress: testUserAddress,
            birthYear: testBirthYear,
            fullName: uniqueName,
          };

          const result = await attestIdentity(params);

          expect(result.success).toBe(true);
          expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
          expect(result.error).toBeUndefined();

          console.log(`✅ Identity attested successfully!`);
          console.log(`   Transaction: ${result.transactionHash}`);
          console.log(`   User: ${testUserAddress}`);
          console.log(`   Name: ${uniqueName}`);
        },
        { timeout: 60000 }
      ); // 60 second timeout for blockchain transaction

      it(
        "should fail with duplicate name if name already exists",
        async () => {
          // First, attest with a name
          const uniqueName = `Duplicate Test ${Date.now()}`;
          const firstResult = await attestIdentity({
            userAddress: testUserAddress,
            birthYear: testBirthYear,
            fullName: uniqueName,
          });

          expect(firstResult.success).toBe(true);

          // Try to attest again with the same name but different user
          // This should fail due to duplicate name check in contract
          const differentUser = "0x0000000000000000000000000000000000000002";
          const duplicateResult = await attestIdentity({
            userAddress: differentUser,
            birthYear: testBirthYear,
            fullName: uniqueName, // Same name
          });

          // The contract should reject this, so we expect failure
          // Note: The contract will revert, so this should fail
          expect(duplicateResult.success).toBe(false);
          expect(duplicateResult.error).toBeDefined();
        },
        { timeout: 120000 }
      ); // 2 minute timeout for two transactions
    });

    describe("Error Handling - Real Network", () => {
      it("should handle invalid user address", async () => {
        const params = {
          userAddress: "invalid-address",
          birthYear: testBirthYear,
          fullName: testFullName,
        };

        const result = await attestIdentity(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid user address");
      });

      it("should handle missing environment variables gracefully", async () => {
        // Temporarily remove env vars
        const originalAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
        const originalKey = process.env.ZAMA_REGISTRAR_PRIVATE_KEY;

        delete process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;

        const result = await attestIdentity({
          userAddress: testUserAddress,
          birthYear: testBirthYear,
          fullName: testFullName,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain(
          "ZAMA_IDENTITY_REGISTRY_ADDRESS not configured"
        );

        // Restore env vars
        if (originalAddress)
          process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS = originalAddress;
        if (originalKey) process.env.ZAMA_REGISTRAR_PRIVATE_KEY = originalKey;
      });
    });

    describe("Name Hashing - Consistency", () => {
      it("should produce consistent hashes for the same name", () => {
        const name = "John Doe";
        const hash1 = hashName(name);
        const hash2 = hashName(name);

        expect(hash1).toBe(hash2);
      });

      it("should produce different hashes for different names", () => {
        const hash1 = hashName("John Doe");
        const hash2 = hashName("Jane Smith");

        expect(hash1).not.toBe(hash2);
      });

      it("should handle names with special characters", () => {
        const name = "José Müller";
        const hash = hashName(name);

        expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      });

      it("should trim whitespace before hashing", () => {
        const hash1 = hashName("  John Doe  ");
        const hash2 = hashName("John Doe");

        expect(hash1).toBe(hash2);
      });
    });
  }
);
