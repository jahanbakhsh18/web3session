/**
 * Claiming a refund is only applicable upon the caller's signature. 
 * Usage:
 *    $ CALLER_KEY=<Caller's Private Key> REFUND_SESSION_ID=<Session ID> npx hardhat run scripts/samples/claimRefund.ts --network sepolia
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const deploymentsPath = path.join(__dirname, '../..', 'deployments.json');
  const { contracts } = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  const caller_key = (process.env.CALLER_KEY ?? process.env.PRIVATE_KEY) as string
  const callerSigner = new ethers.Wallet(caller_key, ethers.provider);

  console.log(`Caller: ${callerSigner.address}`);
  console.log(`Contract: ${contracts.SessionRegistry}`);

  const registry = await ethers.getContractAt('SessionRegistry', contracts.SessionRegistry) as any;

  const sessionIds = await registry.sessionsByParty(callerSigner.address);
  console.log(`Number of sessions: ${sessionIds.length}`);
  
  if (sessionIds.length > 0) {
    console.log('Session IDs:', sessionIds.map((id: { toString: () => any; }) => id.toString()));
    const refundId = process.env.REFUND_SESSION_ID ?? 0;

    console.log(`Refunding session ${refundId} ...`);
    const result = await registry.connect(callerSigner).claimRefund(refundId);
    console.log('Session details:', result);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});