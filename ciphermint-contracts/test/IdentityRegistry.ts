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
  countryCode: number,
  kycLevel: number,
  isBlacklisted: boolean,
  signer: HardhatEthersSigner,
) {
  const encrypted = fhevm.createEncryptedInput(contractAddress, signer.address);
  encrypted.add8(birthYearOffset);
  encrypted.add16(countryCode);
  encrypted.add8(kycLevel);
  encrypted.addBool(isBlacklisted);
  const encryptedInput = await encrypted.encrypt();

  const tx = await contract
    .connect(signer)
    .attestIdentity(
      userAddress,
      encryptedInput.handles[0],
      encryptedInput.handles[1],
      encryptedInput.handles[2],
      encryptedInput.handles[3],
      encryptedInput.inputProof,
    );
  await tx.wait();
}

/**
 * IdentityRegistry Tests
 *
 * Tests for the on-chain encrypted identity registry.
 * Demonstrates encrypted identity attributes, role-based access control,
 * and verification patterns using FHE operations.
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
      // Birth year 1990 (offset 90), USA (840), KYC level 3, not blacklisted
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        840,
        3,
        false,
        signers.registrar,
      );

      expect(await identityRegistry.isAttested(signers.user1.address)).to.be.true;

      const timestamp = await identityRegistry.attestationTimestamp(signers.user1.address);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("should emit IdentityAttested event", async function () {
      const encrypted = fhevm.createEncryptedInput(identityRegistryAddress, signers.registrar.address);
      encrypted.add8(100);
      encrypted.add16(276); // Austria
      encrypted.add8(2);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        identityRegistry
          .connect(signers.registrar)
          .attestIdentity(
            signers.user2.address,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      )
        .to.emit(identityRegistry, "IdentityAttested")
        .withArgs(signers.user2.address, signers.registrar.address);
    });

    it("should revert when non-registrar tries to attest", async function () {
      const encrypted = fhevm.createEncryptedInput(identityRegistryAddress, signers.user1.address);
      encrypted.add8(100);
      encrypted.add16(840);
      encrypted.add8(1);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        identityRegistry
          .connect(signers.user1)
          .attestIdentity(
            signers.verifier.address,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(identityRegistry, "OnlyRegistrar");
    });
  });

  // 🔓 Encrypted Data Retrieval Tests
  describe("Encrypted Data Retrieval", function () {
    beforeEach(async function () {
      // Add registrar and attest user1
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        840,
        3,
        false,
        signers.registrar,
      );
    });

    it("should allow user to read their own KYC level", async function () {
      const encryptedKyc = await identityRegistry.connect(signers.user1).getKycLevel(signers.user1.address);

      const kycLevel = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedKyc,
        identityRegistryAddress,
        signers.user1,
      );

      expect(kycLevel).to.eq(3n);
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

    it("should allow user to read their own country code", async function () {
      const encryptedCountry = await identityRegistry.connect(signers.user1).getCountryCode(signers.user1.address);

      const countryCode = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        encryptedCountry,
        identityRegistryAddress,
        signers.user1,
      );

      expect(countryCode).to.eq(840n);
    });

    it("should allow user to read their own blacklist status", async function () {
      const encryptedBlacklist = await identityRegistry
        .connect(signers.user1)
        .getBlacklistStatus(signers.user1.address);

      const isBlacklisted = await fhevm.userDecryptEbool(encryptedBlacklist, identityRegistryAddress, signers.user1);

      expect(isBlacklisted).to.be.false;
    });

    it("should revert for non-attested users", async function () {
      const unattested = (await ethers.getSigners())[5];

      await expect(
        identityRegistry.connect(unattested).getBirthYearOffset(unattested.address),
      ).to.be.revertedWithCustomError(identityRegistry, "NotAttested");
    });

    it("should revert when accessing data without permission", async function () {
      await expect(
        identityRegistry.connect(signers.verifier).getKycLevel(signers.user1.address),
      ).to.be.revertedWithCustomError(identityRegistry, "AccessProhibited");
    });
  });

  // ✅ Verification Helpers Tests
  describe("Verification Helpers", function () {
    beforeEach(async function () {
      // Add registrar and attest user1
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        840,
        3,
        false,
        signers.registrar,
      );
    });

    it("should check minimum KYC level correctly", async function () {
      await identityRegistry.connect(signers.user1).hasMinKycLevel(signers.user1.address, 2);

      const encryptedHasMinKyc = await identityRegistry
        .connect(signers.user1)
        .getKycLevelResult(signers.user1.address, 2);

      const hasMinKyc = await fhevm.userDecryptEbool(encryptedHasMinKyc, identityRegistryAddress, signers.user1);

      expect(hasMinKyc).to.be.true;
    });

    it("should fail KYC check when level is insufficient", async function () {
      await identityRegistry.connect(signers.user1).hasMinKycLevel(signers.user1.address, 5);

      const encryptedHasMinKyc = await identityRegistry
        .connect(signers.user1)
        .getKycLevelResult(signers.user1.address, 5);

      const hasMinKyc = await fhevm.userDecryptEbool(encryptedHasMinKyc, identityRegistryAddress, signers.user1);

      expect(hasMinKyc).to.be.false;
    });

    it("should check country match correctly", async function () {
      await identityRegistry.connect(signers.user1).isFromCountry(signers.user1.address, 840);

      const encryptedCountryMatch = await identityRegistry
        .connect(signers.user1)
        .getCountryResult(signers.user1.address, 840);

      const isFromCountry = await fhevm.userDecryptEbool(encryptedCountryMatch, identityRegistryAddress, signers.user1);

      expect(isFromCountry).to.be.true;
    });

    it("should fail country check when country doesn't match", async function () {
      await identityRegistry.connect(signers.user1).isFromCountry(signers.user1.address, 276);

      const encryptedCountryMatch = await identityRegistry
        .connect(signers.user1)
        .getCountryResult(signers.user1.address, 276);

      const isFromCountry = await fhevm.userDecryptEbool(encryptedCountryMatch, identityRegistryAddress, signers.user1);

      expect(isFromCountry).to.be.false;
    });

    it("should check not-blacklisted status", async function () {
      await identityRegistry.connect(signers.user1).isNotBlacklisted(signers.user1.address);

      const encryptedNotBlacklisted = await identityRegistry
        .connect(signers.user1)
        .getBlacklistResult(signers.user1.address);

      const isNotBlacklisted = await fhevm.userDecryptEbool(
        encryptedNotBlacklisted,
        identityRegistryAddress,
        signers.user1,
      );

      expect(isNotBlacklisted).to.be.true;
    });
  });

  // 🔑 Access Control Grants Tests
  describe("Access Control Grants", function () {
    beforeEach(async function () {
      // Add registrar and attest user1
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user1.address,
        90,
        840,
        3,
        false,
        signers.registrar,
      );
    });

    it("should block verifier from reading user data without grant", async function () {
      await expect(
        identityRegistry.connect(signers.verifier).getKycLevel(signers.user1.address),
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
      const encryptedKyc = await identityRegistry.connect(signers.verifier).getKycLevel(signers.user1.address);

      const kycLevel = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedKyc,
        identityRegistryAddress,
        signers.verifier,
      );

      expect(kycLevel).to.eq(3n);
    });
  });

  // 🗑️ Identity Revocation Tests
  describe("Identity Revocation", function () {
    beforeEach(async function () {
      // Add registrar and attest user2
      await identityRegistry.connect(signers.owner).addRegistrar(signers.registrar.address);
      await attestUser(
        identityRegistry,
        identityRegistryAddress,
        signers.user2.address,
        100,
        276,
        2,
        false,
        signers.registrar,
      );
    });

    it("should allow registrar to revoke identity", async function () {
      expect(await identityRegistry.isAttested(signers.user2.address)).to.be.true;

      await expect(identityRegistry.connect(signers.registrar).revokeIdentity(signers.user2.address))
        .to.emit(identityRegistry, "IdentityRevoked")
        .withArgs(signers.user2.address);

      expect(await identityRegistry.isAttested(signers.user2.address)).to.be.false;
    });

    it("should revert when revoking non-attested user", async function () {
      const unattested = (await ethers.getSigners())[6];

      await expect(
        identityRegistry.connect(signers.registrar).revokeIdentity(unattested.address),
      ).to.be.revertedWithCustomError(identityRegistry, "NotAttested");
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
