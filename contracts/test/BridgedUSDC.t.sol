// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/BridgedUSDCEnhanced.sol";

contract BridgedUSDCTest is Test {
    BridgedUSDCEnhanced public bridgedUSDC;
    
    address public owner = address(1);
    address public bridge = address(2);
    address public minter = address(3);
    address public feeCollector = address(4);
    address public user1 = address(5);
    address public user2 = address(6);
    address public l1Token = address(7);
    
    uint256 constant MINT_CAP = 1_000_000e6; // 1M USDC
    uint256 constant BRIDGE_CAP = 10_000_000e6; // 10M USDC
    
    event BridgedFromL1(address indexed recipient, uint256 amount, bytes32 indexed l1TxHash, uint256 fee);
    event WithdrawnToL1(address indexed from, address indexed l1Recipient, uint256 amount);
    
    function setUp() public {
        vm.startPrank(owner);
        
        bridgedUSDC = new BridgedUSDCEnhanced(
            l1Token,
            MINT_CAP,
            BRIDGE_CAP,
            feeCollector
        );
        
        // Grant roles
        bridgedUSDC.grantRole(bridgedUSDC.BRIDGE_ROLE(), bridge);
        bridgedUSDC.grantRole(bridgedUSDC.MINTER_ROLE(), minter);
        
        vm.stopPrank();
    }
    
    function testInitialState() public {
        assertEq(bridgedUSDC.name(), "USD Coin (Bridged)");
        assertEq(bridgedUSDC.symbol(), "USDC.b");
        assertEq(bridgedUSDC.decimals(), 6);
        assertEq(bridgedUSDC.l1Token(), l1Token);
        assertEq(bridgedUSDC.mintCap(), MINT_CAP);
        assertEq(bridgedUSDC.bridgeCap(), BRIDGE_CAP);
        assertEq(bridgedUSDC.feeCollector(), feeCollector);
        assertEq(bridgedUSDC.bridgeFeeRate(), 10); // 0.1%
    }
    
    function testBridgeMint() public {
        uint256 amount = 1000e6; // 1000 USDC
        bytes32 txHash = keccak256("tx1");
        
        vm.prank(bridge);
        vm.expectEmit(true, true, false, true);
        emit BridgedFromL1(user1, 999e6, txHash, 1e6); // 0.1% fee
        bridgedUSDC.bridgeMint(user1, amount, txHash);
        
        assertEq(bridgedUSDC.balanceOf(user1), 999e6);
        assertEq(bridgedUSDC.balanceOf(feeCollector), 1e6);
        assertEq(bridgedUSDC.totalBridged(), amount);
        assertEq(bridgedUSDC.totalFeesCollected(), 1e6);
        assertTrue(bridgedUSDC.processedL1Transactions(txHash));
    }
    
    function testBridgeMintDuplicateTx() public {
        uint256 amount = 1000e6;
        bytes32 txHash = keccak256("tx1");
        
        vm.startPrank(bridge);
        bridgedUSDC.bridgeMint(user1, amount, txHash);
        
        vm.expectRevert(BridgedUSDCEnhanced.TransactionAlreadyProcessed.selector);
        bridgedUSDC.bridgeMint(user1, amount, txHash);
        vm.stopPrank();
    }
    
    function testBridgeMintExceedsCap() public {
        uint256 amount = BRIDGE_CAP + 1;
        bytes32 txHash = keccak256("tx1");
        
        vm.prank(bridge);
        vm.expectRevert(BridgedUSDCEnhanced.BridgeCapExceeded.selector);
        bridgedUSDC.bridgeMint(user1, amount, txHash);
    }
    
    function testBridgeBurn() public {
        // First bridge some tokens
        uint256 amount = 1000e6;
        bytes32 txHash = keccak256("tx1");
        
        vm.prank(bridge);
        bridgedUSDC.bridgeMint(user1, amount, txHash);
        
        // Now burn to withdraw
        uint256 burnAmount = 500e6;
        address l1Recipient = address(8);
        
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit WithdrawnToL1(user1, l1Recipient, burnAmount);
        bridgedUSDC.bridgeBurn(burnAmount, l1Recipient);
        
        assertEq(bridgedUSDC.balanceOf(user1), 499e6); // 999 - 500
        assertEq(bridgedUSDC.totalWithdrawn(), burnAmount);
    }
    
    function testMint() public {
        uint256 amount = 1000e6;
        
        vm.prank(minter);
        bridgedUSDC.mint(user1, amount);
        
        assertEq(bridgedUSDC.balanceOf(user1), amount);
        assertEq(bridgedUSDC.totalMinted(), amount);
    }
    
    function testMintExceedsCap() public {
        uint256 amount = MINT_CAP + 1;
        
        vm.prank(minter);
        vm.expectRevert(BridgedUSDCEnhanced.MintCapExceeded.selector);
        bridgedUSDC.mint(user1, amount);
    }
    
    function testSetFeeRate() public {
        uint256 newRate = 50; // 0.5%
        
        vm.prank(owner);
        bridgedUSDC.setFeeRate(newRate);
        
        assertEq(bridgedUSDC.bridgeFeeRate(), newRate);
        
        // Test max fee rate
        vm.expectRevert(BridgedUSDCEnhanced.InvalidAmount.selector);
        bridgedUSDC.setFeeRate(1001); // > 10%
    }
    
    function testCalculateBridgeFee() public {
        uint256 amount = 10000e6; // 10,000 USDC
        
        (uint256 fee, uint256 netAmount) = bridgedUSDC.calculateBridgeFee(amount);
        
        assertEq(fee, 10e6); // 0.1% of 10,000 = 10 USDC
        assertEq(netAmount, 9990e6);
    }
    
    function testPauseUnpause() public {
        // Bridge some tokens first
        vm.prank(bridge);
        bridgedUSDC.bridgeMint(user1, 1000e6, keccak256("tx1"));
        
        // Pause
        vm.prank(owner);
        bridgedUSDC.pause();
        
        // Try to transfer while paused
        vm.prank(user1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bridgedUSDC.transfer(user2, 100e6);
        
        // Try to bridge while paused
        vm.prank(bridge);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bridgedUSDC.bridgeMint(user2, 1000e6, keccak256("tx2"));
        
        // Unpause
        vm.prank(owner);
        bridgedUSDC.unpause();
        
        // Now transfer should work
        vm.prank(user1);
        bridgedUSDC.transfer(user2, 100e6);
        assertEq(bridgedUSDC.balanceOf(user2), 100e6);
    }
    
    function testSetMintCap() public {
        uint256 newCap = 2_000_000e6; // 2M USDC
        
        vm.prank(owner);
        bridgedUSDC.setMintCap(newCap);
        
        assertEq(bridgedUSDC.mintCap(), newCap);
    }
    
    function testSetBridgeCap() public {
        uint256 newCap = 20_000_000e6; // 20M USDC
        
        vm.prank(owner);
        bridgedUSDC.setBridgeCap(newCap);
        
        assertEq(bridgedUSDC.bridgeCap(), newCap);
    }
    
    function testSetFeeCollector() public {
        address newCollector = address(9);
        
        vm.prank(owner);
        bridgedUSDC.setFeeCollector(newCollector);
        
        assertEq(bridgedUSDC.feeCollector(), newCollector);
    }
    
    function testGetBridgeStats() public {
        // Bridge some tokens
        vm.startPrank(bridge);
        bridgedUSDC.bridgeMint(user1, 5000e6, keccak256("tx1"));
        bridgedUSDC.bridgeMint(user2, 3000e6, keccak256("tx2"));
        vm.stopPrank();
        
        // Mint some tokens
        vm.prank(minter);
        bridgedUSDC.mint(user1, 1000e6);
        
        // Burn some tokens
        vm.prank(user1);
        bridgedUSDC.bridgeBurn(2000e6, address(10));
        
        (
            uint256 totalBridged,
            uint256 totalWithdrawn,
            uint256 netBridged,
            uint256 totalMinted,
            uint256 totalSupply,
            uint256 totalFeesCollected
        ) = bridgedUSDC.getBridgeStats();
        
        assertEq(totalBridged, 8000e6);
        assertEq(totalWithdrawn, 2000e6);
        assertEq(netBridged, 6000e6);
        assertEq(totalMinted, 1000e6);
        assertEq(totalFeesCollected, 8e6); // 0.1% of 8000
        assertEq(totalSupply, 7008e6); // 8000 - 8 (fees) + 1000 (minted) - 2000 (burned)
    }
    
    function testAccessControl() public {
        // Non-bridge cannot bridge mint
        vm.prank(user1);
        vm.expectRevert();
        bridgedUSDC.bridgeMint(user1, 1000e6, keccak256("tx1"));
        
        // Non-minter cannot mint
        vm.prank(user1);
        vm.expectRevert();
        bridgedUSDC.mint(user1, 1000e6);
        
        // Non-pauser cannot pause
        vm.prank(user1);
        vm.expectRevert();
        bridgedUSDC.pause();
        
        // Non-admin cannot set fee rate
        vm.prank(user1);
        vm.expectRevert();
        bridgedUSDC.setFeeRate(20);
    }
    
    function testPermit() public {
        uint256 privateKey = 0x1234;
        address signer = vm.addr(privateKey);
        
        // Bridge tokens to signer
        vm.prank(bridge);
        bridgedUSDC.bridgeMint(signer, 1000e6, keccak256("tx1"));
        
        // Create permit
        uint256 nonce = bridgedUSDC.nonces(signer);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 amount = 100e6;
        
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                signer,
                user2,
                amount,
                nonce,
                deadline
            )
        );
        
        bytes32 hash = keccak256(
            abi.encodePacked("\x19\x01", bridgedUSDC.DOMAIN_SEPARATOR(), structHash)
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash);
        
        // Use permit
        bridgedUSDC.permit(signer, user2, amount, deadline, v, r, s);
        
        assertEq(bridgedUSDC.allowance(signer, user2), amount);
    }
}