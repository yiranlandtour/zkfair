// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FeeCollector
 * @notice Collects and distributes protocol fees from various sources
 * @dev Supports multiple tokens and configurable distribution ratios
 */
contract FeeCollector is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct FeeDistribution {
        address recipient;
        uint256 percentage; // Basis points (10000 = 100%)
        string description;
    }

    struct TokenFees {
        uint256 totalCollected;
        uint256 totalDistributed;
        uint256 pendingDistribution;
    }

    // Events
    event FeeCollected(address indexed token, uint256 amount, address indexed from);
    event FeeDistributed(address indexed token, address indexed recipient, uint256 amount);
    event DistributionUpdated(address indexed recipient, uint256 percentage);
    event RecipientAdded(address indexed recipient, uint256 percentage, string description);
    event RecipientRemoved(address indexed recipient);
    event EmergencyWithdraw(address indexed token, address indexed recipient, uint256 amount);

    // Constants
    uint256 public constant PERCENTAGE_BASE = 10000; // 100%
    uint256 public constant MAX_RECIPIENTS = 10;

    // State variables
    FeeDistribution[] public distributions;
    mapping(address => uint256) public recipientIndex; // recipient => index in distributions array
    mapping(address => bool) public isRecipient;
    mapping(address => TokenFees) public tokenFees; // token => fees data
    mapping(address => bool) public supportedTokens;
    address[] public supportedTokenList;

    // Modifiers
    modifier onlySupportedToken(address token) {
        require(supportedTokens[token], "FeeCollector: Token not supported");
        _;
    }

    modifier validPercentage(uint256 percentage) {
        require(percentage > 0 && percentage <= PERCENTAGE_BASE, "FeeCollector: Invalid percentage");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // Admin functions
    function addRecipient(
        address recipient,
        uint256 percentage,
        string memory description
    ) external onlyOwner validPercentage(percentage) {
        require(recipient != address(0), "FeeCollector: Zero address");
        require(!isRecipient[recipient], "FeeCollector: Already a recipient");
        require(distributions.length < MAX_RECIPIENTS, "FeeCollector: Too many recipients");

        uint256 totalPercentage = _getTotalPercentage() + percentage;
        require(totalPercentage <= PERCENTAGE_BASE, "FeeCollector: Total percentage exceeds 100%");

        recipientIndex[recipient] = distributions.length;
        isRecipient[recipient] = true;
        distributions.push(FeeDistribution({
            recipient: recipient,
            percentage: percentage,
            description: description
        }));

        emit RecipientAdded(recipient, percentage, description);
    }

    function removeRecipient(address recipient) external onlyOwner {
        require(isRecipient[recipient], "FeeCollector: Not a recipient");

        uint256 index = recipientIndex[recipient];
        uint256 lastIndex = distributions.length - 1;

        // Move last element to deleted position if not already last
        if (index != lastIndex) {
            FeeDistribution memory lastDistribution = distributions[lastIndex];
            distributions[index] = lastDistribution;
            recipientIndex[lastDistribution.recipient] = index;
        }

        distributions.pop();
        delete recipientIndex[recipient];
        delete isRecipient[recipient];

        emit RecipientRemoved(recipient);
    }

    function updateDistribution(
        address recipient,
        uint256 newPercentage
    ) external onlyOwner validPercentage(newPercentage) {
        require(isRecipient[recipient], "FeeCollector: Not a recipient");

        uint256 index = recipientIndex[recipient];
        uint256 oldPercentage = distributions[index].percentage;
        uint256 totalPercentage = _getTotalPercentage() - oldPercentage + newPercentage;
        require(totalPercentage <= PERCENTAGE_BASE, "FeeCollector: Total percentage exceeds 100%");

        distributions[index].percentage = newPercentage;
        emit DistributionUpdated(recipient, newPercentage);
    }

    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "FeeCollector: Zero address");
        require(!supportedTokens[token], "FeeCollector: Token already supported");

        supportedTokens[token] = true;
        supportedTokenList.push(token);
    }

    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "FeeCollector: Token not supported");

        supportedTokens[token] = false;
        
        // Remove from list
        for (uint256 i = 0; i < supportedTokenList.length; i++) {
            if (supportedTokenList[i] == token) {
                supportedTokenList[i] = supportedTokenList[supportedTokenList.length - 1];
                supportedTokenList.pop();
                break;
            }
        }
    }

    // Fee collection
    function collectFees(address token, uint256 amount) external onlySupportedToken(token) {
        require(amount > 0, "FeeCollector: Zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        tokenFees[token].totalCollected += amount;
        tokenFees[token].pendingDistribution += amount;

        emit FeeCollected(token, amount, msg.sender);
    }

    // Native ETH collection
    receive() external payable {
        if (msg.value > 0) {
            tokenFees[address(0)].totalCollected += msg.value;
            tokenFees[address(0)].pendingDistribution += msg.value;
            emit FeeCollected(address(0), msg.value, msg.sender);
        }
    }

    // Fee distribution
    function distributeFees(address token) external nonReentrant {
        uint256 pendingAmount = tokenFees[token].pendingDistribution;
        require(pendingAmount > 0, "FeeCollector: No pending fees");

        uint256 totalPercentage = _getTotalPercentage();
        require(totalPercentage > 0, "FeeCollector: No recipients configured");

        tokenFees[token].pendingDistribution = 0;
        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < distributions.length; i++) {
            FeeDistribution memory dist = distributions[i];
            uint256 amount = (pendingAmount * dist.percentage) / PERCENTAGE_BASE;
            
            if (amount > 0) {
                if (token == address(0)) {
                    // Native ETH
                    (bool success, ) = payable(dist.recipient).call{value: amount}("");
                    require(success, "FeeCollector: ETH transfer failed");
                } else {
                    // ERC20
                    IERC20(token).safeTransfer(dist.recipient, amount);
                }
                
                totalDistributed += amount;
                emit FeeDistributed(token, dist.recipient, amount);
            }
        }

        tokenFees[token].totalDistributed += totalDistributed;

        // Handle rounding dust
        uint256 dust = pendingAmount - totalDistributed;
        if (dust > 0 && distributions.length > 0) {
            // Send dust to first recipient
            address dustRecipient = distributions[0].recipient;
            
            if (token == address(0)) {
                (bool success, ) = payable(dustRecipient).call{value: dust}("");
                require(success, "FeeCollector: ETH dust transfer failed");
            } else {
                IERC20(token).safeTransfer(dustRecipient, dust);
            }
            
            tokenFees[token].totalDistributed += dust;
            emit FeeDistributed(token, dustRecipient, dust);
        }
    }

    function distributeAllFees() external nonReentrant {
        // Distribute ETH
        if (tokenFees[address(0)].pendingDistribution > 0) {
            this.distributeFees(address(0));
        }

        // Distribute all supported tokens
        for (uint256 i = 0; i < supportedTokenList.length; i++) {
            address token = supportedTokenList[i];
            if (tokenFees[token].pendingDistribution > 0) {
                this.distributeFees(token);
            }
        }
    }

    // Emergency functions
    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        require(recipient != address(0), "FeeCollector: Zero address");

        if (token == address(0)) {
            require(address(this).balance >= amount, "FeeCollector: Insufficient ETH");
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "FeeCollector: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit EmergencyWithdraw(token, recipient, amount);
    }

    // View functions
    function getDistributions() external view returns (FeeDistribution[] memory) {
        return distributions;
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }

    function getPendingDistribution(address token) external view returns (uint256) {
        return tokenFees[token].pendingDistribution;
    }

    function getTokenFees(address token) external view returns (
        uint256 totalCollected,
        uint256 totalDistributed,
        uint256 pendingDistribution
    ) {
        TokenFees memory fees = tokenFees[token];
        return (fees.totalCollected, fees.totalDistributed, fees.pendingDistribution);
    }

    function _getTotalPercentage() private view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < distributions.length; i++) {
            total += distributions[i].percentage;
        }
        return total;
    }
}