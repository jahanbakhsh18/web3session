/**
 *  $ npx hardhat run scripts/samples/claimRefund.ts --network sepolia
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const deploymentsPath = path.join(__dirname, '../..', 'deployments.json');
  const { contracts } = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  const caller = process.env.CALLER_ADDRESS ?? process.env.DEPLOYER_ADDRESS

  console.log(`Caller: ${caller}`);
  console.log(`Contract: ${contracts.SessionRegistry}`);

  const registry = await ethers.getContractAt('SessionRegistry', contracts.SessionRegistry);

  const sessionIds = await registry.sessionsByParty(caller);
  console.log(`Number of sessions: ${sessionIds.length}`);
  
  if (sessionIds.length > 0) {
    console.log('Session IDs:', sessionIds.map((id: { toString: () => any; }) => id.toString()));
    const refundId = process.env.REFUND_ID ?? 0;

    console.log(`Refunding session ${refundId} ...`);
    const result = await registry.claimRefund(refundId);
    console.log('Session details:', result);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});