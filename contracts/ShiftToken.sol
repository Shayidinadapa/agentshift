// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AgentShift reward token
/// @notice Fixed-supply ERC20. 10,000,000 SHIFT minted once at deploy:
/// half funds the ShiftMine rewards reserve, half goes to the deployer.
/// No further minting is possible. The split-mint exists so the reserve
/// is funded inside the deployment transaction itself.
contract ShiftToken is ERC20 {
    uint256 public constant MAX_SUPPLY = 10_000_000 ether;
    uint256 public constant MINE_RESERVE = 5_000_000 ether;

    constructor(address mine, address holder) ERC20("AgentShift", "SHIFT") {
        require(mine != address(0) && holder != address(0), "zero addr");
        _mint(mine, MINE_RESERVE);
        _mint(holder, MAX_SUPPLY - MINE_RESERVE);
    }
}
