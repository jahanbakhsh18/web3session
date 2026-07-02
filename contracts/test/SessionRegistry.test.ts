import { expect } from 'chai'
import { ethers }  from 'hardhat'
import { time }    from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type {
  SessionRegistry,
  Escrow,
  Reputation,
  ParticipationToken,
} from '../typechain-types'

const ONE_ETH = ethers.parseEther('1')
const REWARD_AMOUNT = ethers.parseEther('10')
const SLACK_SECS = 5                  // seconds
const ONE_DAY = 60 * 60 * 24          // seconds
const THIRTY_MIN = 60 * 30            // seconds

/**
 * Deploy the full contract suite, matching deploy.ts's order and wiring: Escrow, Reputation, and ParticipationToken are deployed 
 * first (each pointing at the registry's pre-computed future address), then SessionRegistry is deployed referencing all three.
 */
async function deployAll(deployer: SignerWithAddress, arbitrator: SignerWithAddress) {
  const nonce = await ethers.provider.getTransactionCount(deployer.address)
  // registry will be deployed at nonce+3 (after Escrow, Reputation, ParticipationToken)
  const registryAddress = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 3 })

  const EscrowFactory     = await ethers.getContractFactory('Escrow', deployer)
  const ReputationFactory = await ethers.getContractFactory('Reputation', deployer)
  const TokenFactory      = await ethers.getContractFactory('ParticipationToken', deployer)

  const escrow     = await EscrowFactory.deploy(registryAddress)
  const reputation = await ReputationFactory.deploy(registryAddress)
  const token       = await TokenFactory.deploy(registryAddress)

  const RegistryFactory = await ethers.getContractFactory('SessionRegistry', deployer)
  const registry = await RegistryFactory.deploy(
    await escrow.getAddress(),
    await reputation.getAddress(),
    await token.getAddress(),
    arbitrator.address,
  )

  // Sanity-check: the pre-computed address matches the actual deployment
  expect(await registry.getAddress()).to.equal(registryAddress)

  return { registry, escrow, reputation, token }
}

/** 
 * Helper: confirm with a start time at "now" which is the common case in most tests 
 * where we don't care about the scheduling gate itself.
 *
 *  Why not just pass time.latest()? Calling confirmSession() itself mines a new block, and Hardhat advances 
 *  block.timestamp by at least 1 second for every new block relative to the last one.
 */
async function confirmNow(registry: SessionRegistry, callee: SignerWithAddress, sessionId: bigint) {
  return registry.connect(callee).confirmSession(sessionId, (await time.latest()) + SLACK_SECS)
}

// *** Tests ***

describe('SessionRegistry', () => {
  let deployer:   SignerWithAddress
  let caller:     SignerWithAddress
  let callee:     SignerWithAddress
  let arbitrator: SignerWithAddress
  let stranger:   SignerWithAddress

  let registry:   SessionRegistry
  let escrow:     Escrow
  let reputation: Reputation
  let token:      ParticipationToken

  beforeEach(async () => {
    ;[deployer, caller, callee, arbitrator, stranger] = await ethers.getSigners()
    const result = await deployAll(deployer, arbitrator);
    registry = result.registry as unknown as SessionRegistry;
    escrow = result.escrow as unknown as Escrow;
    reputation = result.reputation as unknown as Reputation;
    token = result.token as unknown as ParticipationToken;
  })

  // *** Deployment ***

  describe('deployment', () => {
    it('wires escrow address correctly', async () => {
      expect(await registry.escrow()).to.equal(await escrow.getAddress())
    })

    it('wires reputation address correctly', async () => {
      expect(await registry.reputation()).to.equal(await reputation.getAddress())
    })

    it('wires participationToken address correctly', async () => {
      expect(await registry.participationToken()).to.equal(await token.getAddress())
    })

    it('sets arbitrator', async () => {
      expect(await registry.arbitrator()).to.equal(arbitrator.address)
    })

    it('starts nextSessionId at 0', async () => {
      expect(await registry.nextSessionId()).to.equal(0n)
    })
  })

  // *** createSession ***

  describe('createSession', () => {
    it('creates a session and emits SessionCreated', async () => {
      await expect(
        registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { 
          value: ONE_ETH,
        })
      )
        .to.emit(registry, 'SessionCreated')
        .withArgs(0n, caller.address, callee.address, ONE_ETH, THIRTY_MIN, ONE_DAY)
    })

    it('increments nextSessionId', async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      expect(await registry.nextSessionId()).to.equal(1n)
    })

    it('locks ETH in escrow', async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      expect(await escrow.balanceOf(0n)).to.equal(ONE_ETH)
    })

    it('sets status to Escrowed', async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      const s = await registry.getSession(0n)
      expect(s.status).to.equal(1) // Status.Escrowed
    })

    it('reverts on zero deposit', async () => {
      await expect(
        registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: 0 })
      ).to.be.revertedWithCustomError(registry, 'ZeroDeposit')
    })

    it('reverts on zero duration', async () => {
      await expect(
        registry.connect(caller).createSession(callee.address, 0, ONE_DAY, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(registry, 'InvalidDuration')
    })

    it('reverts when caller == callee', async () => {
      await expect(
        registry.connect(caller).createSession(caller.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(registry, 'SelfSession')
    })
  })

  // *** confirmSession ***

  describe('confirmSession', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
    })

    it('transitions to Active, stores scheduledStart, emits SessionConfirmed', async () => {
      const startAt = (await time.latest()) + 3600 // 1 hour from now

      await expect(registry.connect(callee).confirmSession(0n, startAt))
        .to.emit(registry, 'SessionConfirmed')
        .withArgs(0n, callee.address, startAt)

      const s = await registry.getSession(0n)
      expect(s.status).to.equal(2) // Status.Active
      expect(s.scheduledStart).to.equal(startAt)
    })

    it('allows scheduledStart equal to now', async () => {
      await expect(confirmNow(registry, callee, 0n)).to.not.be.reverted
    })

    it('reverts if scheduledStart is in the past', async () => {
      const past = (await time.latest()) - 1
      await expect(registry.connect(callee).confirmSession(0n, past)
      ).to.be.revertedWithCustomError(registry, 'ScheduledStartInPast')
    })

    it('reverts if scheduledStart is beyond the confirm-timeout deadline', async () => {
      const session = await registry.getSession(0n)
      const tooLate = Number(session.createdAt) + ONE_DAY + 1
      await expect(
        registry.connect(callee).confirmSession(0n, tooLate)
      ).to.be.revertedWithCustomError(registry, 'ScheduledStartAfterConfirmTimeout')
    })

    it('reverts if called by a non-callee', async () => {
      const now = await time.latest()
      await expect(
        registry.connect(stranger).confirmSession(0n, now)
      ).to.be.revertedWithCustomError(registry, 'NotCallee')
    })

    it('reverts if confirm timeout has passed', async () => {
      await time.increase(ONE_DAY + 1)
      const now = await time.latest()
      await expect(
        registry.connect(callee).confirmSession(0n, now)
      ).to.be.revertedWithCustomError(registry, 'ConfirmTimeoutExpired')
    })

    it('reverts if session is not in Escrowed state', async () => {
      await confirmNow(registry, callee, 0n)
      const now = await time.latest()
      await expect(
        registry.connect(callee).confirmSession(0n, now)
      ).to.be.revertedWithCustomError(registry, 'WrongStatus')
    })
  })

  // *** completeSession ***

  describe('completeSession', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
    })

    it('caller can complete immediately, even before scheduledStart + duration', async () => {
      const startAt = (await time.latest()) + 3600
      await registry.connect(callee).confirmSession(0n, startAt)

      // No time has passed — this is exactly the "caller cancels early" case.
      const balanceBefore = await ethers.provider.getBalance(callee.address)

      await expect(registry.connect(caller).completeSession(0n))
        .to.emit(registry, 'SessionCompleted')
        .withArgs(0n, caller.address)
        .and.to.emit(escrow, 'Released')
        .withArgs(0n, callee.address, ONE_ETH)

      const balanceAfter = await ethers.provider.getBalance(callee.address)
      expect(balanceAfter - balanceBefore).to.equal(ONE_ETH)
    })

    it('callee CANNOT complete before scheduledStart + durationSecs has elapsed', async () => {
      await confirmNow(registry, callee, 0n)

      // Immediately after confirming — nowhere near completable.
      await expect(registry.connect(callee).completeSession(0n)
      ).to.be.revertedWithCustomError(registry, 'SessionNotYetElapsed')
    })

    it('callee CAN complete once scheduledStart + durationSecs has elapsed', async () => {
      await confirmNow(registry, callee, 0n)
 
      // Read back what actually got stored rather than re-deriving it.
      const { scheduledStart } = await registry.getSession(0n)
 
      await time.increaseTo(scheduledStart + BigInt(THIRTY_MIN) + 1n)
 
      await expect(registry.connect(callee).completeSession(0n))
        .to.emit(registry, 'SessionCompleted')
        .withArgs(0n, callee.address)
    })

    it('reverts if stranger tries to complete', async () => {
      await confirmNow(registry, callee, 0n)
      await expect(
        registry.connect(stranger).completeSession(0n)
      ).to.be.revertedWithCustomError(registry, 'NotParty')
    })

    it('escrow balance is zero after completion', async () => {
      await confirmNow(registry, callee, 0n)
      await registry.connect(caller).completeSession(0n)
      expect(await escrow.balanceOf(0n)).to.equal(0n)
    })

    it('mints REWARD_AMOUNT to both caller and callee on completion', async () => {
      await confirmNow(registry, callee, 0n)
      await expect(registry.connect(caller).completeSession(0n))
        .to.emit(token, 'Rewarded')
        .withArgs(0n, caller.address, callee.address)

      expect(await token.balanceOf(caller.address)).to.equal(REWARD_AMOUNT)
      expect(await token.balanceOf(callee.address)).to.equal(REWARD_AMOUNT)
    })

    it('does not mint a reward for a disputed session resolved via arbitration', async () => {
      await confirmNow(registry, callee, 0n)
      await registry.connect(caller).disputeSession(0n)
      await registry.connect(arbitrator).resolveDispute(0n, callee.address)

      expect(await token.balanceOf(caller.address)).to.equal(0n)
      expect(await token.balanceOf(callee.address)).to.equal(0n)
    })

    it('accumulates rewards correctly across multiple completed sessions', async () => {
      await confirmNow(registry, callee, 0n)
      await registry.connect(caller).completeSession(0n)

      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await confirmNow(registry, callee, 1n)
      await registry.connect(caller).completeSession(1n)

      expect(await token.balanceOf(caller.address)).to.equal(REWARD_AMOUNT * 2n)
      expect(await token.balanceOf(callee.address)).to.equal(REWARD_AMOUNT * 2n)
    })
  })

  // *** claimRefund ***

  describe('claimRefund', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
    })

    it('refunds caller after timeout and emits SessionRefunded', async () => {
      await time.increase(ONE_DAY + 1)

      const balanceBefore = await ethers.provider.getBalance(caller.address)
      const tx = await registry.connect(caller).claimRefund(0n)
      const receipt = await tx.wait()
      const gasCost = receipt!.gasUsed * receipt!.gasPrice

      await expect(tx)
        .to.emit(registry, 'SessionRefunded')
        .withArgs(0n, caller.address, ONE_ETH)

      const balanceAfter = await ethers.provider.getBalance(caller.address)
      // caller gets ETH back minus gas
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ONE_ETH)
    })

    it('reverts if timeout has not passed', async () => {
      await expect(
        registry.connect(caller).claimRefund(0n)
      ).to.be.revertedWithCustomError(registry, 'ConfirmTimeoutNotExpired')
    })

    it('reverts if called by non-caller', async () => {
      await time.increase(ONE_DAY + 1)
      await expect(
        registry.connect(stranger).claimRefund(0n)
      ).to.be.revertedWithCustomError(registry, 'NotCaller')
    })

    it('does not mint a participation reward on refund', async () => {
      await time.increase(ONE_DAY + 1)
      await registry.connect(caller).claimRefund(0n)
      expect(await token.balanceOf(caller.address)).to.equal(0n)
      expect(await token.balanceOf(callee.address)).to.equal(0n)
    })
  })

  describe('disputeSession and resolveDispute', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await confirmNow(registry, callee, 0n)
    })

    it('caller can open a dispute', async () => {
      await expect(registry.connect(caller).disputeSession(0n))
        .to.emit(registry, 'SessionDisputed')
        .withArgs(0n, caller.address)

      expect((await registry.getSession(0n)).status).to.equal(4) // Status.Disputed
    })

    it('arbitrator resolves dispute in favor of callee', async () => {
      await registry.connect(caller).disputeSession(0n)

      const balanceBefore = await ethers.provider.getBalance(callee.address)
      await registry.connect(arbitrator).resolveDispute(0n, callee.address)
      const balanceAfter = await ethers.provider.getBalance(callee.address)

      expect(balanceAfter - balanceBefore).to.equal(ONE_ETH)
    })

    it('arbitrator resolves dispute in favor of caller (refund)', async () => {
      await registry.connect(caller).disputeSession(0n)

      const balanceBefore = await ethers.provider.getBalance(caller.address)
      await registry.connect(arbitrator).resolveDispute(0n, caller.address)
      const balanceAfter = await ethers.provider.getBalance(caller.address)

      expect(balanceAfter - balanceBefore).to.equal(ONE_ETH)
    })

    it('reverts if non-arbitrator tries to resolve', async () => {
      await registry.connect(caller).disputeSession(0n)
      await expect(
        registry.connect(stranger).resolveDispute(0n, callee.address)
      ).to.be.revertedWithCustomError(registry, 'NotArbitrator')
    })

    it('reverts if winner is not a party', async () => {
      await registry.connect(caller).disputeSession(0n)
      await expect(
        registry.connect(arbitrator).resolveDispute(0n, stranger.address)
      ).to.be.revertedWithCustomError(registry, 'NotParty')
    })
  })

  // *** rateCounterparty ***

  describe('rateCounterparty', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await confirmNow(registry, callee, 0n)
      await registry.connect(caller).completeSession(0n)
    })

    it('caller rates callee and reputation records it', async () => {
      await expect(registry.connect(caller).rateCounterparty(0n, 5))
        .to.emit(registry, 'SessionRated')
        .withArgs(0n, caller.address, 5)

      const [total, count] = await reputation.scoreOf(callee.address)
      expect(total).to.equal(5n)
      expect(count).to.equal(1n)
    })

    it('callee can also rate caller', async () => {
      await registry.connect(callee).rateCounterparty(0n, 4)
      const [total, count] = await reputation.scoreOf(caller.address)
      expect(total).to.equal(4n)
      expect(count).to.equal(1n)
    })

    it('averageScore returns scaled integer', async () => {
      await registry.connect(caller).rateCounterparty(0n, 5)
      expect(await reputation.averageScore(callee.address)).to.equal(500n) // 5.00
    })

    it('reverts on invalid rating (0 or 6)', async () => {
      await expect(
        registry.connect(caller).rateCounterparty(0n, 0)
      ).to.be.revertedWithCustomError(registry, 'InvalidRating')

      await expect(
        registry.connect(caller).rateCounterparty(0n, 6)
      ).to.be.revertedWithCustomError(registry, 'InvalidRating')
    })

    it('reverts if same party rates twice', async () => {
      await registry.connect(caller).rateCounterparty(0n, 5)
      await expect(
        registry.connect(caller).rateCounterparty(0n, 3)
      ).to.be.revertedWithCustomError(registry, 'AlreadyRated')
    })

    it('reverts if session is not completed', async () => {
      // Open a new session, don't complete it
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await expect(
        registry.connect(caller).rateCounterparty(1n, 5)
      ).to.be.revertedWithCustomError(registry, 'WrongStatus')
    })

    it('stranger cannot rate', async () => {
      await expect(
        registry.connect(stranger).rateCounterparty(0n, 5)
      ).to.be.revertedWithCustomError(registry, 'NotParty')
    })
  })

  // *** sessionsByParty view ***

  describe('sessionsByParty', () => {
    it('tracks sessions for both caller and callee', async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })

      const callerSessions = await registry.sessionsByParty(caller.address)
      const calleeSessions = await registry.sessionsByParty(callee.address)

      expect(callerSessions.length).to.equal(2)
      expect(calleeSessions.length).to.equal(2)
      expect(callerSessions[0]).to.equal(0n)
      expect(callerSessions[1]).to.equal(1n)
    })
  })
})
