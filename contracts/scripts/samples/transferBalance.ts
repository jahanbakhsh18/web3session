/**
 * Transfer a balance from one account (caller) to another (callee). 
 * For this operation, the private key of the caller and the address of the callee are required.
 * 
 * Usage:
 *    $ CALLER_KEY=<Sender's Private Key> CALLEE_ADDRESS=<Receiver's Address> AMOUNT=<e.g. 0.0001> npx hardhat run scripts/samples/transferBalance.ts --network sepolia
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  const privateKey = process.env.CALLER_KEY;
  const receiverAddress = process.env.CALLEE_ADDRESS;
  const amount = process.env.AMOUNT;

  if (!privateKey) {
    throw new Error("CALLER_KEY is missing in .env");
  }
  if (!receiverAddress) {
    throw new Error("CALLEE_ADDRESS is missing in .env");
  }
  if (!amount) {
    throw new Error("AMOUNT is missing in .env");
  }

  const sender = new ethers.Wallet(privateKey, ethers.provider);

  // (Optional) Check sender's balance to ensure they have enough funds
  const balance = await ethers.provider.getBalance(sender.address);
  const amountToSend = ethers.parseEther(amount ?? "0");

  if (balance < amountToSend) {
    throw new Error(
      `Insufficient balance. You have ${ethers.formatEther(balance)} ETH, but trying to send ${ethers.formatEther(amountToSend)} ETH.`
    );
  }

  console.log(` Sending from: ${sender.address}`);
  console.log(` Receiving to: ${receiverAddress}`);
  console.log(` Amount: ${ethers.formatEther(amountToSend)} ETH`);
  console.log(` Current balance: ${ethers.formatEther(balance)} ETH`);

  // Send the transaction
  const tx = await sender.sendTransaction({
    to: receiverAddress,
    value: amountToSend,
  });

  console.log(` Transaction broadcasted. Hash: ${tx.hash}`);
  console.log(` ⏳ Waiting for confirmation...`);

  await tx.wait();

  console.log(` ✅ Successfully transferred ${ethers.formatEther(amountToSend)} ETH!`);
  console.log(` View transaction: https://sepolia.etherscan.io/tx/${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});