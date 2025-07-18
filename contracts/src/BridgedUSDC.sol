// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BridgedUSDC
 * @notice USDC token bridged from L1 to L2
 * @dev This contract represents USDC on L2, mintable only by the bridge
 */
contract BridgedUSDC is ERC20, ERC20Permit, ERC20Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    uint8 private constant DECIMALS = 6;
    address public immutable l1Token;
    
    event BridgeMint(address indexed to, uint256 amount);
    event BridgeBurn(address indexed from, uint256 amount);
    
    constructor(address _l1Token, address _bridge) 
        ERC20("USD Coin", "USDC") 
        ERC20Permit("USD Coin")
    {
        require(_l1Token != address(0), "Invalid L1 token");
        require(_bridge != address(0), "Invalid bridge");
        
        l1Token = _l1Token;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, _bridge);
        _grantRole(PAUSER_ROLE, msg.sender);
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Mint tokens when bridging from L1
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function bridgeMint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit BridgeMint(to, amount);
    }
    
    /**
     * @notice Burn tokens when bridging to L1
     * @param from Address to burn tokens from
     * @param amount Amount to burn
     */
    function bridgeBurn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
        emit BridgeBurn(from, amount);
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
     * @dev See {ERC20-_beforeTokenTransfer}.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}