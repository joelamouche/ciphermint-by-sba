import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import type { CipherCentralBank, CompliantUBI, IdentityRegistry } from "../types";

type Addresses = {
  identityRegistry: string;
  complianceRules: string;
  compliantUbi: string;
  cipherCentralBank: string;
};

const DECIMALS = 10n ** 8n;
const DEFAULT_DEPOSIT_SBA = 1n * DECIMALS;
const CREATE2_DEPLOYER_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT_NAMESPACE = process.env.CREATE2_SALT_NAMESPACE || "ciphermint-v1";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function parseAddresses(): Addresses {
  return {
    identityRegistry: requiredEnv("SEPOLIA_IDENTITY_REGISTRY_ADDRESS"),
    complianceRules: requiredEnv("SEPOLIA_COMPLIANCE_RULES_ADDRESS"),
    compliantUbi: requiredEnv("SEPOLIA_COMPLIANT_UBI_ADDRESS"),
    cipherCentralBank: requiredEnv("SEPOLIA_CIPHER_CENTRAL_BANK_ADDRESS"),
  };
}

async function encryptUint64(contractAddress: string, signer: Signer, value: bigint) {
  const signerAddress = await signer.getAddress();
  const encryptedInput = fhevm.createEncryptedInput(contractAddress, signerAddress);
  encryptedInput.add64(value);
  return encryptedInput.encrypt();
}

async function decryptEuintOrZero(
  encryptedValue: unknown,
  contractAddress: string,
  signer: Signer,
): Promise<bigint> {
  if (encryptedValue == null) return 0n;
  try {
    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedValue,
      contractAddress,
      signer,
    );
    return typeof decrypted === "bigint" ? decrypted : BigInt(decrypted ?? 0);
  } catch {
    return 0n;
  }
}

function saltFor(label: string): string {
  return ethers.id(`${SALT_NAMESPACE}:${label}`);
}

async function predictCreate2Address(
  contractName: string,
  constructorArgs: readonly unknown[],
  saltLabel: string,
): Promise<string> {
  const factory = await ethers.getContractFactory(contractName);
  const deployTx = await factory.getDeployTransaction(...constructorArgs);
  const initCode = deployTx.data;
  if (!initCode || initCode === "0x") {
    throw new Error(`Missing initCode for ${contractName}`);
  }
  const initCodeHash = ethers.keccak256(initCode);
  return ethers.getCreate2Address(CREATE2_DEPLOYER_ADDRESS, saltFor(saltLabel), initCodeHash);
}

async function assertAddressesMatchCurrentCreate2Prediction(params: {
  deployerAddress: string;
  actual: Addresses;
}): Promise<void> {
  const { deployerAddress, actual } = params;

  const predictedRegistry = await predictCreate2Address(
    "IdentityRegistry",
    [deployerAddress],
    "IdentityRegistry",
  );
  const predictedCompliance = await predictCreate2Address(
    "ComplianceRules",
    [predictedRegistry, deployerAddress],
    "ComplianceRules",
  );
  const predictedUbi = await predictCreate2Address(
    "CompliantUBI",
    ["StevensBA UBI", "SBA", predictedCompliance, deployerAddress],
    "CompliantUBI",
  );
  const predictedBank = await predictCreate2Address(
    "CipherCentralBank",
    [predictedUbi, predictedCompliance, 216_000, deployerAddress],
    "CipherCentralBank",
  );

  if (actual.identityRegistry.toLowerCase() !== predictedRegistry.toLowerCase()) {
    throw new Error(
      `IdentityRegistry address is not the current CREATE2 prediction. Redeploy required.\n` +
        `actual=${actual.identityRegistry}\npredicted=${predictedRegistry}`,
    );
  }
  if (actual.complianceRules.toLowerCase() !== predictedCompliance.toLowerCase()) {
    throw new Error(
      `ComplianceRules address is not the current CREATE2 prediction. Redeploy required.\n` +
        `actual=${actual.complianceRules}\npredicted=${predictedCompliance}`,
    );
  }
  if (actual.compliantUbi.toLowerCase() !== predictedUbi.toLowerCase()) {
    throw new Error(
      `CompliantUBI address is not the current CREATE2 prediction. Redeploy required.\n` +
        `actual=${actual.compliantUbi}\npredicted=${predictedUbi}`,
    );
  }
  if (actual.cipherCentralBank.toLowerCase() !== predictedBank.toLowerCase()) {
    throw new Error(
      `CipherCentralBank address is not the current CREATE2 prediction. Redeploy required.\n` +
        `actual=${actual.cipherCentralBank}\npredicted=${predictedBank}`,
    );
  }
}

async function main() {
  await fhevm.initializeCLIApi();
  if (fhevm.isMock) {
    throw new Error("This script is intended for real Sepolia, not fhEVM mock mode.");
  }

  const addresses = parseAddresses();
  const depositAmount = BigInt(process.env.SEPOLIA_SMOKE_DEPOSIT_SBA_BASE_UNITS || DEFAULT_DEPOSIT_SBA.toString());
  const [smokeUser] = await ethers.getSigners();
  const smokeUserAddress = await smokeUser.getAddress();

  const identityRegistry = (await ethers.getContractAt(
    "IdentityRegistry",
    addresses.identityRegistry,
  )) as IdentityRegistry;
  const sba = (await ethers.getContractAt("CompliantUBI", addresses.compliantUbi)) as CompliantUBI;
  const bank = (await ethers.getContractAt(
    "CipherCentralBank",
    addresses.cipherCentralBank,
  )) as CipherCentralBank;

  await assertAddressesMatchCurrentCreate2Prediction({
    deployerAddress: smokeUserAddress,
    actual: addresses,
  });

  console.log("🔎 Sepolia vault deposit smoke started");
  console.log(`👤 Smoke user: ${smokeUserAddress}`);
  console.log(`📍 IdentityRegistry: ${addresses.identityRegistry}`);
  console.log(`📍 ComplianceRules: ${addresses.complianceRules}`);
  console.log(`📍 CompliantUBI: ${addresses.compliantUbi}`);
  console.log(`📍 CipherCentralBank: ${addresses.cipherCentralBank}`);
  console.log(`💰 Deposit amount (SBA base units): ${depositAmount.toString()}`);

  const isRegistrar = await identityRegistry.registrars(smokeUserAddress);
  if (!isRegistrar) {
    throw new Error("Smoke user must be registrar to self-attest in this smoke flow.");
  }

  const initialCsbaHandle = await bank.balanceOf(smokeUserAddress);
  const initialCsba = await decryptEuintOrZero(initialCsbaHandle, addresses.cipherCentralBank, smokeUser);
  const initialSbaHandle = await sba.balanceOf(smokeUserAddress);
  const initialSba = await decryptEuintOrZero(initialSbaHandle, addresses.compliantUbi, smokeUser);
  console.log(`📊 SBA initial: ${initialSba.toString()}`);
  console.log(`📊 CSBA initial: ${initialCsba.toString()}`);

  const smokeNameHash = ethers.keccak256(ethers.toUtf8Bytes(`Vault Deposit Smoke ${Date.now()}`));
  const attestationInput = fhevm.createEncryptedInput(addresses.identityRegistry, smokeUserAddress);
  attestationInput.add8(90);
  const encryptedBirthYear = await attestationInput.encrypt();

  const attestTx = await identityRegistry.attestIdentity(
    smokeUserAddress,
    encryptedBirthYear.handles[0],
    smokeNameHash,
    encryptedBirthYear.inputProof,
  );
  const attestReceipt = await attestTx.wait();
  if (!attestReceipt || attestReceipt.status !== 1) {
    throw new Error("attestIdentity failed");
  }
  console.log("✅ attestIdentity succeeded");

  const claimTx = await sba.claimTokens();
  const claimReceipt = await claimTx.wait();
  if (!claimReceipt || claimReceipt.status !== 1) {
    throw new Error("claimTokens failed");
  }
  console.log("✅ claimTokens succeeded");

  const approvalInput = await encryptUint64(addresses.compliantUbi, smokeUser, depositAmount);
  const approveTx = await sba.approve(addresses.cipherCentralBank, approvalInput.handles[0], approvalInput.inputProof);
  const approveReceipt = await approveTx.wait();
  if (!approveReceipt || approveReceipt.status !== 1) {
    throw new Error("approve failed");
  }
  console.log("✅ approve succeeded");

  const beforeCsbaHandle = await bank.balanceOf(smokeUserAddress);
  const beforeCsba = await decryptEuintOrZero(beforeCsbaHandle, addresses.cipherCentralBank, smokeUser);
  const beforeSbaHandle = await sba.balanceOf(smokeUserAddress);
  const beforeSba = await decryptEuintOrZero(beforeSbaHandle, addresses.compliantUbi, smokeUser);
  console.log(`📊 SBA pre-deposit: ${beforeSba.toString()}`);
  console.log(`📊 CSBA pre-deposit: ${beforeCsba.toString()}`);

  const depositInput = await encryptUint64(addresses.cipherCentralBank, smokeUser, depositAmount);
  const depositTx = await bank.deposit(depositInput.handles[0], depositInput.inputProof);
  const depositReceipt = await depositTx.wait();
  if (!depositReceipt || depositReceipt.status !== 1) {
    throw new Error("deposit failed");
  }
  console.log("✅ deposit succeeded");

  const afterCsbaHandle = await bank.balanceOf(smokeUserAddress);
  const afterCsba = await decryptEuintOrZero(afterCsbaHandle, addresses.cipherCentralBank, smokeUser);
  const afterSbaHandle = await sba.balanceOf(smokeUserAddress);
  const afterSba = await decryptEuintOrZero(afterSbaHandle, addresses.compliantUbi, smokeUser);
  console.log(`📊 SBA after deposit: ${afterSba.toString()}`);
  console.log(`📊 CSBA after deposit: ${afterCsba.toString()}`);

  if (afterCsba <= beforeCsba) {
    throw new Error(`Expected CSBA balance to increase, before=${beforeCsba}, after=${afterCsba}`);
  }
  if (afterSba >= beforeSba) {
    throw new Error(`Expected SBA balance to decrease, before=${beforeSba}, after=${afterSba}`);
  }

  console.log(
    `🎉 Vault deposit smoke passed (delta SBA=${(afterSba - beforeSba).toString()}, delta CSBA=${(afterCsba - beforeCsba).toString()})`,
  );
}

main().catch((err) => {
  console.error("❌ Sepolia vault deposit smoke failed");
  console.error(err);
  process.exitCode = 1;
});
