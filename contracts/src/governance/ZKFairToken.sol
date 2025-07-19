// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ZKFairToken
 * @notice Governance token for the ZKFair L2 protocol
 * @dev ERC20 token with voting capabilities, permit, and burn functionality
 */
contract ZKFairToken is 
    ERC20, 
    ERC20Permit, 
    ERC20Votes, 
    ERC20Burnable,
    Ownable,
    Pausable 
{
    // Token distribution constants
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_MINT = 100_000_000 * 10**18; // 100 million tokens
    
    // Vesting and distribution
    uint256 public constant TEAM_ALLOCATION = 200_000_000 * 10**18; // 20%
    uint256 public constant ECOSYSTEM_ALLOCATION = 300_000_000 * 10**18; // 30%
    uint256 public constant COMMUNITY_ALLOCATION = 400_000_000 * 10**18; // 40%
    uint256 public constant LIQUIDITY_ALLOCATION = 100_000_000 * 10**18; // 10%
    
    // Vesting schedules
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliffDuration;
        uint256 vestingDuration;
        uint256 released;
    }
    
    mapping(address => VestingSchedule) public vestingSchedules;
    
    // Token distribution tracking
    uint256 public totalMinted;
    uint256 public ecosystemDistributed;
    uint256 public communityDistributed;
    
    // Events
    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration
    );
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event EcosystemDistribution(address indexed recipient, uint256 amount);
    event CommunityDistribution(address indexed recipient, uint256 amount);
    
    constructor() 
        ERC20("ZKFair Token", "ZKF")
        ERC20Permit("ZKFair Token")
    {
        // Mint initial supply to deployer for initial liquidity
        _mint(msg.sender, INITIAL_MINT);
        totalMinted = INITIAL_MINT;
    }
    
    /**
     * @notice Create a vesting schedule for team members
     * @param beneficiary Address that will receive the tokens
     * @param amount Total amount of tokens to vest
     * @param cliffDuration Cliff period in seconds
     * @param vestingDuration Total vesting period in seconds (including cliff)
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyOwner {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Invalid amount");
        require(vestingDuration >= cliffDuration, "Invalid vesting duration");
        require(vestingSchedules[beneficiary].totalAmount == 0, "Schedule already exists");
        require(totalMinted + amount <= MAX_SUPPLY, "Exceeds max supply");
        require(amount <= TEAM_ALLOCATION, "Exceeds team allocation");
        
        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            released: 0
        });
        
        emit VestingScheduleCreated(
            beneficiary,
            amount,
            block.timestamp,
            cliffDuration,
            vestingDuration
        );
    }
    
    /**
     * @notice Release vested tokens
     * @param beneficiary Address to release tokens for
     */
    function releaseVestedTokens(address beneficiary) external {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        require(schedule.totalAmount > 0, "No vesting schedule");
        
        uint256 releasable = _computeReleasableAmount(schedule);
        require(releasable > 0, "No tokens to release");
        
        schedule.released += releasable;
        totalMinted += releasable;
        
        _mint(beneficiary, releasable);
        emit TokensReleased(beneficiary, releasable);
    }
    
    /**
     * @notice Distribute tokens from ecosystem allocation
     * @param recipient Address to receive tokens
     * @param amount Amount of tokens to distribute
     */
    function distributeEcosystemTokens(address recipient, uint256 amount) 
        external 
        onlyOwner 
    {
        require(recipient != address(0), "Invalid recipient");
        require(
            ecosystemDistributed + amount <= ECOSYSTEM_ALLOCATION,
            "Exceeds ecosystem allocation"
        );
        require(totalMinted + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        ecosystemDistributed += amount;
        totalMinted += amount;
        
        _mint(recipient, amount);
        emit EcosystemDistribution(recipient, amount);
    }
    
    /**
     * @notice Distribute tokens from community allocation
     * @param recipient Address to receive tokens
     * @param amount Amount of tokens to distribute
     */
    function distributeCommunityTokens(address recipient, uint256 amount) 
        external 
        onlyOwner 
    {
        require(recipient != address(0), "Invalid recipient");
        require(
            communityDistributed + amount <= COMMUNITY_ALLOCATION,
            "Exceeds community allocation"
        );
        require(totalMinted + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        communityDistributed += amount;
        totalMinted += amount;
        
        _mint(recipient, amount);
        emit CommunityDistribution(recipient, amount);
    }
    
    /**
     * @notice Compute releasable amount for a vesting schedule
     * @param schedule Vesting schedule to compute for
     * @return Amount of tokens that can be released
     */
    function _computeReleasableAmount(VestingSchedule memory schedule) 
        private 
        view 
        returns (uint256) 
    {
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) {
            return 0;
        }
        
        uint256 elapsedTime = block.timestamp - schedule.startTime;
        
        if (elapsedTime >= schedule.vestingDuration) {
            return schedule.totalAmount - schedule.released;
        }
        
        uint256 vestedAmount = (schedule.totalAmount * elapsedTime) / schedule.vestingDuration;
        return vestedAmount - schedule.released;
    }
    
    /**
     * @notice Get releasable amount for a beneficiary
     * @param beneficiary Address to check
     * @return Amount of tokens that can be released
     */
    function getReleasableAmount(address beneficiary) external view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        if (schedule.totalAmount == 0) {
            return 0;
        }
        return _computeReleasableAmount(schedule);
    }
    
    /**
     * @notice Pause token transfers
     * @dev Only callable by owner in emergency situations
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause token transfers
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // Override required functions
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
    
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) 
        internal 
        override(ERC20, ERC20Votes) 
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }
}