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
    const contract = await factory.deploy(registryAddr);
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
    it("should attest Alice (over 18, compliant user)", async function () {
      // Alice: Born 1990 (offset 90), age 36 in 2026
      const aliceNameHash = ethers.keccak256(ethers.toUtf8Bytes("Alice Smith"));
      await attestUser(signers.alice.address, 90, aliceNameHash, signers.registrar);
      expect(await identityRegistry.isAttested(signers.alice.address)).to.be.true;
      expect(await identityRegistry.fullNameHashes(signers.alice.address)).to.eq(aliceNameHash);
    });

    it("should attest Bob (over 18, compliant user)", async function () {
      // Bob: Born 1995 (offset 95), age 31 in 2026
      const bobNameHash = ethers.keccak256(ethers.toUtf8Bytes("Bob Johnson"));
      await attestUser(signers.bob.address, 95, bobNameHash, signers.registrar);
      expect(await identityRegistry.isAttested(signers.bob.address)).to.be.true;
      expect(await identityRegistry.fullNameHashes(signers.bob.address)).to.eq(bobNameHash);
    });

    it("should attest Charlie (under 18, non-compliant user)", async function () {
      // Charlie: Born 2010 (offset 110), age 16 in 2026
      const charlieNameHash = ethers.keccak256(ethers.toUtf8Bytes("Charlie Brown"));
      await attestUser(signers.charlie.address, 110, charlieNameHash, signers.registrar);
      expect(await identityRegistry.isAttested(signers.charlie.address)).to.be.true;
      expect(await identityRegistry.fullNameHashes(signers.charlie.address)).to.eq(charlieNameHash);
    });

    it("should reject duplicate name hash", async function () {
      const duplicateNameHash = ethers.keccak256(ethers.toUtf8Bytes("Duplicate Name"));

      // First attestation should succeed
      await attestUser(signers.alice.address, 90, duplicateNameHash, signers.registrar);

      // Second attestation with same name hash should fail
      const ethSigners = await ethers.getSigners();
      const anotherUser = ethSigners[6];
      await expect(
        attestUser(anotherUser.address, 95, duplicateNameHash, signers.registrar),
      ).to.be.revertedWithCustomError(identityRegistry, "DuplicateName");
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
    it("should pass compliance for Alice (over 18)", async function () {
      await complianceRules.connect(signers.alice).checkCompliance(signers.alice.address);

      const result = await complianceRules.connect(signers.alice).getComplianceResult(signers.alice.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.alice);

      expect(isCompliant).to.be.true;
    });

    it("should pass compliance for Bob (over 18)", async function () {
      await complianceRules.connect(signers.bob).checkCompliance(signers.bob.address);

      const result = await complianceRules.connect(signers.bob).getComplianceResult(signers.bob.address);
      const isCompliant = await fhevm.userDecryptEbool(result, complianceAddress, signers.bob);

      expect(isCompliant).to.be.true;
    });

    it("should fail compliance for Charlie (under 18)", async function () {
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
    const CLAIM_AMOUNT = 100n;
    const UINT64_MAX = (1n << 64n) - 1n;

    it("should mint tokens to Alice", async function () {
      await token.connect(signers.owner).mint(signers.alice.address, MINT_AMOUNT);

      const balance = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedBalance = await fhevm.userDecryptEuint(FhevmType.euint64, balance, tokenAddress, signers.alice);

      expect(decryptedBalance).to.equal(MINT_AMOUNT);
    });

    it("should allow compliant user to claim tokens once", async function () {
      const balanceBefore = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedBefore = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        balanceBefore,
        tokenAddress,
        signers.alice,
      );

      await token.connect(signers.alice).claimTokens();

      const balanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAfter = await fhevm.userDecryptEuint(FhevmType.euint64, balanceAfter, tokenAddress, signers.alice);

      expect(decryptedAfter).to.equal(decryptedBefore + CLAIM_AMOUNT);

      const claimedStatus = await token.connect(signers.alice).hasClaimedMint(signers.alice.address);
      const hasClaimed = await fhevm.userDecryptEbool(claimedStatus, tokenAddress, signers.alice);
      expect(hasClaimed).to.be.true;
    });

    it("should not mint on second claim", async function () {
      const balanceBefore = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedBefore = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        balanceBefore,
        tokenAddress,
        signers.alice,
      );

      await token.connect(signers.alice).claimTokens();

      const balanceAfter = await token.connect(signers.alice).balanceOf(signers.alice.address);
      const decryptedAfter = await fhevm.userDecryptEuint(FhevmType.euint64, balanceAfter, tokenAddress, signers.alice);

      expect(decryptedAfter).to.equal(decryptedBefore);
    });

    it("should not mint for non-compliant user", async function () {
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

      expect(decryptedAliceBalance).to.equal(MINT_AMOUNT + CLAIM_AMOUNT - TRANSFER_AMOUNT);
    });

    it("should revert when transferring to self", async function () {
      const encrypted = fhevm.createEncryptedInput(tokenAddress, signers.alice.address);
      encrypted.add64(TRANSFER_AMOUNT);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        token
          .connect(signers.alice)
          ["transfer(address,bytes32,bytes)"](signers.alice.address, encryptedInput.handles[0], encryptedInput.inputProof),
      ).to.be.revertedWithCustomError(token, "SelfTransferNotAllowed");
    });

    it("should reject transfer with unauthorized ciphertext handle", async function () {
      const aliceBalanceHandle = await token.balanceOf(signers.alice.address);

      await expect(
        token.connect(signers.bob)["transfer(address,bytes32)"](signers.bob.address, aliceBalanceHandle),
      ).to.be.revertedWithCustomError(token, "UnauthorizedCiphertext");
    });

    it("should silently fail transfer to Charlie (under 18) - branch-free", async function () {
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
});
