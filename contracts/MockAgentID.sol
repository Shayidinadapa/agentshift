// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Test-only mock of the SPACE ID Agent ID contract. NOT deployed
/// to mainnet; local tests use it so WorkerNFT gating can be exercised.
contract MockAgentID is ERC721 {
    uint256 public nextId;

    constructor() ERC721("Mock Agent ID", "MAI") {}

    function mint(address to) external returns (uint256 id) {
        id = ++nextId;
        _safeMint(to, id);
    }
}
