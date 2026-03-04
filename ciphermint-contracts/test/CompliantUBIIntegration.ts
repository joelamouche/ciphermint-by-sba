/**
 * @title Compliant UBI Integration Tests
 * @notice Tests UBI logic on top of CompliantERC20 (CompliantUBI)
 * @dev Uses @fhevm/hardhat-plugin for encrypted input/output handling
 */

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ComplianceRules, CompliantUBI, IdentityRegistry, IdentityRegistry__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  owner: HardhatEthersSigner;
  registrar: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

describe("CompliantUBI Integration Flow", function () {
  let signers: Signers;
  let identityRegistry: IdentityRegistry;
  let complianceRules: ComplianceRules;
  let token: CompliantUBI;

  let registryAddress: string;
  let complianceAddress: string;
  let tokenAddress: string;

  async function deployIdentityRegistry() {
    const factory = (await ethers.getContractFactory("IdentityRegistry")) as IdentityRegistry__factory;
    const contract = (await factory.deploy()) as IdentityRegistry;
    return contract;
  }

  async function deployComplianceRules(registryAddr: string) {
    const factory = await ethers.getContractFactory("ComplianceRules");
    const contract = await factory.deploy(registryAddr);
    return contract;
  }

  async function deployToken(complianceAddr: string) {
    const factory = await ethers.getContractFactory("CompliantUBI");
    const contract = (await factory.deploy("StevensBA UBI", "SBA", complianceAddr)) as CompliantUBI;
    return contract;
  }

  async function attestUser(
    userAddress: string,
    birthYearOffset: number,
    nameHash: string,
    signer: HardhatEthersSigner,
  ) {
    const encrypted = fhevm.createEncryptedInput(registryAddress, signer.address);
    encrypted.add8(birthYearOffset);
    const encryptedInput = await encrypted.encrypt();

    await identityRegistry
      .connect(signer)
      .attestIdentity(userAddress, encryptedInput.handles[0], nameHash, encryptedInput.inputProof);
  }

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    if (ethSigners.length < 5) {
      return this.skip();
    }
    signers = {
      owner: ethSigners[0],
      registrar: ethSigners[1],
      alice: ethSigners[2],
      bob: ethSigners[3],
      charlie: ethSigners[4],
    };

    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    identityRegistry = await deployIdentityRegistry();
    registryAddress = await identityRegistry.getAddress();

    complianceRules = await deployComplianceRules(registryAddress);
    complianceAddress = await complianceRules.getAddress();

    token = await deployToken(complianceAddress);
    tokenAddress = await token.getAddress();

    await complianceRules.connect(signers.owner).setAuthorizedCaller(tokenAddress, true);

    await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
  });

  describe("Setup", function () {
    it("should have all contracts deployed correctly", async function () {
      expect(registryAddress).to.not.equal(ethers.ZeroAddress);
      expect(complianceAddress).to.not.equal(ethers.ZeroAddress);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should have compliance rules pointing to identity registry", async function () {
      expect(await complianceRules.identityRegistry()).to.equal(registryAddress);
    });

    it("should have token pointing to compliance rules", async function () {
      expect(await token.complianceChecker()).to.equal(complianceAddress);
    });
  });

  describe("User Attestation and Access", function () {
    it("should attest users and grant access", async function () {
      const aliceNameHash = ethers.keccak256(ethers.toUtf8Bytes("Alice Smith"));
      await attestUser(signers.alice.address, 90, aliceNameHash, signers.registrar);

      const bobNameHash = ethers.keccak256(ethers.toUtf8Bytes("Bob Johnson"));
      await attestUser(signers.bob.address, 95, bobNameHash, signers.registrar);

      const charlieNameHash = ethers.keccak256(ethers.toUtf8Bytes("Charlie Brown"));
      await attestUser(signers.charlie.address, 110, charlieNameHash, signers.registrar);

      await identityRegistry.connect(signers.alice).grantAccessTo(complianceAddress);
      await identityRegistry.connect(signers.bob).grantAccessTo(complianceAddress);
      await identityRegistry.connect(signers.charlie).grantAccessTo(complianceAddress);
    });
  });

  describe("UBI Operations", function () {
    const DECIMALS = 10n ** 8n; // 8 decimal places
    const CLAIM_AMOUNT = 100n * DECIMALS; // 100 SBA in base units

    it("should allow compliant user to claim UBI once", async function () {
      await token.connect(signers.alice).claimTokens();

      const balanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAfter = await fhevm.userDecryptEuint(FhevmType.euint64, balanceAfter, tokenAddress, signers.alice);

      expect(decryptedAfter).to.equal(CLAIM_AMOUNT);

      const claimedStatus = await token.connect(signers.alice).hasClaimedMint(signers.alice.address);
      const hasClaimed = await fhevm.userDecryptEbool(claimedStatus, tokenAddress, signers.alice);
      expect(hasClaimed).to.be.true;

      const tvs = await token.getTotalValueShielded();
      expect(tvs).to.equal(decryptedAfter);
    });

    it("should not mint on second UBI claim", async function () {
      await token.connect(signers.alice).claimTokens(); // first claim

      const balanceBefore = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedBefore = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        balanceBefore,
        tokenAddress,
        signers.alice,
      );

      await token.connect(signers.alice).claimTokens(); // second claim

      const balanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAfter = await fhevm.userDecryptEuint(FhevmType.euint64, balanceAfter, tokenAddress, signers.alice);

      expect(decryptedAfter).to.equal(decryptedBefore);
    });

    it("should not mint UBI for non-compliant user", async function () {
      const tvsBefore = await token.getTotalValueShielded();

      await token.connect(signers.charlie).claimTokens();

      const balanceAfter = await token.connect(signers.charlie).balanceOf(signers.charlie.address);
      const decryptedAfter = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        balanceAfter,
        tokenAddress,
        signers.charlie,
      );

      expect(decryptedAfter).to.equal(0n);

      const claimedStatus = await token.connect(signers.charlie).hasClaimedMint(signers.charlie.address);
      const hasClaimed = await fhevm.userDecryptEbool(claimedStatus, tokenAddress, signers.charlie);
      expect(hasClaimed).to.be.false;

      const tvsAfter = await token.getTotalValueShielded();
      expect(tvsAfter).to.equal(tvsBefore + CLAIM_AMOUNT);
    });

    it("should not accrue income before initial claimTokens", async function () {
      const claimable = await token.claimableMonthlyIncome(signers.bob.address);
      expect(claimable).to.equal(0n);
    });

    it("should have zero income immediately after claiming accrued income", async function () {
      // First, ensure Alice has enrolled and accrued some income
      await token.connect(signers.alice).claimTokens();
      await token.connect(signers.alice).claimMonthlyIncome();

      const claimableBefore = await token.claimableMonthlyIncome(signers.alice.address);

      await token.connect(signers.alice).claimMonthlyIncome();

      const claimableAfter = await token.claimableMonthlyIncome(signers.alice.address);
      expect(claimableBefore).to.be.gte(0n);
      expect(claimableAfter).to.equal(0n);
    });

    it("should accrue and allow claiming income after a few blocks", async function () {
      // Enroll and reset accrual window
      await token.connect(signers.alice).claimTokens();
      await token.connect(signers.alice).claimMonthlyIncome();

      const tvsBefore = await token.getTotalValueShielded();

      const blocksToMine = 10n;
      const blocksHex = "0x" + blocksToMine.toString(16);
      await ethers.provider.send("hardhat_mine", [blocksHex]);

      const claimable = await token.claimableMonthlyIncome(signers.alice.address);
      expect(claimable).to.be.gt(0n);

      await token.connect(signers.alice).claimMonthlyIncome();

      const balanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAfter = await fhevm.userDecryptEuint(FhevmType.euint64, balanceAfter, tokenAddress, signers.alice);

      expect(decryptedAfter).to.be.gt(CLAIM_AMOUNT);

      const tvsAfter = await token.getTotalValueShielded();
      expect(tvsAfter).to.be.gt(tvsBefore);

      const claimableAfter = await token.claimableMonthlyIncome(signers.alice.address);
      expect(claimableAfter).to.equal(0n);
    });
  });
});
