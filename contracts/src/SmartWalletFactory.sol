// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./SmartWallet.sol";

contract SmartWalletFactory {
    SmartWallet public immutable walletImplementation;
    
    event WalletCreated(address indexed wallet, address indexed owner, uint256 salt);
    
    constructor() {
        walletImplementation = new SmartWallet();
    }
    
    function createWallet(address owner, uint256 salt) public returns (SmartWallet) {
        address addr = getAddress(owner, salt);
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(addr)
        }
        if (codeSize > 0) {
            return SmartWallet(payable(addr));
        }
        
        bytes memory initData = abi.encodeCall(SmartWallet.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy{salt: bytes32(salt)}(
            address(walletImplementation),
            initData
        );
        
        emit WalletCreated(address(proxy), owner, salt);
        return SmartWallet(payable(address(proxy)));
    }
    
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes memory initData = abi.encodeCall(SmartWallet.initialize, (owner));
        bytes memory bytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(address(walletImplementation), initData)
        );
        
        return Create2.computeAddress(bytes32(salt), keccak256(bytecode));
    }
}