import { expect } from 'chai'
import { ethers }  from 'hardhat'
import { time }    from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type {
  SessionRegistry,
  Escrow,
  Reputation,
  ReputationToken,
} from '../typechain-types'

// *** Helpers ***

const ONE_ETH = ethers.parseEther('1')
const ONE_DAY = 60 * 60 * 24          // seconds
const THIRTY_MIN = 60 * 30            // seconds

/**
 * Deploy the full contract suite.
 * Deployment order matters: Escrow and Reputation need the registry address, but registry needs Escrow + Reputation addresses.
 * Solution: deploy Escrow/Reputation with a placeholder, then deploy Registry, then update the registry reference. 
 * For the demo we solve this by deploying registry first with a known address scheme, or by using a factory. 
 * Here we use the simpler two-step approach: deploy with deployer as registry placeholder, then re-deploy properly. 
 * Actually the cleanest approach for tests is a deploy-all fixture that wires everything up.
 */
async function deployAll(deployer: SignerWithAddress, arbitrator: SignerWithAddress) {
  // 1. Pre-compute registry address (it's the next contract deployer creates)
  const nonce = await ethers.provider.getTransactionCount(deployer.address)
  // registry will be deployed at nonce+2 (after Escrow at nonce, Reputation at nonce+1)
  const registryAddress = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 2 })

  // 2. Deploy Escrow + Reputation pointing at the future registry
  const EscrowFactory     = await ethers.getContractFactory('Escrow', deployer)
  const ReputationFactory = await ethers.getContractFactory('Reputation', deployer)
  const TokenFactory      = await ethers.getContractFactory('ReputationToken', deployer)

  const escrow     = await EscrowFactory.deploy(registryAddress)
  const reputation = await ReputationFactory.deploy(registryAddress)

  // 3. Deploy SessionRegistry
  const RegistryFactory = await ethers.getContractFactory('SessionRegistry', deployer)
  const registry = await RegistryFactory.deploy(
    await escrow.getAddress(),
    await reputation.getAddress(),
    arbitrator.address,
  )

  // Sanity-check: the pre-computed address matches the actual deployment
  expect(await registry.getAddress()).to.equal(registryAddress)

  // 4. Deploy ReputationToken (optional, tested separately)
  const token = await TokenFactory.deploy(registryAddress)

  return { registry, escrow, reputation, token }
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
  let token:      ReputationToken

  beforeEach(async () => {
    ;[deployer, caller, callee, arbitrator, stranger] = await ethers.getSigners()
    //;({ registry, escrow, reputation, token } = await deployAll(deployer, arbitrator))
    const result = await deployAll(deployer, arbitrator);
    registry = result.registry as unknown as SessionRegistry;
    escrow = result.escrow as unknown as Escrow;
    reputation = result.reputation as unknown as Reputation;
    token = result.token as unknown as ReputationToken;
  })

  // *** Deployment ***

  describe('deployment', () => {
    it('wires escrow address correctly', async () => {
      expect(await registry.escrow()).to.equal(await escrow.getAddress())
    })

    it('wires reputation address correctly', async () => {
      expect(await registry.reputation()).to.equal(await reputation.getAddress())
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

    it('transitions to Active and emits SessionConfirmed', async () => {
      await expect(registry.connect(callee).confirmSession(0n))
        .to.emit(registry, 'SessionConfirmed')
        .withArgs(0n, callee.address)

      const s = await registry.getSession(0n)
      expect(s.status).to.equal(2) // Status.Active
    })

    it('reverts if called by a non-callee', async () => {
      await expect(
        registry.connect(stranger).confirmSession(0n)
      ).to.be.revertedWithCustomError(registry, 'NotCallee')
    })

    it('reverts if confirm timeout has passed', async () => {
      await time.increase(ONE_DAY + 1)
      await expect(
        registry.connect(callee).confirmSession(0n)
      ).to.be.revertedWithCustomError(registry, 'ConfirmTimeoutExpired')
    })

    it('reverts if session is not in Escrowed state', async () => {
      await registry.connect(callee).confirmSession(0n)
      await expect(
        registry.connect(callee).confirmSession(0n)
      ).to.be.revertedWithCustomError(registry, 'WrongStatus')
    })
  })

  // *** completeSession ***

  describe('completeSession', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await registry.connect(callee).confirmSession(0n)
    })

    it('caller can complete and escrow releases to callee', async () => {
      const balanceBefore = await ethers.provider.getBalance(callee.address)

      await expect(registry.connect(caller).completeSession(0n))
        .to.emit(registry, 'SessionCompleted')
        .withArgs(0n, caller.address)
        .and.to.emit(escrow, 'Released')
        .withArgs(0n, callee.address, ONE_ETH)

      const balanceAfter = await ethers.provider.getBalance(callee.address)
      expect(balanceAfter - balanceBefore).to.equal(ONE_ETH)
    })

    it('callee can also complete', async () => {
      await expect(registry.connect(callee).completeSession(0n))
        .to.emit(registry, 'SessionCompleted')
        .withArgs(0n, callee.address)
    })

    it('reverts if stranger tries to complete', async () => {
      await expect(
        registry.connect(stranger).completeSession(0n)
      ).to.be.revertedWithCustomError(registry, 'NotParty')
    })

    it('escrow balance is zero after completion', async () => {
      await registry.connect(caller).completeSession(0n)
      expect(await escrow.balanceOf(0n)).to.equal(0n)
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
  })

  // *** disputeSession + resolveDispute ***

  describe('disputeSession and resolveDispute', () => {
    beforeEach(async () => {
      await registry.connect(caller).createSession(callee.address, THIRTY_MIN, ONE_DAY, { value: ONE_ETH })
      await registry.connect(callee).confirmSession(0n)
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
      await registry.connect(callee).confirmSession(0n)
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
