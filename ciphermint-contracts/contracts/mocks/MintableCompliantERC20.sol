// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {CompliantERC20} from "../CompliantERC20.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title MintableCompliantERC20
 * @author Stevens Blockchain Advisory
 * @notice Test-only helper that exposes minting.
 */
contract MintableCompliantERC20 is CompliantERC20 {
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address checker,
        address initialOwner
    ) CompliantERC20(tokenName, tokenSymbol, checker, initialOwner) {}

    /**
     * @notice Owner-only mint using a plaintext amount (integration tests & demos).
     * @param to Recipient address
     * @param amount Plaintext amount (uint64 bounded)
     */
    function mintPlain(address to, uint256 amount) external onlyOwner {
        if (amount == 0 || amount > type(uint64).max) revert TotalSupplyOverflow();
        euint64 a = FHE.asEuint64(uint64(amount));
        _mintTo(to, a);
        _increaseTotalSupply(a);
    }
}
