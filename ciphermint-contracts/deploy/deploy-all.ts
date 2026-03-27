import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 Deploying Ciphermint contracts");
  console.log(`👤 Deployer: ${deployer.address}\n`);

  // 1) IdentityRegistry
  console.log("📋 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  const registryAddress = await identityRegistry.getAddress();
  console.log(`✅ IdentityRegistry: ${registryAddress}\n`);

  // 2) ComplianceRules
  console.log("📋 Deploying ComplianceRules...");
  const ComplianceRules = await ethers.getContractFactory("ComplianceRules");
  const complianceRules = await ComplianceRules.deploy(registryAddress);
  await complianceRules.waitForDeployment();
  const complianceAddress = await complianceRules.getAddress();
  console.log(`✅ ComplianceRules: ${complianceAddress}\n`);

  // 3) CompliantUBI (SBA)
  console.log("📋 Deploying CompliantUBI (SBA)...");
  const CompliantUBI = await ethers.getContractFactory("CompliantUBI");
  const sba = await CompliantUBI.deploy("StevensBA UBI", "SBA", complianceAddress);
  await sba.waitForDeployment();
  const sbaAddress = await sba.getAddress();
  console.log(`✅ CompliantUBI (SBA): ${sbaAddress}\n`);

  // 4) CipherCentralBank
  console.log("📋 Deploying CipherCentralBank...");
  const CipherCentralBank = await ethers.getContractFactory("CipherCentralBank");
  const blocksPerMonth = 216_000; // override per-chain if needed
  const bank = await CipherCentralBank.deploy(sbaAddress, complianceAddress, blocksPerMonth);
  await bank.waitForDeployment();
  const bankAddress = await bank.getAddress();
  console.log(`✅ CipherCentralBank: ${bankAddress}\n`);

  console.log("🔧 Wiring permissions (mirrors integration tests)...");
  await (await complianceRules.setAuthorizedCaller(sbaAddress, true)).wait();
  await (await complianceRules.setAuthorizedCaller(bankAddress, true)).wait();
  console.log("✅ Authorized SBA + bank on ComplianceRules");

  // Ensure deployer is a registrar (needed to attest identities)
  const isRegistrar = await identityRegistry.registrars(deployer.address);
  if (!isRegistrar) {
    await (await identityRegistry.addRegistrar(deployer.address)).wait();
    console.log("✅ Added deployer as registrar");
  }

  // Allow CipherCentralBank to mint SBA on payouts
  await (await sba.setCentralBankController(deployer.address)).wait();
  await (await sba.setMinter(bankAddress, true)).wait();
  console.log("✅ Set central bank controller + bank as minter\n");

  console.log("✅ Deployment complete");
  console.log("📄 Contracts");
  console.log(`- IdentityRegistry:   ${registryAddress}`);
  console.log(`- ComplianceRules:    ${complianceAddress}`);
  console.log(`- CompliantUBI (SBA): ${sbaAddress}`);
  console.log(`- CipherCentralBank:  ${bankAddress}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
