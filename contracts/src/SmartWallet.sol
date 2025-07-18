// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract SmartWallet is BaseAccount, UUPSUpgradeable, Initializable {
    using ECDSA for bytes32;
    
    address public owner;
    uint256 private _nonce;
    
    event WalletInitialized(address indexed owner);
    event WalletUpgraded(address indexed newImplementation);
    
    modifier onlyOwner() {
        require(msg.sender == owner || msg.sender == address(this), "Only owner");
        _;
    }
    
    function initialize(address _owner) public initializer {
        owner = _owner;
        emit WalletInitialized(_owner);
    }
    
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external {
        _requireFromEntryPointOrOwner();
        _call(dest, value, func);
    }
    
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external {
        _requireFromEntryPointOrOwner();
        require(
            dest.length == func.length && dest.length == value.length,
            "Wrong array lengths"
        );
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], value[i], func[i]);
        }
    }
    
    function _validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal override returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address recovered = hash.recover(userOp.signature);
        
        if (recovered != owner) {
            return SIG_VALIDATION_FAILED;
        }
        return 0;
    }
    
    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
    
    function getNonce() public view override returns (uint256) {
        return _nonce;
    }
    
    function _requireFromEntryPointOrOwner() internal view {
        require(
            msg.sender == address(entryPoint()) || msg.sender == owner,
            "Not authorized"
        );
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        emit WalletUpgraded(newImplementation);
    }
    
    receive() external payable {}
}