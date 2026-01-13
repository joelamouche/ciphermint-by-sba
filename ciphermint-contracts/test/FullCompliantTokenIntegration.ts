/**
 * @title Full Integration Tests
 * @notice Tests the complete flow: IdentityRegistry -> ComplianceRules -> CompliantERC20
 * @dev Uses @fhevm/hardhat-plugin for encrypted input/output handling
 */

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ComplianceRules, CompliantERC20, IdentityRegistry, IdentityRegistry__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  owner: HardhatEthersSigner;
  registrar: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

describe("Full Integration Flow", function () {
  let signers: Signers;
  let identityRegistry: IdentityRegistry;
  let complianceRules: ComplianceRules; // ComplianceRules type not yet generated
  let token: CompliantERC20; // CompliantERC20 type not yet generated

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
    const contract = await factory.deploy(registryAddr, 1); // minKycLevel = 1
    return contract;
  }

  async function deployToken(complianceAddr: string) {
    const factory = await ethers.getContractFactory("CompliantERC20");
    const contract = await factory.deploy("Compliant Token", "CPL", complianceAddr);
    return contract;
  }

  async function attestUser(
    userAddress: string,
    birthYearOffset: number,
    countryCode: number,
    kycLevel: number,
    isBlacklisted: boolean,
    signer: HardhatEthersSigner,
  ) {
    const encrypted = fhevm.createEncryptedInput(registryAddress, signer.address);
    encrypted.add8(birthYearOffset);
    encrypted.add16(countryCode);
    encrypted.add8(kycLevel);
    encrypted.addBool(isBlacklisted);
    const encryptedInput = await encrypted.encrypt();

    await identityRegistry
      .connect(signer)
      .attestIdentity(
        userAddress,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.handles[3],
        encryptedInput.inputProof,
      );
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

    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    // Deploy all contracts
    identityRegistry = await deployIdentityRegistry();
    registryAddress = await identityRegistry.getAddress();

    complianceRules = await deployComplianceRules(registryAddress);
    complianceAddress = await complianceRules.getAddress();

    token = await deployToken(complianceAddress);
    tokenAddress = await token.getAddress();

    await complianceRules.connect(signers.owner).setAuthorizedCaller(tokenAddress, true);

    // Setup registrar
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

  describe("User Attestation", function () {
    it("should attest Alice (compliant user)", async function () {
      // Alice: KYC level 3, not blacklisted
      await attestUser(signers.alice.address, 90, 840, 3, false, signers.registrar);
      expect(await identityRegistry.isAttested(signers.alice.address)).to.be.true;
    });

    it("should attest Bob (compliant user)", async function () {
      // Bob: KYC level 2, not blacklisted
      await attestUser(signers.bob.address, 95, 276, 2, false, signers.registrar);
      expect(await identityRegistry.isAttested(signers.bob.address)).to.be.true;
    });

    it("should attest Charlie (blacklisted user)", async function () {
      // Charlie: KYC level 1, but blacklisted
      await attestUser(signers.charlie.address, 85, 840, 1, true, signers.registrar);
      expect(await identityRegistry.isAttested(signers.charlie.address)).to.be.true;
    });
  });

  describe("Access Grants", function () {
    it("should allow users to grant ComplianceRules access", async function () {
      await identityRegistry.connect(signers.alice).grantAccessTo(complianceAddress);
      await identityRegistry.connect(signers.bob).grantAccessTo(complianceAddress);
      await identityRegistry.connect(signers.charlie).grantAccessTo(complianceAddress);
    });
  });

  describe("Compliance Checks", function () {
    it("should pass compliance for Alice", async function () {
      await complianceRules.connect(signers.alice).checkCompliance(signers.alice.address);

      const result = await complianceRules.connect(signers.alice).getComplianceResult(signers.alice.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.alice);

      expect(isCompliant).to.be.true;
    });

    it("should pass compliance for Bob", async function () {
      await complianceRules.connect(signers.bob).checkCompliance(signers.bob.address);

      const result = await complianceRules.connect(signers.bob).getComplianceResult(signers.bob.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.bob);

      expect(isCompliant).to.be.true;
    });

    it("should fail compliance for Charlie (blacklisted)", async function () {
      await complianceRules.connect(signers.charlie).checkCompliance(signers.charlie.address);

      const result = await complianceRules.connect(signers.charlie).getComplianceResult(signers.charlie.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.charlie);

      expect(isCompliant).to.be.false;
    });

    it("should fail compliance for non-attested user", async function () {
      const ethSigners = await ethers.getSigners();
      const unattested = ethSigners[6];
      await complianceRules.connect(unattested).checkCompliance(unattested.address);

      const result = await complianceRules.connect(unattested).getComplianceResult(unattested.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, unattested);

      expect(isCompliant).to.be.false;
    });

    it("should block non-owner callers from checking compliance for others", async function () {
      await expect(
        complianceRules.connect(signers.bob).checkCompliance(signers.alice.address),
      ).to.be.revertedWithCustomError(complianceRules, "CallerNotAuthorized");
    });

    it("should block unauthorized access to cached compliance results", async function () {
      await complianceRules.connect(signers.alice).checkCompliance(signers.alice.address);

      await expect(
        complianceRules.connect(signers.owner).getComplianceResult(signers.alice.address),
      ).to.be.revertedWithCustomError(complianceRules, "AccessProhibited");
    });
  });

  describe("Token Operations", function () {
    // Note: euint64 max is ~18.4 quintillion. Using smaller values for tests.
    const MINT_AMOUNT = 1000000000n; // 1 billion (fits easily in uint64)
    const TRANSFER_AMOUNT = 100000000n; // 100 million
    const UINT64_MAX = (1n << 64n) - 1n;

    it("should mint tokens to Alice", async function () {
      await token.connect(signers.owner).mint(signers.alice.address, MINT_AMOUNT);

      const balance = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedBalance = await fhevm.userDecryptEuint(FhevmType.euint64, balance, tokenAddress, signers.alice);

      expect(decryptedBalance).to.equal(MINT_AMOUNT);
    });

    it("should reject mint amounts above uint64 max", async function () {
      await expect(
        token.connect(signers.owner).mint(signers.alice.address, UINT64_MAX + 1n),
      ).to.be.revertedWithCustomError(token, "TotalSupplyOverflow");
    });

    it("should allow compliant transfer from Alice to Bob", async function () {
      const encrypted = fhevm.createEncryptedInput(tokenAddress, signers.alice.address);
      encrypted.add64(TRANSFER_AMOUNT);
      const encryptedInput = await encrypted.encrypt();

      await token
        .connect(signers.alice)
        ["transfer(address,bytes32,bytes)"](signers.bob.address, encryptedInput.handles[0], encryptedInput.inputProof);

      // Check Bob's balance
      const bobBalance = await token.connect(signers.bob).balanceOf(signers.bob.address);
      const decryptedBobBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        bobBalance,
        tokenAddress,
        signers.bob,
      );

      expect(decryptedBobBalance).to.equal(TRANSFER_AMOUNT);

      // Check Alice's balance
      const aliceBalance = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAliceBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalance,
        tokenAddress,
        signers.alice,
      );

      expect(decryptedAliceBalance).to.equal(MINT_AMOUNT - TRANSFER_AMOUNT);
    });

    it("should reject transfer with unauthorized ciphertext handle", async function () {
      const aliceBalanceHandle = await token.balanceOf(signers.alice.address);

      await expect(
        token.connect(signers.bob)["transfer(address,bytes32)"](signers.bob.address, aliceBalanceHandle),
      ).to.be.revertedWithCustomError(token, "UnauthorizedCiphertext");
    });

    it("should silently fail transfer to Charlie (blacklisted) - branch-free", async function () {
      const aliceBalanceBefore = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const aliceBalanceBeforeDecrypted = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalanceBefore,
        tokenAddress,
        signers.alice,
      );

      const encrypted = fhevm.createEncryptedInput(tokenAddress, signers.alice.address);
      encrypted.add64(TRANSFER_AMOUNT);
      const encryptedInput = await encrypted.encrypt();

      // Transfer should NOT revert - branch-free compliance
      await token
        .connect(signers.alice)
        [
          "transfer(address,bytes32,bytes)"
        ](signers.charlie.address, encryptedInput.handles[0], encryptedInput.inputProof);

      // Alice's balance should be unchanged (transfer of 0 happened)
      const aliceBalanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const aliceBalanceAfterDecrypted = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalanceAfter,
        tokenAddress,
        signers.alice,
      );

      expect(aliceBalanceAfterDecrypted).to.equal(aliceBalanceBeforeDecrypted);
    });
  });

  describe("Compliance Changes", function () {
    it("should update min KYC level and affect compliance", async function () {
      // Increase min KYC level to 3 (Bob has level 2)
      await complianceRules.connect(signers.owner).setMinKycLevel(3);

      // Bob should now fail compliance
      await complianceRules.connect(signers.bob).checkCompliance(signers.bob.address);

      const result = await complianceRules.connect(signers.bob).getComplianceResult(signers.bob.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.bob);

      expect(isCompliant).to.be.false;

      // Reset for other tests
      await complianceRules.connect(signers.owner).setMinKycLevel(1);
    });
  });
});
