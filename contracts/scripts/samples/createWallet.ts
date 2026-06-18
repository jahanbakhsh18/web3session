import { ethers } from "hardhat";

const w = ethers.Wallet.createRandom(); 

console.log('Address:', w.address); 
console.log('Key:', w.privateKey);