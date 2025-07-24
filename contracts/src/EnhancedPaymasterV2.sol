// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC20Paymaster.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title EnhancedPaymasterV2
 * @notice Advanced paymaster with multi-sig governance, tiered limits, and risk management
 * @dev Extends ERC20Paymaster with comprehensive security and limit features
 */
contract EnhancedPaymasterV2 is ERC20Paymaster, Pausable {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct UserProfile {
        uint256 tier; // 0: default, 1: verified, 2: premium, 3: unlimited
        uint256 dailyLimit;
        uint256 monthlyLimit;
        uint256 dailySpent;
        uint256 monthlySpent;
        uint256 lastDailyReset;
        uint256 lastMonthlyReset;
        uint256 totalSpent;
        uint256 transactionCount;
        bool isBlacklisted;
        bool customLimits;
    }

    struct GlobalLimits {
        uint256 hourlyLimit;
        uint256 dailyLimit;
        uint256 monthlyLimit;
        uint256 hourlySpent;
        uint256 dailySpent;
        uint256 monthlySpent;
        uint256 lastHourlyReset;
        uint256 lastDailyReset;
        uint256 lastMonthlyReset;
    }

    struct TierConfig {
        uint256 dailyLimit;
        uint256 monthlyLimit;
        uint256 maxTransactionSize;
        uint256 requiredStake; // Amount of governance tokens to stake
        string name;
    }

    struct RiskParameters {
        uint256 velocityThreshold; // Max transactions per hour
        uint256 concentrationLimit; // Max % of daily limit in single tx
        uint256 cooldownPeriod; // Time between large transactions
        bool enabled;
    }

    // State variables
    mapping(address => UserProfile) public userProfiles;
    mapping(uint256 => TierConfig) public tierConfigs;
    mapping(address => bool) public guardians;
    mapping(bytes32 => uint256) public emergencyProposals;
    mapping(bytes32 => mapping(address => bool)) public proposalSignatures;
    
    EnumerableSet.AddressSet private blacklistedTokens;
    GlobalLimits public globalLimits;
    RiskParameters public riskParams;
    
    uint256 public constant GUARDIAN_THRESHOLD = 3;
    uint256 public constant MAX_TIER = 3;
    uint256 public emergencyWithdrawalDelay = 24 hours;
    address public riskManager;
    address public stakingContract;
    
    // Events
    event UserTierUpdated(address indexed user, uint256 oldTier, uint256 newTier);
    event CustomLimitSet(address indexed user, uint256 dailyLimit, uint256 monthlyLimit);
    event UserBlacklisted(address indexed user, bool status);
    event GuardianAction(bytes32 indexed proposalId, address indexed guardian, string action);
    event RiskParametersUpdated(uint256 velocity, uint256 concentration, uint256 cooldown);
    event EmergencyWithdrawal(address indexed token, uint256 amount);
    event SuspiciousActivity(address indexed user, string reason);

    modifier onlyGuardian() {
        require(guardians[msg.sender], "Not a guardian");
        _;
    }

    modifier onlyRiskManager() {
        require(msg.sender == riskManager || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier notBlacklisted(address user) {
        require(!userProfiles[user].isBlacklisted, "User blacklisted");
        _;
    }

    constructor(
        IEntryPoint _entryPoint,
        address _riskManager,
        address _stakingContract
    ) ERC20Paymaster(_entryPoint) {
        riskManager = _riskManager;
        stakingContract = _stakingContract;
        
        // Initialize tier configs
        tierConfigs[0] = TierConfig({
            dailyLimit: 100 * 1e6, // 100 USDC
            monthlyLimit: 1000 * 1e6, // 1,000 USDC
            maxTransactionSize: 50 * 1e6, // 50 USDC
            requiredStake: 0,
            name: "Basic"
        });
        
        tierConfigs[1] = TierConfig({
            dailyLimit: 1000 * 1e6, // 1,000 USDC
            monthlyLimit: 10000 * 1e6, // 10,000 USDC
            maxTransactionSize: 500 * 1e6, // 500 USDC
            requiredStake: 100 * 1e18, // 100 tokens
            name: "Verified"
        });
        
        tierConfigs[2] = TierConfig({
            dailyLimit: 10000 * 1e6, // 10,000 USDC
            monthlyLimit: 100000 * 1e6, // 100,000 USDC
            maxTransactionSize: 5000 * 1e6, // 5,000 USDC
            requiredStake: 1000 * 1e18, // 1,000 tokens
            name: "Premium"
        });
        
        tierConfigs[3] = TierConfig({
            dailyLimit: type(uint256).max,
            monthlyLimit: type(uint256).max,
            maxTransactionSize: type(uint256).max,
            requiredStake: 10000 * 1e18, // 10,000 tokens
            name: "Unlimited"
        });
        
        // Initialize global limits
        globalLimits = GlobalLimits({
            hourlyLimit: 50000 * 1e6, // 50k USDC
            dailyLimit: 500000 * 1e6, // 500k USDC
            monthlyLimit: 10000000 * 1e6, // 10M USDC
            hourlySpent: 0,
            dailySpent: 0,
            monthlySpent: 0,
            lastHourlyReset: block.timestamp,
            lastDailyReset: block.timestamp,
            lastMonthlyReset: block.timestamp
        });
        
        // Initialize risk parameters
        riskParams = RiskParameters({
            velocityThreshold: 10, // Max 10 tx per hour
            concentrationLimit: 50, // Max 50% of daily limit
            cooldownPeriod: 1 hours,
            enabled: true
        });
    }

    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override whenNotPaused notBlacklisted(userOp.sender) returns (bytes memory context, uint256 validationData) {
        (IERC20 token, uint256 exchangeRate) = _decodePaymasterData(userOp.paymasterAndData);
        
        require(!blacklistedTokens.contains(address(token)), "Token blacklisted");
        require(priceOracles[token] != AggregatorV3Interface(address(0)), "Unsupported token");
        
        uint256 tokenAmount = (maxCost * exchangeRate) / 1e18;
        tokenAmount = (tokenAmount * priceMarkup[token]) / PRICE_DENOMINATOR;
        
        // Check user limits
        _checkUserLimits(userOp.sender, tokenAmount);
        
        // Check global limits
        _checkGlobalLimits(tokenAmount);
        
        // Risk checks
        if (riskParams.enabled) {
            _performRiskChecks(userOp.sender, tokenAmount);
        }
        
        require(token.balanceOf(userOp.sender) >= tokenAmount, "Insufficient balance");
        require(token.allowance(userOp.sender, address(this)) >= tokenAmount, "Insufficient allowance");
        
        return (abi.encode(userOp.sender, token, exchangeRate, tokenAmount), 0);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        (address user, IERC20 token, uint256 exchangeRate, uint256 preCharge) = 
            abi.decode(context, (address, IERC20, uint256, uint256));
        
        uint256 actualTokenCost = (actualGasCost * exchangeRate) / 1e18;
        actualTokenCost = (actualTokenCost * priceMarkup[token]) / PRICE_DENOMINATOR;
        
        // Update spending records
        _updateSpending(user, actualTokenCost);
        
        // Call parent implementation
        super._postOp(mode, context, actualGasCost);
    }

    function _checkUserLimits(address user, uint256 amount) private view {
        UserProfile memory profile = userProfiles[user];
        uint256 tier = profile.tier;
        
        // Get limits based on tier or custom limits
        uint256 dailyLimit = profile.customLimits ? profile.dailyLimit : tierConfigs[tier].dailyLimit;
        uint256 monthlyLimit = profile.customLimits ? profile.monthlyLimit : tierConfigs[tier].monthlyLimit;
        uint256 maxTxSize = tierConfigs[tier].maxTransactionSize;
        
        // Check transaction size
        require(amount <= maxTxSize, "Transaction too large for tier");
        
        // Check daily limit
        uint256 dailySpent = _getCurrentDailySpent(user);
        require(dailySpent + amount <= dailyLimit, "Daily limit exceeded");
        
        // Check monthly limit
        uint256 monthlySpent = _getCurrentMonthlySpent(user);
        require(monthlySpent + amount <= monthlyLimit, "Monthly limit exceeded");
    }

    function _checkGlobalLimits(uint256 amount) private view {
        GlobalLimits memory limits = globalLimits;
        
        // Check hourly limit
        uint256 hourlySpent = block.timestamp > limits.lastHourlyReset + 1 hours ? 
            0 : limits.hourlySpent;
        require(hourlySpent + amount <= limits.hourlyLimit, "Global hourly limit exceeded");
        
        // Check daily limit
        uint256 dailySpent = block.timestamp > limits.lastDailyReset + 1 days ? 
            0 : limits.dailySpent;
        require(dailySpent + amount <= limits.dailyLimit, "Global daily limit exceeded");
        
        // Check monthly limit
        uint256 monthlySpent = block.timestamp > limits.lastMonthlyReset + 30 days ? 
            0 : limits.monthlySpent;
        require(monthlySpent + amount <= limits.monthlyLimit, "Global monthly limit exceeded");
    }

    function _performRiskChecks(address user, uint256 amount) private view {
        UserProfile memory profile = userProfiles[user];
        
        // Velocity check
        if (profile.transactionCount > riskParams.velocityThreshold) {
            revert("Velocity threshold exceeded");
        }
        
        // Concentration check
        uint256 dailyLimit = profile.customLimits ? 
            profile.dailyLimit : tierConfigs[profile.tier].dailyLimit;
        uint256 concentrationPercent = (amount * 100) / dailyLimit;
        
        if (concentrationPercent > riskParams.concentrationLimit) {
            revert("Concentration limit exceeded");
        }
    }

    function _updateSpending(address user, uint256 amount) private {
        UserProfile storage profile = userProfiles[user];
        
        // Reset counters if needed
        if (block.timestamp > profile.lastDailyReset + 1 days) {
            profile.dailySpent = 0;
            profile.lastDailyReset = block.timestamp;
            profile.transactionCount = 0;
        }
        
        if (block.timestamp > profile.lastMonthlyReset + 30 days) {
            profile.monthlySpent = 0;
            profile.lastMonthlyReset = block.timestamp;
        }
        
        // Update user spending
        profile.dailySpent += amount;
        profile.monthlySpent += amount;
        profile.totalSpent += amount;
        profile.transactionCount++;
        
        // Update global spending
        _updateGlobalSpending(amount);
    }

    function _updateGlobalSpending(uint256 amount) private {
        // Reset counters if needed
        if (block.timestamp > globalLimits.lastHourlyReset + 1 hours) {
            globalLimits.hourlySpent = 0;
            globalLimits.lastHourlyReset = block.timestamp;
        }
        
        if (block.timestamp > globalLimits.lastDailyReset + 1 days) {
            globalLimits.dailySpent = 0;
            globalLimits.lastDailyReset = block.timestamp;
        }
        
        if (block.timestamp > globalLimits.lastMonthlyReset + 30 days) {
            globalLimits.monthlySpent = 0;
            globalLimits.lastMonthlyReset = block.timestamp;
        }
        
        // Update spending
        globalLimits.hourlySpent += amount;
        globalLimits.dailySpent += amount;
        globalLimits.monthlySpent += amount;
    }

    function _getCurrentDailySpent(address user) private view returns (uint256) {
        UserProfile memory profile = userProfiles[user];
        return block.timestamp > profile.lastDailyReset + 1 days ? 0 : profile.dailySpent;
    }

    function _getCurrentMonthlySpent(address user) private view returns (uint256) {
        UserProfile memory profile = userProfiles[user];
        return block.timestamp > profile.lastMonthlyReset + 30 days ? 0 : profile.monthlySpent;
    }

    // Admin functions
    function setUserTier(address user, uint256 tier) external onlyOwner {
        require(tier <= MAX_TIER, "Invalid tier");
        uint256 oldTier = userProfiles[user].tier;
        userProfiles[user].tier = tier;
        emit UserTierUpdated(user, oldTier, tier);
    }

    function setCustomLimits(
        address user,
        uint256 dailyLimit,
        uint256 monthlyLimit
    ) external onlyOwner {
        userProfiles[user].customLimits = true;
        userProfiles[user].dailyLimit = dailyLimit;
        userProfiles[user].monthlyLimit = monthlyLimit;
        emit CustomLimitSet(user, dailyLimit, monthlyLimit);
    }

    function setUserBlacklist(address user, bool status) external onlyRiskManager {
        userProfiles[user].isBlacklisted = status;
        emit UserBlacklisted(user, status);
    }

    function setRiskParameters(
        uint256 velocity,
        uint256 concentration,
        uint256 cooldown,
        bool enabled
    ) external onlyRiskManager {
        riskParams = RiskParameters(velocity, concentration, cooldown, enabled);
        emit RiskParametersUpdated(velocity, concentration, cooldown);
    }

    function addGuardian(address guardian) external onlyOwner {
        guardians[guardian] = true;
    }

    function removeGuardian(address guardian) external onlyOwner {
        guardians[guardian] = false;
    }

    // Emergency functions
    function proposeEmergencyAction(string memory action) external onlyGuardian returns (bytes32) {
        bytes32 proposalId = keccak256(abi.encodePacked(action, block.timestamp, msg.sender));
        emergencyProposals[proposalId] = 1;
        proposalSignatures[proposalId][msg.sender] = true;
        emit GuardianAction(proposalId, msg.sender, action);
        return proposalId;
    }

    function signEmergencyAction(bytes32 proposalId) external onlyGuardian {
        require(emergencyProposals[proposalId] > 0, "Invalid proposal");
        require(!proposalSignatures[proposalId][msg.sender], "Already signed");
        
        proposalSignatures[proposalId][msg.sender] = true;
        emergencyProposals[proposalId]++;
        
        if (emergencyProposals[proposalId] >= GUARDIAN_THRESHOLD) {
            _pause();
        }
        
        emit GuardianAction(proposalId, msg.sender, "signed");
    }

    function emergencyWithdraw(IERC20 token, uint256 amount) external onlyOwner {
        require(block.timestamp > emergencyWithdrawalDelay, "Withdrawal delay not met");
        token.transfer(owner(), amount);
        emit EmergencyWithdrawal(address(token), amount);
    }

    function pause() external onlyGuardian {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // View functions
    function getUserProfile(address user) external view returns (UserProfile memory) {
        return userProfiles[user];
    }

    function getUserLimits(address user) external view returns (
        uint256 dailyLimit,
        uint256 dailySpent,
        uint256 dailyRemaining,
        uint256 monthlyLimit,
        uint256 monthlySpent,
        uint256 monthlyRemaining
    ) {
        UserProfile memory profile = userProfiles[user];
        
        dailyLimit = profile.customLimits ? profile.dailyLimit : tierConfigs[profile.tier].dailyLimit;
        dailySpent = _getCurrentDailySpent(user);
        dailyRemaining = dailyLimit > dailySpent ? dailyLimit - dailySpent : 0;
        
        monthlyLimit = profile.customLimits ? profile.monthlyLimit : tierConfigs[profile.tier].monthlyLimit;
        monthlySpent = _getCurrentMonthlySpent(user);
        monthlyRemaining = monthlyLimit > monthlySpent ? monthlyLimit - monthlySpent : 0;
    }

    function getGlobalStatus() external view returns (
        uint256 hourlySpent,
        uint256 hourlyRemaining,
        uint256 dailySpent,
        uint256 dailyRemaining,
        uint256 monthlySpent,
        uint256 monthlyRemaining
    ) {
        GlobalLimits memory limits = globalLimits;
        
        hourlySpent = block.timestamp > limits.lastHourlyReset + 1 hours ? 0 : limits.hourlySpent;
        hourlyRemaining = limits.hourlyLimit > hourlySpent ? limits.hourlyLimit - hourlySpent : 0;
        
        dailySpent = block.timestamp > limits.lastDailyReset + 1 days ? 0 : limits.dailySpent;
        dailyRemaining = limits.dailyLimit > dailySpent ? limits.dailyLimit - dailySpent : 0;
        
        monthlySpent = block.timestamp > limits.lastMonthlyReset + 30 days ? 0 : limits.monthlySpent;
        monthlyRemaining = limits.monthlyLimit > monthlySpent ? limits.monthlyLimit - monthlySpent : 0;
    }
}