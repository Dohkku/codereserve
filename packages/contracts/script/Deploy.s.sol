// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CodeReserveEscrow} from "../src/CodeReserveEscrow.sol";

contract DeployScript is Script {
    // Base Mainnet USDC
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Base Sepolia USDC (circle's testnet USDC)
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address signerAddress = vm.envAddress("SIGNER_ADDRESS");

        // Determine USDC address based on chain
        address usdcAddress;
        if (block.chainid == 8453) {
            // Base Mainnet
            usdcAddress = BASE_USDC;
        } else if (block.chainid == 84532) {
            // Base Sepolia
            usdcAddress = BASE_SEPOLIA_USDC;
        } else {
            revert("Unsupported chain");
        }

        vm.startBroadcast(deployerPrivateKey);

        CodeReserveEscrow escrow = new CodeReserveEscrow(usdcAddress, signerAddress);

        console2.log("CodeReserveEscrow deployed at:", address(escrow));
        console2.log("USDC address:", usdcAddress);
        console2.log("Signer address:", signerAddress);

        vm.stopBroadcast();
    }
}
