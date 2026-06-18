import { ethers } from "hardhat";

// ===== READ FROM ENVIRONMENT =====
const contractName = process.env.CONTRACT_NAME || "";
const constructorArgsRaw = process.env.CONSTRUCTOR_ARGS || "[]";
let constructorArgs: any[] = [];

if (contractName == "") {
  console.error(`
Missing CONTRACT_NAME environment variable.
  Usage: 
   $ npx hardhat run scripts/samples/estimateCost.ts --network sepolia
   $ CONTRACT_NAME=<NAME> CONSTRUCTOR_ARGS=<ARGS> npx hardhat run scripts/samples/estimateCost.ts --network sepolia
`);
  process.exit(1);
}

try {
  constructorArgs = JSON.parse(constructorArgsRaw);
  if (!Array.isArray(constructorArgs)) {
    throw new Error("CONSTRUCTOR_ARGS must be a JSON array.");
  }
} catch (err) {
  console.error("Invalid CONSTRUCTOR_ARGS: must be a valid JSON array, e.g. '[\"0x...\", 42]'");
  process.exit(1);
}
// ==================================

async function main() {
  console.log(`Estimating deployment cost for ${contractName}...\n`);

  // 1. Get the contract factory
  const factory = await ethers.getContractFactory(contractName);

  // 2. Prepare deployment transaction – MUST await!
  const deployTx = await factory.getDeployTransaction(...constructorArgs);

  // 3. Estimate gas
  const gasEstimate = await ethers.provider.estimateGas(deployTx);
  console.log(` Estimated gas: ${gasEstimate.toString()} units`);

  // 4. Get gas price – handle null (EIP‑1559)
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice) {
    throw new Error("Could not determine gas price – no fee data available.");
  }

  console.log(` Current gas price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);

  // 5. Total cost
  const totalCostWei = gasEstimate * gasPrice;
  const totalCostEth = ethers.formatEther(totalCostWei);

  console.log(`\ Total estimated deployment cost:`);
  console.log(`   ${totalCostWei.toString()} wei`);
  console.log(`   ${totalCostEth} ETH`);

  // 6. Balance check
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);

  console.log(`\n Your current balance: ${balanceEth} ETH`);

  if (balance < totalCostWei) {
    const deficit = ethers.formatEther(totalCostWei - balance);
    console.log(` INSUFFICIENT FUNDS! You need at least ${deficit} more ETH. \n`);
  } else {
    console.log(` Sufficient funds. You can deploy now. \n`);
  }
}

main().catch(console.error);