/**
 * $ npx hardhat run scripts/samples/getBalance.ts 
 */

require('dotenv').config();
const { ethers } = require('ethers');

console.log("RPC Endpoint (Connection):", process.env.RPC_URL);

const address = ethers.getAddress(process.env.PARTY_ADDRESS);
console.log("Wallet Address:", address);

const p = new ethers.JsonRpcProvider(process.env.RPC_URL);

p.getBalance(address).then((b: any) => 
    console.log(ethers.formatEther(b) + ' ETH/tBNB')
);