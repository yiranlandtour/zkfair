// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC20Paymaster.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract EnhancedPaymaster is ERC20Paymaster, Pausable {
    struct UserLimits {
        uint256 dailyLimit;
        uint256 dailySpent;
        uint256 lastResetTime;
        bool isWhitelisted;
    }
    
    mapping(address => UserLimits) public userLimits;
    mapping(address => bool) public guardians;
    mapping(bytes32 => mapping(address => bool)) public emergencyActions;
    
    uint256 public constant DEFAULT_DAILY_LIMIT = 1000 * 1e6; // 1000 USDC
    uint256 public constant GUARDIAN_THRESHOLD = 2;
    uint256 public globalDailyLimit = 100000 * 1e6; // 100k USDC
    uint256 public globalDailySpent;
    uint256 public globalLastResetTime;
    
    event DailyLimitUpdated(address indexed user, uint256 newLimit);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event EmergencyActionExecuted(bytes32 indexed actionId, address indexed executor);
    event UserWhitelisted(address indexed user, bool status);
    
    modifier onlyGuardian() {
        require(guardians[msg.sender], "Not a guardian");
        _;
    }
    
    modifier withinDailyLimit(address user, uint256 amount) {
        UserLimits storage limits = userLimits[user];
        
        // Reset daily counters if needed
        if (block.timestamp > limits.lastResetTime + 1 days) {
            limits.dailySpent = 0;
            limits.lastResetTime = block.timestamp;
        }
        
        if (block.timestamp > globalLastResetTime + 1 days) {
            globalDailySpent = 0;
            globalLastResetTime = block.timestamp;
        }
        
        uint256 userDailyLimit = limits.dailyLimit > 0 ? limits.dailyLimit : DEFAULT_DAILY_LIMIT;
        
        // Skip limits for whitelisted users
        if (!limits.isWhitelisted) {
            require(limits.dailySpent + amount <= userDailyLimit, "User daily limit exceeded");
            require(globalDailySpent + amount <= globalDailyLimit, "Global daily limit exceeded");
        }
        
        limits.dailySpent += amount;
        globalDailySpent += amount;
        _;
    }
    
    constructor(IEntryPoint _entryPoint) ERC20Paymaster(_entryPoint) {
        guardians[msg.sender] = true;
        globalLastResetTime = block.timestamp;
    }
    
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override whenNotPaused returns (bytes memory context, uint256 validationData) {
        (IERC20 token, uint256 exchangeRate) = _decodePaymasterData(userOp.paymasterAndData);
        
        require(priceOracles[token] != AggregatorV3Interface(address(0)), "Unsupported token");
        
        uint256 tokenAmount = (maxCost * exchangeRate) / 1e18;
        tokenAmount = (tokenAmount * priceMarkup[token]) / PRICE_DENOMINATOR;
        
        // Check limits
        UserLimits storage limits = userLimits[userOp.sender];
        if (!limits.isWhitelisted) {
            uint256 userDailyLimit = limits.dailyLimit > 0 ? limits.dailyLimit : DEFAULT_DAILY_LIMIT;
            require(limits.dailySpent + tokenAmount <= userDailyLimit, "Would exceed daily limit");
        }
        
        require(token.balanceOf(userOp.sender) >= tokenAmount, "Insufficient balance");
        require(token.allowance(userOp.sender, address(this)) >= tokenAmount, "Insufficient allowance");
        
        return (abi.encode(userOp.sender, token, exchangeRate, tokenAmount), 0);
    }
    
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override withinDailyLimit(
        abi.decode(context, (address, IERC20, uint256, uint256))[0],
        abi.decode(context, (address, IERC20, uint256, uint256))[3]
    ) {
        super._postOp(mode, context, actualGasCost);
    }
    
    // Admin functions
    function setUserDailyLimit(address user, uint256 limit) external onlyOwner {
        userLimits[user].dailyLimit = limit;
        emit DailyLimitUpdated(user, limit);
    }
    
    function setUserWhitelisted(address user, bool status) external onlyOwner {
        userLimits[user].isWhitelisted = status;
        emit UserWhitelisted(user, status);
    }
    
    function addGuardian(address guardian) external onlyOwner {
        guardians[guardian] = true;
        emit GuardianAdded(guardian);
    }
    
    function removeGuardian(address guardian) external onlyOwner {
        guardians[guardian] = false;
        emit GuardianRemoved(guardian);
    }
    
    // Emergency functions
    function pause() external onlyGuardian {
        bytes32 actionId = keccak256(abi.encodePacked("pause", block.timestamp));
        require(!emergencyActions[actionId][msg.sender], "Already signed");
        
        emergencyActions[actionId][msg.sender] = true;
        
        uint256 signatures = 0;
        // Count guardian signatures (in production, track guardian list)
        if (emergencyActions[actionId][msg.sender]) signatures++;
        
        if (signatures >= GUARDIAN_THRESHOLD) {
            _pause();
            emit EmergencyActionExecuted(actionId, msg.sender);
        }
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // View functions
    function getUserLimits(address user) external view returns (
        uint256 dailyLimit,
        uint256 dailySpent,
        uint256 dailyRemaining,
        bool isWhitelisted
    ) {
        UserLimits memory limits = userLimits[user];
        dailyLimit = limits.dailyLimit > 0 ? limits.dailyLimit : DEFAULT_DAILY_LIMIT;
        
        if (block.timestamp > limits.lastResetTime + 1 days) {
            dailySpent = 0;
            dailyRemaining = dailyLimit;
        } else {
            dailySpent = limits.dailySpent;
            dailyRemaining = dailyLimit > dailySpent ? dailyLimit - dailySpent : 0;
        }
        
        isWhitelisted = limits.isWhitelisted;
    }
    
    function getGlobalLimits() external view returns (
        uint256 limit,
        uint256 spent,
        uint256 remaining
    ) {
        limit = globalDailyLimit;
        
        if (block.timestamp > globalLastResetTime + 1 days) {
            spent = 0;
            remaining = limit;
        } else {
            spent = globalDailySpent;
            remaining = limit > spent ? limit - spent : 0;
        }
    }
}