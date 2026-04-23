import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🚀 Deploying IdentityRegistry...");
  console.log(`📍 Network: ${hre.network.name}`);
  console.log(`👤 Deployer: ${deployer}\n`);

  const identityRegistry = await deploy("IdentityRegistry", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  const registryAddress = identityRegistry.address;

  console.log("\n✅ Deployment Complete!");
  console.log(`📄 Contract: IdentityRegistry`);
  console.log(`📍 Contract Address: ${registryAddress}`);

  if (identityRegistry.newlyDeployed) {
    console.log(`⛽ Gas Used: ${identityRegistry.receipt?.gasUsed}`);
  } else {
    console.log("ℹ️  Contract was already deployed");
  }
  console.log("");
};

export default func;
func.id = "deploy_identity_registry";
func.tags = ["IdentityRegistry"];
