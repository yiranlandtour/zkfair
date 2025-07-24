// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title BridgedUSDCEnhanced
 * @notice Enhanced USDC token bridged to ZKFair L2 with additional features
 * @dev Implements supply caps, detailed statistics, and enhanced bridge functionality
 */
contract BridgedUSDCEnhanced is ERC20, ERC20Burnable, AccessControl, Pausable, ERC20Permit {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant SUPPLY_MANAGER_ROLE = keccak256("SUPPLY_MANAGER_ROLE");
    
    // Bridge configuration
    address public l1Token;
    mapping(bytes32 => bool) public processedL1Transactions;
    
    // Supply management
    uint256 public mintCap;
    uint256 public bridgeCap;
    uint256 public totalBridged;
    uint256 public totalWithdrawn;
    uint256 public totalMinted; // Non-bridge mints
    
    // Fee configuration
    uint256 public bridgeFeeRate; // Basis points (10000 = 100%)
    address public feeCollector;
    uint256 public totalFeesCollected;
    
    // Events
    event BridgedFromL1(address indexed recipient, uint256 amount, bytes32 indexed l1TxHash, uint256 fee);
    event WithdrawnToL1(address indexed from, address indexed l1Recipient, uint256 amount);
    event MintCapUpdated(uint256 oldCap, uint256 newCap);
    event BridgeCapUpdated(uint256 oldCap, uint256 newCap);
    event L1TokenUpdated(address oldToken, address newToken);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event FeeCollectorUpdated(address oldCollector, address newCollector);
    event FeesCollected(uint256 amount);
    
    // Errors
    error MintCapExceeded();
    error BridgeCapExceeded();
    error InvalidAddress();
    error InvalidAmount();
    error TransactionAlreadyProcessed();
    error FeeExceedsAmount();
    
    constructor(
        address _l1Token,
        uint256 _mintCap,
        uint256 _bridgeCap,
        address _feeCollector
    ) ERC20("USD Coin (Bridged)", "USDC.b") ERC20Permit("USD Coin (Bridged)") {
        if (_l1Token == address(0) || _feeCollector == address(0)) revert InvalidAddress();
        
        l1Token = _l1Token;
        mintCap = _mintCap;
        bridgeCap = _bridgeCap;
        feeCollector = _feeCollector;
        bridgeFeeRate = 10; // 0.1% default fee
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(SUPPLY_MANAGER_ROLE, msg.sender);
    }
    
    /**
     * @notice Decimals for USDC
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    /**
     * @notice Mint tokens when bridging from L1
     * @param to Recipient address
     * @param amount Amount to mint (before fees)
     * @param l1TxHash Transaction hash from L1
     */
    function bridgeMint(
        address to,
        uint256 amount,
        bytes32 l1TxHash
    ) external onlyRole(BRIDGE_ROLE) whenNotPaused {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (processedL1Transactions[l1TxHash]) revert TransactionAlreadyProcessed();
        
        uint256 fee = (amount * bridgeFeeRate) / 10000;
        if (fee >= amount) revert FeeExceedsAmount();
        
        uint256 netAmount = amount - fee;
        uint256 newTotalBridged = totalBridged + amount;
        
        if (newTotalBridged > bridgeCap) revert BridgeCapExceeded();
        
        processedL1Transactions[l1TxHash] = true;
        totalBridged += amount;
        
        if (fee > 0) {
            totalFeesCollected += fee;
            _mint(feeCollector, fee);
            emit FeesCollected(fee);
        }
        
        _mint(to, netAmount);
        emit BridgedFromL1(to, netAmount, l1TxHash, fee);
    }
    
    /**
     * @notice Burn tokens when withdrawing to L1
     * @param amount Amount to burn
     * @param l1Recipient Recipient address on L1
     */
    function bridgeBurn(
        uint256 amount,
        address l1Recipient
    ) external whenNotPaused {
        if (l1Recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        totalWithdrawn += amount;
        _burn(msg.sender, amount);
        
        emit WithdrawnToL1(msg.sender, l1Recipient, amount);
    }
    
    /**
     * @notice Mint new tokens (for specific use cases like liquidity provision)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        uint256 newTotalMinted = totalMinted + amount;
        if (newTotalMinted > mintCap) revert MintCapExceeded();
        
        totalMinted += amount;
        _mint(to, amount);
    }
    
    /**
     * @notice Update the mint cap
     * @param newMintCap New mint cap value
     */
    function setMintCap(uint256 newMintCap) external onlyRole(SUPPLY_MANAGER_ROLE) {
        uint256 oldCap = mintCap;
        mintCap = newMintCap;
        emit MintCapUpdated(oldCap, newMintCap);
    }
    
    /**
     * @notice Update the bridge cap
     * @param newBridgeCap New bridge cap value
     */
    function setBridgeCap(uint256 newBridgeCap) external onlyRole(SUPPLY_MANAGER_ROLE) {
        uint256 oldCap = bridgeCap;
        bridgeCap = newBridgeCap;
        emit BridgeCapUpdated(oldCap, newBridgeCap);
    }
    
    /**
     * @notice Update the L1 token address
     * @param newL1Token New L1 token address
     */
    function setL1Token(address newL1Token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newL1Token == address(0)) revert InvalidAddress();
        
        address oldToken = l1Token;
        l1Token = newL1Token;
        emit L1TokenUpdated(oldToken, newL1Token);
    }
    
    /**
     * @notice Update the bridge fee rate
     * @param newFeeRate New fee rate in basis points
     */
    function setFeeRate(uint256 newFeeRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeRate > 1000) revert InvalidAmount(); // Max 10% fee
        
        uint256 oldRate = bridgeFeeRate;
        bridgeFeeRate = newFeeRate;
        emit FeeRateUpdated(oldRate, newFeeRate);
    }
    
    /**
     * @notice Update the fee collector address
     * @param newFeeCollector New fee collector address
     */
    function setFeeCollector(address newFeeCollector) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeCollector == address(0)) revert InvalidAddress();
        
        address oldCollector = feeCollector;
        feeCollector = newFeeCollector;
        emit FeeCollectorUpdated(oldCollector, newFeeCollector);
    }
    
    /**
     * @notice Pause token transfers
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Get bridge statistics
     */
    function getBridgeStats() external view returns (
        uint256 _totalBridged,
        uint256 _totalWithdrawn,
        uint256 _netBridged,
        uint256 _totalMinted,
        uint256 _totalSupply,
        uint256 _totalFeesCollected
    ) {
        _totalBridged = totalBridged;
        _totalWithdrawn = totalWithdrawn;
        _netBridged = totalBridged - totalWithdrawn;
        _totalMinted = totalMinted;
        _totalSupply = totalSupply();
        _totalFeesCollected = totalFeesCollected;
    }
    
    /**
     * @notice Check if an amount can be minted
     */
    function canMint(uint256 amount) external view returns (bool) {
        return totalMinted + amount <= mintCap;
    }
    
    /**
     * @notice Check if an amount can be bridged
     */
    function canBridge(uint256 amount) external view returns (bool) {
        return totalBridged + amount <= bridgeCap;
    }
    
    /**
     * @notice Calculate bridge fee for an amount
     */
    function calculateBridgeFee(uint256 amount) external view returns (uint256 fee, uint256 netAmount) {
        fee = (amount * bridgeFeeRate) / 10000;
        netAmount = amount - fee;
    }
    
    // Required overrides
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._update(from, to, amount);
    }
}