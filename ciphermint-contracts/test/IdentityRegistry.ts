import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { IdentityRegistry, IdentityRegistry__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  owner: HardhatEthersSigner;
  registrar: HardhatEthersSigner;
  user1: HardhatEthersSigner;
  user2: HardhatEthersSigner;
  verifier: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("IdentityRegistry")) as IdentityRegistry__factory;
  const identityRegistry = (await factory.deploy()) as IdentityRegistry;
  const identityRegistryAddress = await identityRegistry.getAddress();

  return { identityRegistry, identityRegistryAddress };
}

async function attestUser(
  contract: IdentityRegistry,
  contractAddress: string,
  userAddress: string,
  birthYearOffset: number,
  nameHash: string,
  signer: HardhatEthersSigner,
) {
  const encrypted = fhevm.createEncryptedInput(contractAddress, signer.address);
  encrypted.add8(birthYearOffset);
  const encryptedInput = await encrypted.encrypt();

  const tx = await contract
    .connect(signer)
    .attestIdentity(userAddress, encryptedInput.handles[0], nameHash, encryptedInput.inputProof);
  await tx.wait();
}

/**
 * IdentityRegistry Tests
 *
 * Tests for the on-chain encrypted identity registry.
 * Demonstrates encrypted birth year for age verification, name hash for duplicate detection,
 * role-based access control, and verification patterns using FHE operations.
 */
describe("IdentityRegistry", function () {
  let signers: Signers;
  let identityRegistry: IdentityRegistry;
  let identityRegistryAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      owner: ethSigners[0],
      registrar: ethSigners[1],
      user1: ethSigners[2],
      user2: ethSigners[3],
      verifier: ethSigners[4],
    };
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ identityRegistry, identityRegistryAddress } = await deployFixture());
  });

  // 🏗️ Deployment Tests
  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      expect(await identityRegistry.owner()).to.eq(signers.owner.address);
    });

    it("should set deployer as initial registrar", async function () {
      expect(await identityRegistry.registrars(signers.owner.address)).to.be.true;
    });
  });

  // 👥 Registrar Management Tests
  describe("Registrar Management", function () {
    it("should allow owner to add registrar", async function () {
      await expect(identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address))
        .to.emit(identityRegistry, "RegistrarAdded")
        .withArgs(signers.registrar.address);

      expect(await identityRegistry.registrars(signers.registrar.address)).to.be.true;
    });

    it("should revert when non-owner tries to add registrar", async function () {
      await expect(
        identityRegistry.connect(signers.user1).addRegistrar(signers.user2.address),
      ).to.be.revertedWithCustomError(identityRegistry, "OnlyOwner");
    });

    it("should allow owner to remove registrar", async function () {
      // First add a registrar
      await identityRegistry.connect(signers.owner).addRegistrar(signers.user2.address);
      expect(await identityRegistry.registrars(signers.user2.address)).to.be.true;

      // Then remove them
      await expect(identityRegistry.connect(signers.owner).removeRegistrar(signers.user2.address))
        .to.emit(identityRegistry, "RegistrarRemoved")
        .withArgs(signers.user2.address);

      expect(await identityRegistry.registrars(signers.user2.address)).to.be.false;
    });
  });

  // 🔐 Identity Attestation Tests
  describe("Identity Attestation", function () {
    beforeEach(async function () {
      // Add registrar before each test
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
    });

    it("should allow registrar to attest identity", async function () {
      // Birth year 1990 (offset 90), name hash for "John Doe"
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash,
        signers.registrar,
      );

      expect(await identityRegistry.isAttested(signers.user1.address)).to.be.true;
      expect(await identityRegistry.fullNameHashes(signers.user1.address)).to.eq(nameHash);

      const timestamp = await identityRegistry.attestationTimestamp(signers.user1.address);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("should emit IdentityAttested event", async function () {
      const encrypted = fhevm.createEncryptedInput(identityRegistryAddress, signers.registrar.address);
      encrypted.add8(100); // Birth year 2000 (offset 100)
      const encryptedInput = await encrypted.encrypt();
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Jane Smith"));

      await expect(
        identityRegistry
          .connect(signers.registrar)
          .attestIdentity(signers.user2.address, encryptedInput.handles[0], nameHash, encryptedInput.inputProof),
      )
        .to.emit(identityRegistry, "IdentityAttested")
        .withArgs(signers.user2.address, signers.registrar.address);
    });

    it("should revert when non-registrar tries to attest", async function () {
      const encrypted = fhevm.createEncryptedInput(identityRegistryAddress, signers.user1.address);
      encrypted.add8(100);
      const encryptedInput = await encrypted.encrypt();
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Test User"));

      await expect(
        identityRegistry
          .connect(signers.user1)
          .attestIdentity(signers.verifier.address, encryptedInput.handles[0], nameHash, encryptedInput.inputProof),
      ).to.be.revertedWithCustomError(identityRegistry, "OnlyRegistrar");
    });

    it("should revert when duplicate name hash is detected", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Duplicate Name"));

      // First attestation should succeed
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash,
        signers.registrar,
      );

      // Second attestation with same name hash should fail
      await expect(
        attestUser(identityRegistry, identityRegistryAddress, signers.user2.address, 100, nameHash, signers.registrar),
      ).to.be.revertedWithCustomError(identityRegistry, "DuplicateName");
    });

    it("should allow same user to update their identity with different name", async function () {
      const nameHash1 = ethers.keccak256(ethers.toUtf8Bytes("Original Name"));
      const nameHash2 = ethers.keccak256(ethers.toUtf8Bytes("Updated Name"));

      // First attestation
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash1,
        signers.registrar,
      );

      expect(await identityRegistry.fullNameHashes(signers.user1.address)).to.eq(nameHash1);

      // Update with different name should succeed
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash2,
        signers.registrar,
      );

      expect(await identityRegistry.fullNameHashes(signers.user1.address)).to.eq(nameHash2);
    });
  });

  // 🔓 Encrypted Data Retrieval Tests
  describe("Encrypted Data Retrieval", function () {
    beforeEach(async function () {
      // Add registrar and attest user1
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash,
        signers.registrar,
      );
    });

    it("should allow user to read their own birth year offset", async function () {
      const encryptedBirthYear = await identityRegistry
        .connect(signers.user1)
        .getBirthYearOffset(signers.user1.address);

      const birthYearOffset = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedBirthYear,
        identityRegistryAddress,
        signers.user1,
      );

      expect(birthYearOffset).to.eq(90n);
    });

    it("should allow user to read their own name hash", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe"));
      const storedNameHash = await identityRegistry.fullNameHashes(signers.user1.address);
      expect(storedNameHash).to.eq(nameHash);
    });

    it("should revert for non-attested users", async function () {
      const unattested = (await ethers.getSigners())[5];

      await expect(
        identityRegistry.connect(unattested).getBirthYearOffset(unattested.address),
      ).to.be.revertedWithCustomError(identityRegistry, "NotAttested");
    });

    it("should revert when accessing data without permission", async function () {
      await expect(
        identityRegistry.connect(signers.verifier).getBirthYearOffset(signers.user1.address),
      ).to.be.revertedWithCustomError(identityRegistry, "AccessProhibited");
    });
  });

  // ✅ Age Verification Tests
  describe("Age Verification", function () {
    beforeEach(async function () {
      // Add registrar and attest user1 (born 1990, age 36 in 2026)
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90, // Birth year 1990 (offset 90)
        nameHash,
        signers.registrar,
      );
    });

    it("should verify user is at least 18 years old", async function () {
      // Call function to compute and store result (also sets permissions)
      await identityRegistry.connect(signers.user1).isOver18(signers.user1.address);

      // Get stored result via view function
      const encryptedResult = await identityRegistry
        .connect(signers.user1)
        .getVerificationResult(signers.user1.address, 18);

      // Decrypt using userDecryptEbool (permissions were set by the call)
      const isOver18 = await fhevm.userDecryptEbool(encryptedResult, identityRegistryAddress, signers.user1);

      expect(isOver18).to.be.true;
    });

    it("should verify user is at least specified age", async function () {
      // Call function to compute and store result (also sets permissions)
      await identityRegistry.connect(signers.user1).isAtLeastAge(signers.user1.address, 30);

      // Get stored result via view function
      const encryptedResult = await identityRegistry
        .connect(signers.user1)
        .getVerificationResult(signers.user1.address, 30);

      // Decrypt using userDecryptEbool (permissions were set by the call)
      const isAtLeast30 = await fhevm.userDecryptEbool(encryptedResult, identityRegistryAddress, signers.user1);

      expect(isAtLeast30).to.be.true;
    });

    it("should fail age check when user is too young", async function () {
      // Attest user2 born in 2010 (offset 110, age 16 in 2026)
      const nameHash2 = ethers.keccak256(ethers.toUtf8Bytes("Young User"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user2.address,
        110, // Birth year 2010 (offset 110)
        nameHash2,
        signers.registrar,
      );

      // Call function to compute and store result (also sets permissions)
      await identityRegistry.connect(signers.user2).isOver18(signers.user2.address);

      // Get stored result via view function
      const encryptedResult = await identityRegistry
        .connect(signers.user2)
        .getVerificationResult(signers.user2.address, 18);

      // Decrypt using userDecryptEbool (permissions were set by the call)
      const isOver18 = await fhevm.userDecryptEbool(encryptedResult, identityRegistryAddress, signers.user2);

      expect(isOver18).to.be.false;
    });

    it("should allow retrieving stored verification result", async function () {
      // First compute the verification
      await identityRegistry.connect(signers.user1).isOver18(signers.user1.address);

      // Then retrieve the stored result
      const encryptedResult = await identityRegistry
        .connect(signers.user1)
        .getVerificationResult(signers.user1.address, 18);

      const isOver18 = await fhevm.userDecryptEbool(encryptedResult, identityRegistryAddress, signers.user1);

      expect(isOver18).to.be.true;
    });

    it("should revert when retrieving non-existent verification result", async function () {
      await expect(
        identityRegistry.connect(signers.user1).getVerificationResult(signers.user1.address, 21),
      ).to.be.revertedWithCustomError(identityRegistry, "NoVerificationResult");
    });

    it("should revert when checking age for non-attested user", async function () {
      const unattested = (await ethers.getSigners())[5];

      await expect(identityRegistry.connect(unattested).isOver18(unattested.address)).to.be.revertedWithCustomError(
        identityRegistry,
        "NotAttested",
      );
    });
  });

  // 🔑 Access Control Grants Tests
  describe("Access Control Grants", function () {
    beforeEach(async function () {
      // Add registrar and attest user1
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("John Doe"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        nameHash,
        signers.registrar,
      );
    });

    it("should block verifier from reading user data without grant", async function () {
      await expect(
        identityRegistry.connect(signers.verifier).getBirthYearOffset(signers.user1.address),
      ).to.be.revertedWithCustomError(identityRegistry, "AccessProhibited");
    });

    it("should allow user to grant access to verifier", async function () {
      await expect(identityRegistry.connect(signers.user1).grantAccessTo(signers.verifier.address))
        .to.emit(identityRegistry, "AccessGranted")
        .withArgs(signers.user1.address, signers.verifier.address);
    });

    it("should allow verifier to read user data after grant", async function () {
      // First grant access
      await identityRegistry.connect(signers.user1).grantAccessTo(signers.verifier.address);

      // Then verify access
      const encryptedBirthYear = await identityRegistry
        .connect(signers.verifier)
        .getBirthYearOffset(signers.user1.address);

      const birthYearOffset = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedBirthYear,
        identityRegistryAddress,
        signers.verifier,
      );

      expect(birthYearOffset).to.eq(90n);
    });
  });

  // 🗑️ Identity Revocation Tests
  describe("Identity Revocation", function () {
    beforeEach(async function () {
      // Add registrar and attest user2
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Jane Smith"));
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user2.address,
        100,
        nameHash,
        signers.registrar,
      );
    });

    it("should allow registrar to revoke identity", async function () {
      expect(await identityRegistry.isAttested(signers.user2.address)).to.be.true;

      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Jane Smith"));
      expect(await identityRegistry.fullNameHashes(signers.user2.address)).to.eq(nameHash);

      await expect(identityRegistry.connect(signers.registrar).revokeIdentity(signers.user2.address))
        .to.emit(identityRegistry, "IdentityRevoked")
        .withArgs(signers.user2.address);

      expect(await identityRegistry.isAttested(signers.user2.address)).to.be.false;
      expect(await identityRegistry.fullNameHashes(signers.user2.address)).to.eq(ethers.ZeroHash);
    });

    it("should revert when revoking non-attested user", async function () {
      const unattested = (await ethers.getSigners())[6];

      await expect(
        identityRegistry.connect(signers.registrar).revokeIdentity(unattested.address),
      ).to.be.revertedWithCustomError(identityRegistry, "NotAttested");
    });
  });

  // 📅 Current Year Update Tests
  describe("Current Year Update", function () {
    it("should allow owner to update current year", async function () {
      // Update to year 2027 (offset 127)
      await identityRegistry.connect(signers.owner).updateCurrentYear(127);
      // No event is emitted, but we can verify by checking age verification still works
    });

    it("should revert when non-owner tries to update current year", async function () {
      await expect(identityRegistry.connect(signers.user1).updateCurrentYear(127)).to.be.revertedWithCustomError(
        identityRegistry,
        "OnlyOwner",
      );
    });
  });

  // 👑 Ownership Transfer Tests
  describe("Ownership Transfer", function () {
    it("should allow owner to initiate ownership transfer", async function () {
      await expect(identityRegistry.connect(signers.owner).transferOwnership(signers.user1.address))
        .to.emit(identityRegistry, "OwnershipTransferStarted")
        .withArgs(signers.owner.address, signers.user1.address);

      expect(await identityRegistry.pendingOwner()).to.eq(signers.user1.address);
    });

    it("should revert when non-owner tries to transfer ownership", async function () {
      await expect(
        identityRegistry.connect(signers.user1).transferOwnership(signers.user2.address),
      ).to.be.revertedWithCustomError(identityRegistry, "OnlyOwner");
    });

    it("should revert when transferring to zero address", async function () {
      await expect(
        identityRegistry.connect(signers.owner).transferOwnership(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(identityRegistry, "InvalidOwner");
    });

    it("should allow pending owner to accept ownership", async function () {
      await identityRegistry.connect(signers.owner).transferOwnership(signers.user1.address);

      await expect(identityRegistry.connect(signers.user1).acceptOwnership())
        .to.emit(identityRegistry, "OwnershipTransferred")
        .withArgs(signers.owner.address, signers.user1.address);

      expect(await identityRegistry.owner()).to.eq(signers.user1.address);
      expect(await identityRegistry.pendingOwner()).to.eq(ethers.ZeroAddress);
    });

    it("should revert when non-pending owner tries to accept", async function () {
      await identityRegistry.connect(signers.owner).transferOwnership(signers.user1.address);

      await expect(identityRegistry.connect(signers.user2).acceptOwnership()).to.be.revertedWithCustomError(
        identityRegistry,
        "OnlyPendingOwner",
      );
    });
  });
});
