/**
 *  $ npx hardhat run scripts/samples/viewSessions.ts --network sepolia
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const deploymentsPath = path.join(__dirname, '../..', 'deployments.json');
  const { contracts } = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  const party = process.env.PARTY_ADDRESS;
  console.log(`Party: ${party}`);
  console.log(`Contract: ${contracts.SessionRegistry}`);

  const registry = await ethers.getContractAt('SessionRegistry', contracts.SessionRegistry);

  const sessionIds = await registry.sessionsByParty(party);
  console.log(`Number of sessions: ${sessionIds.length}`);

  if (sessionIds.length === 0) {
    console.log('No sessions found for this party.');
    return;
  }

  console.log('Session IDs:', sessionIds.map((id: { toString: () => any; }) => id.toString()));

  console.log('\n--- Session Details ---');
  for (const id of sessionIds) {
    const session = await registry.getSession(id);
    console.log(`\nSession ${id.toString()}:`);
    console.log('Session details:', session);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});