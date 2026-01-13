// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint8, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";

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

    /// @notice Thrown when a duplicate name hash is detected
    error DuplicateName();

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
    /// @param nameHash Hash of the user's full name (bytes32, not encrypted)
    /// @param inputProof Proof for external encrypted values
    function attestIdentity(
        address user,
        externalEuint8 encBirthYearOffset,
        bytes32 nameHash,
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

    // ============ Age Verification ============

    /// @notice Check if user is at least the specified age
    /// @param user Address to check
    /// @param minAge Minimum age threshold (plaintext, e.g., 18)
    /// @return Encrypted boolean (caller must have permission to decrypt)
    function isAtLeastAge(address user, uint8 minAge) external returns (ebool);

    /// @notice Convenience function to check if user is over 18
    /// @param user Address to check
    /// @return Encrypted boolean indicating if user is 18 or older
    function isOver18(address user) external returns (ebool);

    /// @notice Get the last verification result for a user and age threshold
    /// @param user Address that was checked
    /// @param minAge Age threshold that was used
    /// @return Encrypted boolean result (caller must have permission to decrypt)
    function getVerificationResult(address user, uint8 minAge) external view returns (ebool);

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
