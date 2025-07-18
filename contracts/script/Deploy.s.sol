// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ERC20Paymaster.sol";
import "../src/SmartWalletFactory.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy EntryPoint
        EntryPoint entryPoint = new EntryPoint();
        console.log("EntryPoint deployed at:", address(entryPoint));
        
        // Deploy ERC20 Paymaster
        ERC20Paymaster paymaster = new ERC20Paymaster(IEntryPoint(address(entryPoint)));
        console.log("ERC20Paymaster deployed at:", address(paymaster));
        
        // Deploy SmartWallet Factory
        SmartWalletFactory factory = new SmartWalletFactory();
        console.log("SmartWalletFactory deployed at:", address(factory));
        
        // Deploy Mock USDC for testing
        ERC20PresetMinterPauser mockUSDC = new ERC20PresetMinterPauser("Mock USDC", "USDC");
        console.log("Mock USDC deployed at:", address(mockUSDC));
        
        // Fund paymaster with native token
        payable(address(paymaster)).transfer(1 ether);
        
        // Stake paymaster in EntryPoint
        paymaster.addStake{value: 0.1 ether}(86400); // 1 day
        paymaster.deposit{value: 1 ether}();
        
        vm.stopBroadcast();
        
        // Write deployment addresses to file
        string memory deploymentData = string(abi.encodePacked(
            '{\n',
            '  "entryPoint": "', vm.toString(address(entryPoint)), '",\n',
            '  "paymaster": "', vm.toString(address(paymaster)), '",\n',
            '  "factory": "', vm.toString(address(factory)), '",\n',
            '  "mockUSDC": "', vm.toString(address(mockUSDC)), '"\n',
            '}'
        ));
        
        vm.writeFile("./deployments/localhost.json", deploymentData);
    }
}