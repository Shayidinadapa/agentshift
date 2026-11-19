// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title AgentShift Worker — soulbound NFT for Binance Agent ID holders
/// @notice Free mint (gas only), max 1 per address, only for wallets holding
/// a SPACE ID Agent ID (Binance Agentic Wallet identity). Non-transferable,
/// so the Worker stays bound to the agent identity that earned it.
contract WorkerNFT is ERC721 {
    IERC721 public immutable agentId;
    uint256 public nextTokenId;

    error NeedAgentId();
    error AlreadyHasWorker();
    error Soulbound();

    constructor(address agentId_) ERC721("AgentShift Worker", "ASW") {
        require(agentId_ != address(0), "zero agentId");
        agentId = IERC721(agentId_);
    }

    /// @notice Mint one Worker. Caller must hold an Agent ID and not
    /// already own a Worker.
    function mint() external returns (uint256 tokenId) {
        if (agentId.balanceOf(msg.sender) == 0) revert NeedAgentId();
        if (balanceOf(msg.sender) != 0) revert AlreadyHasWorker();
        tokenId = ++nextTokenId;
        _safeMint(msg.sender, tokenId);
    }

    /// @notice Soulbound: only minting is allowed, transfers and burns revert.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
