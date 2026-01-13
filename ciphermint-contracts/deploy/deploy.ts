import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🚀 Deploying FHECounter...");
  console.log(`📍 Network: ${hre.network.name}`);
  console.log(`👤 Deployer: ${deployer}\n`);

  const deployed = await deploy("FHECounter", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log("\n✅ Deployment Complete!");
  console.log(`📄 Contract: FHECounter`);
  console.log(`📍 Contract Address: ${deployed.address}`);

  if (deployed.newlyDeployed) {
    console.log(`⛽ Gas Used: ${deployed.receipt?.gasUsed}`);
  } else {
    console.log("ℹ️  Contract was already deployed");
  }
  console.log("");
};

export default func;
func.id = "deploy_fhecounter";
func.tags = ["FHECounter"];
