// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint8, euint16, ebool, externalEuint8, externalEuint16, externalEbool} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title IIdentityRegistry
 * @notice Interface for the encrypted identity registry contract
 * @dev Defines the interface for managing encrypted identity attributes and verification
 */
interface IIdentityRegistry {
    // ============ Errors ============

    /// @notice Thrown when caller is not the owner
    error OnlyOwner();

    /// @notice Thrown when caller is not an authorized registrar
    error OnlyRegistrar();

    /// @notice Thrown when identity has not been attested for a user
    error NotAttested();

    /// @notice Thrown when an invalid owner address is provided
    error InvalidOwner();

    /// @notice Thrown when caller is not the pending owner
    error OnlyPendingOwner();

    // ============ Events ============

    /// @notice Emitted when a new registrar is added
    /// @param registrar Address of the added registrar
    event RegistrarAdded(address indexed registrar);

    /// @notice Emitted when a registrar is removed
    /// @param registrar Address of the removed registrar
    event RegistrarRemoved(address indexed registrar);

    /// @notice Emitted when an identity is attested for a user
    /// @param user Address of the user whose identity was attested
    /// @param registrar Address of the registrar who performed the attestation
    event IdentityAttested(address indexed user, address indexed registrar);

    /// @notice Emitted when an identity is revoked for a user
    /// @param user Address of the user whose identity was revoked
    event IdentityRevoked(address indexed user);

    /// @notice Emitted when ownership transfer is initiated
    /// @param previousOwner Address of the current owner
    /// @param newOwner Address of the pending new owner
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when ownership is transferred
    /// @param previousOwner Address of the previous owner
    /// @param newOwner Address of the new owner
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when a user grants access to their encrypted data
    /// @param user Address of the user granting access
    /// @param grantee Address receiving access
    event AccessGranted(address indexed user, address indexed grantee);

    // ============ Registrar Management ============

    /// @notice Add an authorized registrar
    /// @param registrar Address of the registrar to add
    function addRegistrar(address registrar) external;

    /// @notice Remove an authorized registrar
    /// @param registrar Address of the registrar to remove
    function removeRegistrar(address registrar) external;

    // ============ Identity Attestation ============

    /// @notice Attest identity attributes for a user
    /// @param user Address of the user
    /// @param encBirthYearOffset Encrypted birth year offset from 1900
    /// @param encCountryCode Encrypted country code (ISO 3166-1 numeric)
    /// @param encKycLevel Encrypted KYC verification level (0-5)
    /// @param encIsBlacklisted Encrypted blacklist status
    /// @param inputProof Proof for external encrypted values
    function attestIdentity(
        address user,
        externalEuint8 encBirthYearOffset,
        externalEuint16 encCountryCode,
        externalEuint8 encKycLevel,
        externalEbool encIsBlacklisted,
        bytes calldata inputProof
    ) external;

    /// @notice Revoke identity for a user
    /// @param user Address of the user whose identity should be revoked
    function revokeIdentity(address user) external;

    // ============ Encrypted Queries ============

    /// @notice Get encrypted birth year offset for a user
    /// @param user Address of the user
    /// @return Encrypted birth year offset
    function getBirthYearOffset(address user) external view returns (euint8);

    /// @notice Get encrypted country code for a user
    /// @param user Address of the user
    /// @return Encrypted country code
    function getCountryCode(address user) external view returns (euint16);

    /// @notice Get encrypted KYC level for a user
    /// @param user Address of the user
    /// @return Encrypted KYC level
    function getKycLevel(address user) external view returns (euint8);

    /// @notice Get encrypted blacklist status for a user
    /// @param user Address of the user
    /// @return Encrypted blacklist status
    function getBlacklistStatus(address user) external view returns (ebool);

    // ============ Verification Helpers ============

    /// @notice Check if user has minimum KYC level
    /// @param user Address of the user
    /// @param minLevel Minimum KYC level required
    /// @return Encrypted boolean result
    function hasMinKycLevel(address user, uint8 minLevel) external returns (ebool);

    /// @notice Check if user is from a specific country
    /// @param user Address of the user
    /// @param country Country code to check
    /// @return Encrypted boolean result
    function isFromCountry(address user, uint16 country) external returns (ebool);

    /// @notice Check if user is not blacklisted
    /// @param user Address of the user
    /// @return Encrypted boolean result
    function isNotBlacklisted(address user) external returns (ebool);

    // ============ Access Control ============

    /// @notice Initiate ownership transfer
    /// @param newOwner Address of the new owner
    function transferOwnership(address newOwner) external;

    /// @notice Accept ownership transfer
    function acceptOwnership() external;

    /// @notice Grant access to encrypted identity data
    /// @param grantee Address to grant access to
    function grantAccessTo(address grantee) external;

    /// @notice Check if a user has an attested identity
    /// @param user Address of the user
    /// @return True if identity is attested, false otherwise
    function isAttested(address user) external view returns (bool);
}
