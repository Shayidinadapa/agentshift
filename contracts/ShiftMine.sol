// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentShift mining — earn SHIFT by clocking in daily shifts
/// @notice A Worker NFT earns SHIFT only during a 24h shift started by
/// clockIn(). Consecutive daily clock-ins build a streak that boosts the
/// rate (+5% per streak day, max +50%). Missing a day ends the shift
/// (no accrual while off shift) and resets the streak. Rewards come from
/// a fixed reserve funded by the deployer; a claim pays at most the
/// remaining reserve, never more.
contract ShiftMine is ReentrancyGuard {
    IERC721 public immutable worker;
    IERC20 public shift;
    IERC721 public immutable agentId;
    address public immutable deployer;
    bool public initialized;

    uint256 public constant SHIFT_DURATION = 1 days;
    uint256 public constant STREAK_WINDOW = 2 days;
    uint256 public constant BASE_RATE_PER_DAY = 100 ether; // 100 SHIFT / day
    uint256 public constant BONUS_BPS_PER_STREAK = 500; // +5% per streak day
    uint256 public constant MAX_BONUS_BPS = 5000; // +50% cap
    uint256 public constant STREAK_CAP = 30;

    struct Shift {
        uint256 lastClockIn;
        uint256 lastUpdate;
        uint256 accrued;
        uint256 streak;
    }

    mapping(uint256 => Shift) public shifts;

    event ClockIn(address indexed agent, uint256 indexed tokenId, uint256 streak, uint256 ratePerDay);
    event Claim(address indexed agent, uint256 indexed tokenId, uint256 amount);

    error NotWorkerOwner();
    error ShiftNotOver();
    error NothingToClaim();
    error NotInitialized();

    constructor(address worker_, address agentId_, address deployer_) {
        require(worker_ != address(0) && agentId_ != address(0) && deployer_ != address(0), "zero addr");
        worker = IERC721(worker_);
        agentId = IERC721(agentId_);
        deployer = deployer_;
    }

    /// @notice One-time wiring of the reward token, callable only by the
    /// deployer. Exists so the token can be deployed with the mine already
    /// funded (split-mint), breaking the token<->mine address circle.
    function initialize(address token_) external {
        require(msg.sender == deployer, "not deployer");
        require(!initialized, "already initialized");
        require(token_ != address(0), "zero token");
        shift = IERC20(token_);
        initialized = true;
    }

    /// @notice Current earning rate for a Worker, in SHIFT per day.
    /// Streak 1 earns the base rate; each further consecutive day adds 5%,
    /// up to +50% (streak 11+).
    function ratePerDay(uint256 tokenId) public view returns (uint256) {
        uint256 streak = shifts[tokenId].streak;
        uint256 bonus = streak > 0 ? (streak - 1) * BONUS_BPS_PER_STREAK : 0;
        if (bonus > MAX_BONUS_BPS) bonus = MAX_BONUS_BPS;
        return (BASE_RATE_PER_DAY * (10_000 + bonus)) / 10_000;
    }

    function _accrualEnd(uint256 tokenId) internal view returns (uint256) {
        uint256 start = shifts[tokenId].lastClockIn;
        if (start == 0) return 0;
        uint256 end = start + SHIFT_DURATION;
        return block.timestamp < end ? block.timestamp : end;
    }

    function _settle(uint256 tokenId) internal {
        Shift storage s = shifts[tokenId];
        if (s.lastClockIn == 0) return;
        uint256 end = _accrualEnd(tokenId);
        if (end > s.lastUpdate) {
            s.accrued += (ratePerDay(tokenId) * (end - s.lastUpdate)) / 1 days;
            s.lastUpdate = end;
        }
    }

    /// @notice Rewards earned so far (settled + accruing in the live shift).
    function pendingReward(uint256 tokenId) public view returns (uint256) {
        Shift storage s = shifts[tokenId];
        uint256 pending = s.accrued;
        if (s.lastClockIn != 0) {
            uint256 end = _accrualEnd(tokenId);
            if (end > s.lastUpdate) {
                pending += (ratePerDay(tokenId) * (end - s.lastUpdate)) / 1 days;
            }
        }
        return pending;
    }

    /// @notice Start a 24h shift. One shift per day; clocking in within
    /// 48h of the previous shift extends the streak, otherwise it resets.
    function clockIn(uint256 tokenId) external nonReentrant {
        if (!initialized) revert NotInitialized();
        if (worker.ownerOf(tokenId) != msg.sender) revert NotWorkerOwner();
        Shift storage s = shifts[tokenId];
        if (s.lastClockIn != 0) {
            if (block.timestamp < s.lastClockIn + SHIFT_DURATION) revert ShiftNotOver();
        }
        _settle(tokenId);
        if (s.lastClockIn != 0 && block.timestamp <= s.lastClockIn + STREAK_WINDOW) {
            s.streak += 1;
            if (s.streak > STREAK_CAP) s.streak = STREAK_CAP;
        } else {
            s.streak = 1;
        }
        s.lastClockIn = block.timestamp;
        s.lastUpdate = block.timestamp;
        emit ClockIn(msg.sender, tokenId, s.streak, ratePerDay(tokenId));
    }

    /// @notice Claim accrued SHIFT. Pays at most the remaining reserve.
    function claim(uint256 tokenId) external nonReentrant {
        if (!initialized) revert NotInitialized();
        if (worker.ownerOf(tokenId) != msg.sender) revert NotWorkerOwner();
        _settle(tokenId);
        Shift storage s = shifts[tokenId];
        uint256 amount = s.accrued;
        if (amount == 0) revert NothingToClaim();
        uint256 reserve = shift.balanceOf(address(this));
        if (amount > reserve) amount = reserve;
        if (amount == 0) revert NothingToClaim();
        s.accrued -= amount;
        shift.transfer(msg.sender, amount);
        emit Claim(msg.sender, tokenId, amount);
    }
}
