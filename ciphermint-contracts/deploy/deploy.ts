import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;

  console.log("\n🚀 Deploying Ciphermint Contracts...");
  console.log(`📍 Network: ${hre.network.name}`);
  console.log(`👤 Deployer: ${deployer}\n`);

  // 1. Deploy IdentityRegistry
  console.log("📋 Deploying IdentityRegistry...");
  const identityRegistry = await deploy("IdentityRegistry", {
    from: deployer,
    args: [],
    log: true,
  });
  const registryAddress = identityRegistry.address;
  console.log(`✅ IdentityRegistry deployed at: ${registryAddress}\n`);

  // 2. Deploy ComplianceRules
  console.log("📋 Deploying ComplianceRules...");
  const complianceRules = await deploy("ComplianceRules", {
    from: deployer,
    args: [registryAddress],
    log: true,
  });
  const complianceAddress = complianceRules.address;
  console.log(`✅ ComplianceRules deployed at: ${complianceAddress}\n`);

  // 3. Deploy CompliantERC20 (SetvensBA UBI token)
  console.log("📋 Deploying SetvensBA UBI token...");
  const token = await deploy("CompliantERC20", {
    from: deployer,
    args: ["SetvensBA UBI", "SBA", complianceAddress],
    log: true,
  });
  const tokenAddress = token.address;
  console.log(`✅ SetvensBA UBI (SBA) deployed at: ${tokenAddress}\n`);

  // 4. Setup: Set authorized caller on ComplianceRules
  console.log("🔧 Setting up contract permissions...");
  const complianceRulesContract = await ethers.getContractAt("ComplianceRules", complianceAddress);
  const setAuthorizedTx = await complianceRulesContract.setAuthorizedCaller(tokenAddress, true);
  await setAuthorizedTx.wait();
  console.log(`✅ Set CompliantERC20 as authorized caller on ComplianceRules\n`);

  // 5. Setup: Add registrar to IdentityRegistry (deployer is already registrar by default, but we'll ensure it)
  const identityRegistryContract = await ethers.getContractAt("IdentityRegistry", registryAddress);
  const isRegistrar = await identityRegistryContract.registrars(deployer);
  if (!isRegistrar) {
    const addRegistrarTx = await identityRegistryContract.addRegistrar(deployer);
    await addRegistrarTx.wait();
    console.log(`✅ Added deployer as registrar\n`);
  } else {
    console.log(`ℹ️  Deployer is already a registrar\n`);
  }

  console.log("\n✅ Full Deployment Complete!");
  console.log(`📄 Contracts:`);
  console.log(`   - IdentityRegistry: ${registryAddress}`);
  console.log(`   - ComplianceRules: ${complianceAddress}`);
  console.log(`   - CompliantERC20: ${tokenAddress}`);
  console.log("");
};

export default func;
func.id = "deploy_ciphermint";
func.tags = ["Ciphermint", "IdentityRegistry", "ComplianceRules", "CompliantERC20"];
