import { ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";

const CREATE2_DEPLOYER_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT_NAMESPACE = process.env.CREATE2_SALT_NAMESPACE || "ciphermint-v1";

function saltFor(label: string): string {
  return ethers.id(`${SALT_NAMESPACE}:${label}`);
}

async function deployCreate2OrReuse<T extends Contract>(
  factory: ContractFactory,
  constructorArgs: readonly unknown[],
  saltLabel: string,
): Promise<{ contract: T; address: string; deployed: boolean }> {
  const deployTx = await factory.getDeployTransaction(...constructorArgs);
  const initCode = deployTx.data;
  if (!initCode || initCode === "0x") {
    throw new Error("Missing initCode for contract factory");
  }

  const salt = saltFor(saltLabel);
  const initCodeHash = ethers.keccak256(initCode);
  const predictedAddress = ethers.getCreate2Address(CREATE2_DEPLOYER_ADDRESS, salt, initCodeHash);
  const existingCode = await ethers.provider.getCode(predictedAddress);
  if (existingCode !== "0x") {
    const contract = factory.attach(predictedAddress) as T;
    return { contract, address: predictedAddress, deployed: false };
  }

  const deployer = (await ethers.getSigners())[0];
  const data = ethers.concat([salt, initCode]);
  const tx = await deployer.sendTransaction({
    to: CREATE2_DEPLOYER_ADDRESS,
    data,
  });
  await tx.wait();

  const codeAfter = await ethers.provider.getCode(predictedAddress);
  if (codeAfter === "0x") {
    throw new Error(`CREATE2 deployment failed for ${saltLabel} at ${predictedAddress}`);
  }

  const contract = factory.attach(predictedAddress) as T;
  return { contract, address: predictedAddress, deployed: true };
}

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 Deploying Ciphermint contracts");
  console.log(`👤 Deployer: ${deployer.address}\n`);
  console.log(`🧂 CREATE2 namespace: ${SALT_NAMESPACE}`);
  console.log(`🏭 CREATE2 deployer: ${CREATE2_DEPLOYER_ADDRESS}\n`);

  // 1) IdentityRegistry
  console.log("📋 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const {
    contract: identityRegistry,
    address: registryAddress,
    deployed: deployedRegistry,
  } = await deployCreate2OrReuse(IdentityRegistry, [deployer.address], "IdentityRegistry");
  console.log(
    `${deployedRegistry ? "✅" : "♻️"} IdentityRegistry: ${registryAddress} (${deployedRegistry ? "deployed" : "reused"})\n`,
  );

  // 2) ComplianceRules
  console.log("📋 Deploying ComplianceRules...");
  const ComplianceRules = await ethers.getContractFactory("ComplianceRules");
  const {
    contract: complianceRules,
    address: complianceAddress,
    deployed: deployedCompliance,
  } = await deployCreate2OrReuse(ComplianceRules, [registryAddress, deployer.address], "ComplianceRules");
  console.log(
    `${deployedCompliance ? "✅" : "♻️"} ComplianceRules: ${complianceAddress} (${deployedCompliance ? "deployed" : "reused"})\n`,
  );

  // 3) CompliantUBI (SBA)
  console.log("📋 Deploying CompliantUBI (SBA)...");
  const CompliantUBI = await ethers.getContractFactory("CompliantUBI");
  const {
    contract: sba,
    address: sbaAddress,
    deployed: deployedSba,
  } = await deployCreate2OrReuse(
    CompliantUBI,
    ["StevensBA UBI", "SBA", complianceAddress, deployer.address],
    "CompliantUBI",
  );
  console.log(
    `${deployedSba ? "✅" : "♻️"} CompliantUBI (SBA): ${sbaAddress} (${deployedSba ? "deployed" : "reused"})\n`,
  );

  // 4) CipherCentralBank
  console.log("📋 Deploying CipherCentralBank...");
  const CipherCentralBank = await ethers.getContractFactory("CipherCentralBank");
  const blocksPerMonth = 216_000; // override per-chain if needed
  const {
    contract: _bank,
    address: bankAddress,
    deployed: deployedBank,
  } = await deployCreate2OrReuse(
    CipherCentralBank,
    [sbaAddress, complianceAddress, blocksPerMonth, deployer.address],
    "CipherCentralBank",
  );
  console.log(
    `${deployedBank ? "✅" : "♻️"} CipherCentralBank: ${bankAddress} (${deployedBank ? "deployed" : "reused"})\n`,
  );

  console.log("🔧 Wiring permissions (mirrors integration tests)...");
  await (
    await complianceRules.setAuthorizedCaller(sbaAddress, true, {
      gasLimit: 800_000,
    })
  ).wait();
  await (
    await complianceRules.setAuthorizedCaller(bankAddress, true, {
      gasLimit: 800_000,
    })
  ).wait();
  console.log("✅ Authorized SBA + bank on ComplianceRules");

  await (
    await identityRegistry.setDefaultAccessGrantee(complianceAddress, {
      gasLimit: 800_000,
    })
  ).wait();
  console.log("✅ Enabled automatic registry access grant for ComplianceRules");

  // Ensure deployer is a registrar (needed to attest identities)
  const isRegistrar = await identityRegistry.registrars(deployer.address);
  if (!isRegistrar) {
    await (
      await identityRegistry.addRegistrar(deployer.address, {
        gasLimit: 800_000,
      })
    ).wait();
    console.log("✅ Added deployer as registrar");
  }

  // Allow CipherCentralBank to mint SBA on payouts
  await (
    await sba.setCentralBankController(deployer.address, {
      gasLimit: 800_000,
    })
  ).wait();
  await (
    await sba.setMinter(bankAddress, true, {
      gasLimit: 800_000,
    })
  ).wait();
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
