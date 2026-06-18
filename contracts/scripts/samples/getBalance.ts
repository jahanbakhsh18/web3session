/**
 * $ npx hardhat run scripts/samples/getBalance.ts 
 */

require('dotenv').config();
const { ethers } = require('ethers');

console.log("RPC Endpoint (Connection):", process.env.INFURA_URL);

const address = ethers.getAddress(process.env.DEPLOYER_ADDRESS);
console.log("Wallet Address:", address);

const p = new ethers.JsonRpcProvider(process.env.INFURA_URL);

p.getBalance(address).then((b: any) => 
    console.log(ethers.formatEther(b) + ' ETH')
);