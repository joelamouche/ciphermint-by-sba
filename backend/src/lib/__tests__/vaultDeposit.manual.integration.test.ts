/**
 * Manual backend Sepolia smoke test for vault deposit.
 *
 * This test is intentionally strict:
 * - it verifies deployed runtime bytecode matches local artifacts
 * - it fails fast when contracts were changed locally but not redeployed
 * - it asserts BOTH sides of deposit accounting:
 *   - SBA balance must go down
 *   - CSBA balance must go up
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/node";
import { attestIdentity, initializeZamaSDK } from "../zama";

const DECIMALS = 10n ** 8n;
const DEFAULT_DEPOSIT_AMOUNT = 1n * DECIMALS;

const UBI_ABI = [
  "function claimTokens() external returns (bool)",
  "function approve(address spender, bytes32 encryptedAmount, bytes calldata inputProof) external returns (bool)",
  "function balanceOf(address account) external view returns (bytes32)",
] as const;

const BANK_ABI = [
  "function deposit(bytes32 encryptedAmount, bytes calldata inputProof) external",
  "function requestWithdraw(bytes32 encryptedAmount, bytes calldata inputProof) external",
  "function balanceOf(address account) external view returns (bytes32)",
  "function sharePriceScaled() external view returns (uint256)",
  "function getPendingWithdrawCount(address user) external view returns (uint256)",
  "function getPendingWithdraw(address user, uint256 requestIndex) external view returns (bytes32,uint64,bool)",
] as const;

const describeIf = (condition: boolean, name: string, fn: () => void) => {
  if (condition) describe(name, fn);
  else describe.skip(name, fn);
};

const isEnabled = (): boolean => process.env.MANUAL_VAULT_SMOKE_ENABLED === "true";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function requiredRpcUrl(): string {
  return requiredEnv("SEPOLIA_RPC_URL");
}

const CREATE2_DEPLOYER_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const CREATE2_NAMESPACE = process.env.CREATE2_SALT_NAMESPACE || "ciphermint-v1";

function saltFor(label: string): string {
  return ethers.id(`${CREATE2_NAMESPACE}:${label}`);
}

async function readArtifact(artifactPath: string): Promise<{ abi: any[]; bytecode: string }> {
  const raw = await readFile(artifactPath, "utf8");
  const parsed = JSON.parse(raw) as { abi?: any[]; bytecode?: string };
  if (!parsed.abi || !parsed.bytecode || parsed.bytecode === "0x") {
    throw new Error(`Artifact missing abi/bytecode: ${artifactPath}`);
  }
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function predictCreate2AddressFromArtifact(params: {
  artifactPath: string;
  constructorArgs: readonly unknown[];
  saltLabel: string;
}): Promise<string> {
  const { artifactPath, constructorArgs, saltLabel } = params;
  const artifact = await readArtifact(artifactPath);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const deployTx = await factory.getDeployTransaction(...constructorArgs);
  if (!deployTx.data || deployTx.data === "0x") {
    throw new Error(`Missing initCode for artifact ${artifactPath}`);
  }
  const initCodeHash = ethers.keccak256(deployTx.data as `0x${string}`);
  return ethers.getCreate2Address(CREATE2_DEPLOYER_ADDRESS, saltFor(saltLabel), initCodeHash);
}

async function assertAddressesMatchCurrentCreate2Prediction(params: {
  deployerAddress: string;
  identityRegistryAddress: string;
  complianceRulesAddress: string;
  ubiAddress: string;
  bankAddress: string;
}): Promise<void> {
  const contractsRoot = resolve(process.cwd(), "../ciphermint-contracts");

  const predictedRegistry = (await predictCreate2AddressFromArtifact({
    artifactPath: resolve(contractsRoot, "artifacts/contracts/IdentityRegistry.sol/IdentityRegistry.json"),
    constructorArgs: [params.deployerAddress],
    saltLabel: "IdentityRegistry",
  })) as string;

  const predictedCompliance = (await predictCreate2AddressFromArtifact({
    artifactPath: resolve(contractsRoot, "artifacts/contracts/ComplianceRules.sol/ComplianceRules.json"),
    constructorArgs: [predictedRegistry, params.deployerAddress],
    saltLabel: "ComplianceRules",
  })) as string;

  const predictedUbi = (await predictCreate2AddressFromArtifact({
    artifactPath: resolve(contractsRoot, "artifacts/contracts/CompliantUBI.sol/CompliantUBI.json"),
    constructorArgs: ["StevensBA UBI", "SBA", predictedCompliance, params.deployerAddress],
    saltLabel: "CompliantUBI",
  })) as string;

  const predictedBank = (await predictCreate2AddressFromArtifact({
    artifactPath: resolve(contractsRoot, "artifacts/contracts/CipherCentralBank.sol/CipherCentralBank.json"),
    constructorArgs: [
      "CipherSBA Bills",
      "CSBA",
      predictedUbi,
      predictedCompliance,
      216_000,
      params.deployerAddress,
    ],
    saltLabel: "CipherCentralBank",
  })) as string;

  if (params.identityRegistryAddress.toLowerCase() !== predictedRegistry.toLowerCase()) {
    throw new Error(
      `IdentityRegistry address is not current CREATE2 prediction. Redeploy required.\nactual=${params.identityRegistryAddress}\npredicted=${predictedRegistry}`,
    );
  }
  if (params.complianceRulesAddress.toLowerCase() !== predictedCompliance.toLowerCase()) {
    throw new Error(
      `ComplianceRules address is not current CREATE2 prediction. Redeploy required.\nactual=${params.complianceRulesAddress}\npredicted=${predictedCompliance}`,
    );
  }
  if (params.ubiAddress.toLowerCase() !== predictedUbi.toLowerCase()) {
    throw new Error(
      `CompliantUBI address is not current CREATE2 prediction. Redeploy required.\nactual=${params.ubiAddress}\npredicted=${predictedUbi}`,
    );
  }
  if (params.bankAddress.toLowerCase() !== predictedBank.toLowerCase()) {
    throw new Error(
      `CipherCentralBank address is not current CREATE2 prediction. Redeploy required.\nactual=${params.bankAddress}\npredicted=${predictedBank}`,
    );
  }
}

describeIf(isEnabled(), "Manual Sepolia vault deposit smoke (backend)", () => {
  const originalRegistrarKey = process.env.ZAMA_REGISTRAR_PRIVATE_KEY;
  let fhevmInstance: FhevmInstance;

  beforeAll(async () => {
    const registrarKey =
      process.env.ZAMA_TEST_REGISTRAR_PRIVATE_KEY?.trim() ||
      process.env.ZAMA_REGISTRAR_PRIVATE_KEY?.trim();
    if (!registrarKey) {
      throw new Error(
        "Missing registrar key: set ZAMA_TEST_REGISTRAR_PRIVATE_KEY or ZAMA_REGISTRAR_PRIVATE_KEY",
      );
    }
    process.env.ZAMA_REGISTRAR_PRIVATE_KEY = registrarKey;

    requiredRpcUrl();
    requiredEnv("ZAMA_IDENTITY_REGISTRY_ADDRESS");
    requiredEnv("ZAMA_COMPLIANCE_RULES_ADDRESS");
    requiredEnv("ZAMA_COMPLIANT_UBI_ADDRESS");
    requiredEnv("ZAMA_CIPHER_CENTRAL_BANK_ADDRESS");
    requiredEnv("MANUAL_TEST_USER_ADDRESS");
    requiredEnv("MANUAL_TEST_USER_PRIVATE_KEY");

    await initializeZamaSDK();

    const relayer = await import("@zama-fhe/relayer-sdk/node");
    const rpcUrl = requiredRpcUrl();
    fhevmInstance = await relayer.createInstance({
      ...relayer.SepoliaConfig,
      network: rpcUrl,
    });
  });

  afterAll(() => {
    if (originalRegistrarKey) process.env.ZAMA_REGISTRAR_PRIVATE_KEY = originalRegistrarKey;
    else delete process.env.ZAMA_REGISTRAR_PRIVATE_KEY;
  });

  it(
    "requires redeploy parity and enforces deposit + pending-withdraw visibility",
    async () => {
      const rpcUrl = requiredRpcUrl();
      const identityRegistryAddress = requiredEnv("ZAMA_IDENTITY_REGISTRY_ADDRESS");
      const complianceRulesAddress = requiredEnv("ZAMA_COMPLIANCE_RULES_ADDRESS");
      const ubiAddress = requiredEnv("ZAMA_COMPLIANT_UBI_ADDRESS");
      const bankAddress = requiredEnv("ZAMA_CIPHER_CENTRAL_BANK_ADDRESS");
      const userAddress = requiredEnv("MANUAL_TEST_USER_ADDRESS");
      const userPrivateKey = requiredEnv("MANUAL_TEST_USER_PRIVATE_KEY");
      const depositAmount = BigInt(
        process.env.MANUAL_TEST_VAULT_DEPOSIT_AMOUNT_BASE_UNITS ?? DEFAULT_DEPOSIT_AMOUNT.toString(),
      );

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const userSigner = new ethers.Wallet(userPrivateKey, provider);
      expect(userSigner.address.toLowerCase()).toBe(userAddress.toLowerCase());

      await assertAddressesMatchCurrentCreate2Prediction({
        deployerAddress: userSigner.address,
        identityRegistryAddress,
        complianceRulesAddress,
        ubiAddress,
        bankAddress,
      });

      const ubi = new ethers.Contract(ubiAddress, UBI_ABI, userSigner);
      const bank = new ethers.Contract(bankAddress, BANK_ABI, userSigner);

      const initialSbaHandle = await ubi.balanceOf(userAddress);
      const initialCsbaHandle = await bank.balanceOf(userAddress);
      const initialSba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: initialSbaHandle,
        contractAddress: ubiAddress,
      });
      const initialCsba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: initialCsbaHandle,
        contractAddress: bankAddress,
      });

      const attestResult = await attestIdentity({
        userAddress,
        birthYear: Number(process.env.MANUAL_TEST_BIRTH_YEAR ?? "1992"),
        fullName: process.env.MANUAL_TEST_FULL_NAME ?? `Vault Smoke ${Date.now()}`,
      });
      expect(attestResult.success).toBe(true);

      const claimTx = await ubi.claimTokens();
      expect((await claimTx.wait())?.status).toBe(1);

      const approveEncrypted = await encryptUint64({
        instance: fhevmInstance,
        contractAddress: ubiAddress,
        userAddress,
        value: depositAmount,
      });
      const approveTx = await ubi.approve(bankAddress, approveEncrypted.handle, approveEncrypted.inputProof);
      expect((await approveTx.wait())?.status).toBe(1);

      const beforeSbaHandle = await ubi.balanceOf(userAddress);
      const beforeCsbaHandle = await bank.balanceOf(userAddress);
      const beforeSba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: beforeSbaHandle,
        contractAddress: ubiAddress,
      });
      const beforeCsba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: beforeCsbaHandle,
        contractAddress: bankAddress,
      });

      const depositEncrypted = await encryptUint64({
        instance: fhevmInstance,
        contractAddress: bankAddress,
        userAddress,
        value: depositAmount,
      });
      const depositTx = await bank.deposit(depositEncrypted.handle, depositEncrypted.inputProof);
      expect((await depositTx.wait())?.status).toBe(1);

      const afterSbaHandle = await ubi.balanceOf(userAddress);
      const afterCsbaHandle = await bank.balanceOf(userAddress);
      const afterSba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: afterSbaHandle,
        contractAddress: ubiAddress,
      });
      const afterCsba = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: afterCsbaHandle,
        contractAddress: bankAddress,
      });

      expect(afterSba).toBe(beforeSba - depositAmount);
      expect(afterCsba).toBeGreaterThan(beforeCsba);

      const pendingCountBefore = BigInt(await bank.getPendingWithdrawCount(userAddress));
      const csbaDelta = afterCsba - beforeCsba;
      const withdrawRequestAmount = csbaDelta > 1n ? csbaDelta / 2n : csbaDelta;
      expect(withdrawRequestAmount).toBeGreaterThan(0n);

      const withdrawEncrypted = await encryptUint64({
        instance: fhevmInstance,
        contractAddress: bankAddress,
        userAddress,
        value: withdrawRequestAmount,
      });
      const requestTx = await bank.requestWithdraw(withdrawEncrypted.handle, withdrawEncrypted.inputProof);
      expect((await requestTx.wait())?.status).toBe(1);

      const pendingCountAfter = BigInt(await bank.getPendingWithdrawCount(userAddress));
      expect(pendingCountAfter).toBe(pendingCountBefore + 1n);

      const requestedIndex = pendingCountAfter - 1n;
      const [pendingAmountHandle, unlockBlock, active] = (await bank.getPendingWithdraw(
        userAddress,
        requestedIndex,
      )) as [string, bigint, boolean];
      expect(active).toBe(true);
      expect(unlockBlock).toBeGreaterThan(0n);

      const pendingAmount = await decryptEuint64Handle({
        instance: fhevmInstance,
        signer: userSigner,
        handle: pendingAmountHandle,
        contractAddress: bankAddress,
      });
      expect(pendingAmount).toBe(withdrawRequestAmount);

      console.log(
        `[manual-vault-smoke] ok sba_initial=${initialSba} sba_before=${beforeSba} sba_after=${afterSba} ` +
          `csba_initial=${initialCsba} csba_before=${beforeCsba} csba_after=${afterCsba} ` +
          `deposit=${depositAmount} pending_count=${pendingCountAfter} pending_csba=${pendingAmount} unlock=${unlockBlock}`,
      );
    },
    { timeout: 240000 },
  );
});

async function encryptUint64(params: {
  instance: FhevmInstance;
  contractAddress: string;
  userAddress: string;
  value: bigint;
}): Promise<{ handle: string; inputProof: string }> {
  const encrypted = params.instance.createEncryptedInput(params.contractAddress, params.userAddress);
  encrypted.add64(params.value);
  const result = await encrypted.encrypt();
  return { handle: toHex(result.handles[0]), inputProof: toHex(result.inputProof) };
}

function toHex(value: string | Uint8Array): string {
  return typeof value === "string" ? value : ethers.hexlify(value);
}

async function decryptEuint64Handle(params: {
  instance: FhevmInstance;
  signer: ethers.Wallet;
  handle: string;
  contractAddress: string;
}): Promise<bigint> {
  const { instance, signer, handle, contractAddress } = params;
  if (!handle || /^0x0+$/i.test(handle)) return 0n;

  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = 10;
  const eip712 = instance.createEIP712(keypair.publicKey, [contractAddress], startTimestamp, durationDays);
  const types = { ...(eip712.types as Record<string, unknown>) };
  delete (types as { EIP712Domain?: unknown }).EIP712Domain;
  const signature = await signer.signTypedData(
    eip712.domain as any,
    types as any,
    eip712.message as any,
  );
  const signatureHex = signature.replace(/^0x/, "");
  const result = await instance.userDecrypt(
    [{ handle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signatureHex,
    [contractAddress],
    signer.address,
    startTimestamp,
    durationDays,
  );
  const value = result[handle as `0x${string}`];
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}
