import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import type { CipherCentralBank, ComplianceRules, CompliantUBI, IdentityRegistry } from "../types";

type Addresses = {
  identityRegistry: string;
  complianceRules: string;
  compliantUbi: string;
  cipherCentralBank: string;
};

const DECIMALS = 10n ** 8n;
const DEFAULT_DEPOSIT_SBA = 1n * DECIMALS;

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

async function maybeCompleteMaturedWithdraw(
  bank: CipherCentralBank,
  userAddress: string,
): Promise<{ completedIndex: bigint | null }> {
  const count = await bank.getPendingWithdrawCount(userAddress);
  const currentBlock = BigInt(await ethers.provider.getBlockNumber());

  for (let i = 0n; i < count; i += 1n) {
    const pending = await bank.getPendingWithdraw(userAddress, i);
    const unlockBlock = BigInt(pending[1]);
    const active = pending[2];
    if (active && unlockBlock <= currentBlock) {
      const tx = await bank.completeWithdraw(i);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`completeWithdraw(${i}) failed`);
      }
      return { completedIndex: i };
    }
  }

  return { completedIndex: null };
}

async function main() {
  if (fhevm.isMock) {
    throw new Error("Smoke suite must run on real network (sepolia), not fhevm mock mode.");
  }

  const addresses = parseAddresses();
  const [smokeUser] = await ethers.getSigners();
  const smokeUserAddress = await smokeUser.getAddress();
  const depositAmountSba = BigInt(process.env.SEPOLIA_SMOKE_DEPOSIT_SBA_BASE_UNITS || DEFAULT_DEPOSIT_SBA.toString());

  const identityRegistry = (await ethers.getContractAt(
    "IdentityRegistry",
    addresses.identityRegistry,
  )) as IdentityRegistry;
  const complianceRules = (await ethers.getContractAt(
    "ComplianceRules",
    addresses.complianceRules,
  )) as ComplianceRules;
  const sba = (await ethers.getContractAt("CompliantUBI", addresses.compliantUbi)) as CompliantUBI;
  const bank = (await ethers.getContractAt("CipherCentralBank", addresses.cipherCentralBank)) as CipherCentralBank;

  console.log("🔎 Sepolia smoke started");
  console.log(`👤 Smoke user: ${smokeUserAddress}`);
  console.log(`📍 IdentityRegistry: ${addresses.identityRegistry}`);
  console.log(`📍 ComplianceRules: ${addresses.complianceRules}`);
  console.log(`📍 CompliantUBI: ${addresses.compliantUbi}`);
  console.log(`📍 CipherCentralBank: ${addresses.cipherCentralBank}`);

  const isSbaAuthorized = await complianceRules.authorizedCallers(addresses.compliantUbi);
  const isBankAuthorized = await complianceRules.authorizedCallers(addresses.cipherCentralBank);
  if (!isSbaAuthorized || !isBankAuthorized) {
    throw new Error("ComplianceRules is missing authorized callers for SBA or bank.");
  }
  console.log("✅ ComplianceRules caller wiring is valid");

  const defaultGrantee = await identityRegistry.defaultAccessGrantee();
  if (defaultGrantee.toLowerCase() !== addresses.complianceRules.toLowerCase()) {
    throw new Error("IdentityRegistry defaultAccessGrantee is not ComplianceRules.");
  }
  console.log("✅ IdentityRegistry defaultAccessGrantee wiring is valid");

  const isRegistrar = await identityRegistry.registrars(smokeUserAddress);
  if (!isRegistrar) {
    throw new Error("Smoke user must be registrar to self-attest in this smoke flow.");
  }

  const smokeNameHash = ethers.keccak256(ethers.toUtf8Bytes(`Sepolia Smoke ${Date.now()}`));
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

  const approvalInput = await encryptUint64(addresses.compliantUbi, smokeUser, depositAmountSba);
  const approveTx = await sba.approve(addresses.cipherCentralBank, approvalInput.handles[0], approvalInput.inputProof);
  const approveReceipt = await approveTx.wait();
  if (!approveReceipt || approveReceipt.status !== 1) {
    throw new Error("approve failed");
  }

  const depositInput = await encryptUint64(addresses.cipherCentralBank, smokeUser, depositAmountSba);
  const depositTx = await bank.deposit(depositInput.handles[0], depositInput.inputProof);
  const depositReceipt = await depositTx.wait();
  if (!depositReceipt || depositReceipt.status !== 1) {
    throw new Error("deposit failed");
  }
  console.log("✅ deposit succeeded");

  const withdrawInput = await encryptUint64(addresses.cipherCentralBank, smokeUser, depositAmountSba);
  const requestTx = await bank.requestWithdraw(withdrawInput.handles[0], withdrawInput.inputProof);
  const requestReceipt = await requestTx.wait();
  if (!requestReceipt || requestReceipt.status !== 1) {
    throw new Error("requestWithdraw failed");
  }
  console.log("✅ requestWithdraw succeeded");

  const pendingCount = await bank.getPendingWithdrawCount(smokeUserAddress);
  if (pendingCount === 0n) {
    throw new Error("No pending withdraw entries found after requestWithdraw.");
  }

  const latestPending = await bank.getPendingWithdraw(smokeUserAddress, pendingCount - 1n);
  if (!latestPending[2]) {
    throw new Error("Latest pending withdraw should be active.");
  }
  console.log(`✅ pending withdraw indexed at ${pendingCount - 1n} (unlock block ${latestPending[1].toString()})`);

  const completed = await maybeCompleteMaturedWithdraw(bank, smokeUserAddress);
  if (completed.completedIndex === null) {
    console.log("ℹ️ No matured pending withdraw to complete yet (expected on fresh runs).");
  } else {
    console.log(`✅ completeWithdraw(${completed.completedIndex}) succeeded on matured request`);
  }

  const sbaBalanceHandle = await sba.balanceOf(smokeUserAddress);
  const sbaBalance = await fhevm.userDecryptEuint(FhevmType.euint64, sbaBalanceHandle, addresses.compliantUbi, smokeUser);
  const csbaBalanceHandle = await bank.balanceOf(smokeUserAddress);
  const csbaBalance = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    csbaBalanceHandle,
    addresses.cipherCentralBank,
    smokeUser,
  );

  console.log(`📊 decrypted SBA balance: ${sbaBalance.toString()}`);
  console.log(`📊 decrypted CSBA balance: ${csbaBalance.toString()}`);
  console.log("🎉 Sepolia smoke completed");
}

main().catch((err) => {
  console.error("❌ Sepolia smoke failed");
  console.error(err);
  process.exitCode = 1;
});
