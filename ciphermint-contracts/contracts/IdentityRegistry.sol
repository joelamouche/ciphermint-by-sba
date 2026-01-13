// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
pragma solidity ^0.8.27;

import {FHE, euint8, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @author Gustavo Valverde
 * @notice On-chain encrypted identity registry for age verification and name uniqueness
 * @dev Example for fhEVM Examples - Identity Category
 *
 * @custom:category identity
 * @custom:chapter identity,access-control
 * @custom:concept Storing encrypted birth year and hashed name for age verification and duplicate prevention
 * @custom:difficulty intermediate
 *
 * This contract maintains an encrypted identity registry where authorized registrars
 * (typically a backend service) can attest to user identity attributes. Birth year is
 * stored encrypted for age verification, while name is stored as a hash for duplicate detection.
 *
 * Key patterns demonstrated:
 * 1. Encrypted birth year (euint8) for age verification
 * 2. Name hash (bytes32) for duplicate detection
 * 3. Age verification using FHE comparisons (le, ge)
 * 4. Role-based access control (registrars)
 * 5. FHE permission management (allowThis, allow)
 */
contract IdentityRegistry is IIdentityRegistry, ZamaEthereumConfig {
    // ============ Encrypted Identity Attributes ============

    /// @notice Encrypted birth year offset from 1900
    mapping(address user => euint8 birthYearOffset) private birthYearOffsets;

    /// @notice Hash of user's full name (not encrypted, bytes32)
    mapping(address user => bytes32 fullNameHash) public fullNameHashes;

    /// @notice Reverse mapping: name hash to address (for duplicate detection)
    mapping(bytes32 nameHash => address user) private nameHashToAddress;

    /// @notice Current year offset from 1900 (e.g., 124 for 2024)
    euint8 private currentYearOffset;

    /// @notice Timestamp of last attestation
    mapping(address user => uint256 timestamp) public attestationTimestamp;

    /// @notice Store age verification results for external queries
    /// @dev Key is keccak256(user, minAge) to support multiple age thresholds
    mapping(bytes32 key => ebool result) private verificationResults;

    // ============ Access Control ============

    /// @notice Owner of the registry
    address public owner;
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    /// @notice Authorized registrars who can attest identities
    mapping(address registrar => bool authorized) public registrars;

    /// @notice Thrown when caller lacks permission for encrypted data
    error AccessProhibited();

    /// @notice Thrown when user has no registered birth year
    error NotRegistered();

    /// @notice Thrown when there is no stored verification result for a given threshold
    error NoVerificationResult();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRegistrar() {
        if (!registrars[msg.sender]) revert OnlyRegistrar();
        _;
    }

    // ============ Constructor ============

    /// @notice Initializes the registry with the deployer as owner and initial registrar
    constructor() {
        owner = msg.sender;
        registrars[msg.sender] = true;
        // Initialize current year offset (e.g., 126 for 2026)
        currentYearOffset = FHE.asEuint8(126);
        FHE.allowThis(currentYearOffset);
        emit RegistrarAdded(msg.sender);
    }

    // ============ Registrar Management ============

    /// @inheritdoc IIdentityRegistry
    function addRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = true;
        emit RegistrarAdded(registrar);
    }

    /// @inheritdoc IIdentityRegistry
    function removeRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = false;
        emit RegistrarRemoved(registrar);
    }

    // ============ Identity Attestation ============

    /// @inheritdoc IIdentityRegistry
    function attestIdentity(
        address user,
        externalEuint8 encBirthYearOffset,
        bytes32 nameHash,
        bytes calldata inputProof
    ) external onlyRegistrar {
        // Check for duplicate name hash
        address existingUser = nameHashToAddress[nameHash];
        if (existingUser != address(0) && existingUser != user) {
            revert DuplicateName();
        }

        // Convert and store encrypted birth year
        euint8 birthYear = FHE.fromExternal(encBirthYearOffset, inputProof);

        // If user already has an identity, clear the old name hash mapping
        if (attestationTimestamp[user] > 0) {
            bytes32 oldNameHash = fullNameHashes[user];
            if (oldNameHash != bytes32(0) && oldNameHash != nameHash) {
                delete nameHashToAddress[oldNameHash];
            }
        }

        birthYearOffsets[user] = birthYear;
        fullNameHashes[user] = nameHash;
        nameHashToAddress[nameHash] = user;

        // Grant contract permission to encrypted value
        FHE.allowThis(birthYear);

        // Grant user permission to their own data
        FHE.allow(birthYear, user);

        attestationTimestamp[user] = block.timestamp;

        emit IdentityAttested(user, msg.sender);
    }

    /// @inheritdoc IIdentityRegistry
    function revokeIdentity(address user) external onlyRegistrar {
        if (attestationTimestamp[user] == 0) revert NotAttested();

        // Clear name hash mapping
        bytes32 nameHash = fullNameHashes[user];
        if (nameHash != bytes32(0)) {
            delete nameHashToAddress[nameHash];
        }

        // Set encrypted values to encrypted zeros
        birthYearOffsets[user] = FHE.asEuint8(0);
        delete fullNameHashes[user];
        attestationTimestamp[user] = 0;

        emit IdentityRevoked(user);
    }

    // ============ Encrypted Queries ============

    /// @inheritdoc IIdentityRegistry
    function getBirthYearOffset(address user) external view returns (euint8) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(birthYearOffsets[user])) revert AccessProhibited();
        return birthYearOffsets[user];
    }

    // ============ Age Verification ============

    /// @inheritdoc IIdentityRegistry
    function isAtLeastAge(address user, uint8 minAge) external returns (ebool) {
        return _isAtLeastAge(user, minAge);
    }

    /// @inheritdoc IIdentityRegistry
    function isOver18(address user) external returns (ebool) {
        return _isAtLeastAge(user, 18);
    }

    /// @inheritdoc IIdentityRegistry
    function getVerificationResult(address user, uint8 minAge) external view returns (ebool) {
        bytes32 key = keccak256(abi.encodePacked(user, minAge));
        ebool result = verificationResults[key];
        if (!FHE.isInitialized(result)) {
            revert NoVerificationResult();
        }
        return result;
    }

    /**
     * @notice Internal implementation of age check
     * @dev Separated to avoid external self-calls which don't work with staticCall
     * @param user Address to check
     * @param minAge Minimum age threshold
     * @return meetsAge Encrypted boolean indicating if user meets the age requirement
     */
    function _isAtLeastAge(address user, uint8 minAge) internal returns (ebool meetsAge) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isInitialized(birthYearOffsets[user])) {
            revert NotRegistered();
        }

        // Calculate: currentYearOffset - minAge
        // This gives us the maximum birth year offset for someone to be minAge years old
        euint8 maxBirthYearOffset = FHE.sub(currentYearOffset, FHE.asEuint8(minAge));

        // User is at least minAge if their birth year offset <= maxBirthYearOffset
        // (Earlier birth year = older person)
        meetsAge = FHE.le(birthYearOffsets[user], maxBirthYearOffset);

        // Store result for later retrieval
        bytes32 key = keccak256(abi.encodePacked(user, minAge));
        verificationResults[key] = meetsAge;

        // Grant caller permission to decrypt the result
        FHE.allowThis(meetsAge);
        FHE.allow(meetsAge, msg.sender);

        return meetsAge;
    }

    /**
     * @notice Update the current year (owner only)
     * @dev In production, this would use a trusted oracle or governance
     * @param newOffset New year offset from 1900
     */
    function updateCurrentYear(uint8 newOffset) external onlyOwner {
        currentYearOffset = FHE.asEuint8(newOffset);
        FHE.allowThis(currentYearOffset);
    }

    // ============ Access Control ============

    /// @inheritdoc IIdentityRegistry
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @inheritdoc IIdentityRegistry
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    /// @inheritdoc IIdentityRegistry
    function grantAccessTo(address grantee) external {
        if (attestationTimestamp[msg.sender] == 0) revert NotAttested();

        FHE.allow(birthYearOffsets[msg.sender], grantee);

        emit AccessGranted(msg.sender, grantee);
    }

    /// @inheritdoc IIdentityRegistry
    function isAttested(address user) external view returns (bool) {
        return attestationTimestamp[user] > 0;
    }
}
