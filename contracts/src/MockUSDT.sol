// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @notice Mock USDT token for testing purposes
 * @dev In production, use the official USDT contract
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    
    constructor() 
        ERC20("Tether USD", "USDT") 
        Ownable(msg.sender)
    {
        // Mint initial supply to deployer for testing
        _mint(msg.sender, 1000000 * 10**DECIMALS); // 1M USDT
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Mint tokens (only for testing)
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @notice Faucet function for testing
     * @dev Gives 1000 USDT to the caller (once per day)
     */
    mapping(address => uint256) public lastFaucetTime;
    uint256 public constant FAUCET_AMOUNT = 1000 * 10**DECIMALS;
    uint256 public constant FAUCET_COOLDOWN = 1 days;
    
    function faucet() external {
        require(
            block.timestamp >= lastFaucetTime[msg.sender] + FAUCET_COOLDOWN,
            "Faucet: Cooldown period not passed"
        );
        
        lastFaucetTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}