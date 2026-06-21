/**
 * To create a public-private key pair for an account, you can use your recovery phrase in MetaMask.
 * Usage:
 *  $ npx hardhat run scripts/samples/createWallet.ts --network sepolia
 */

import { ethers } from "hardhat";

const w = ethers.Wallet.createRandom(); 

console.log('Address:', w.address); 
console.log('Key:', w.privateKey);
console.log('Recovery Phrase (Mnemonic):', w.mnemonic?.phrase);