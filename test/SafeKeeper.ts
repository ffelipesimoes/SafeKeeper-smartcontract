import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ZeroAddress } from "ethers";

describe("SafeKeeper", function () {
  // Fixture to deploy the contract and set up test accounts
  async function deploySafeKeeperFixture() {
    const [owner, noble, beneficiary, otherAccount] = await ethers.getSigners();

    const SafeKeeper = await ethers.getContractFactory("SafeKeeper");
    const safeKeeper = await SafeKeeper.deploy();

    return { safeKeeper, owner, noble, beneficiary, otherAccount };
  }

  describe("Deployment", function () {
    it("Should deploy with nextTreasureId set to zero", async function () {
      const { safeKeeper } = await loadFixture(deploySafeKeeperFixture);
      expect(await safeKeeper.nextTreasureId()).to.equal(0);
    });

    it("Should set the deployer as the owner", async function () {
      const { safeKeeper, owner } = await loadFixture(deploySafeKeeperFixture);
      expect(await safeKeeper.owner()).to.equal(owner.address);
    });

    it("Should initialize feeBasisPoints to 42 (0.420%)", async function () {
      const { safeKeeper } = await loadFixture(deploySafeKeeperFixture);
      expect(await safeKeeper.feeBasisPoints()).to.equal(42);
    });
  });

  describe("Store Treasure", function () {
    it("Should store a treasure with the correct parameters and deduct fee", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60; // 1 year from now
      const treasureAmount = ethers.parseEther("1"); // 1 ETH

      // Calculate fee and net amount
      const fee = (treasureAmount * 42n) / 10000n; // 0.420%
      const netAmount = treasureAmount - fee;

      await expect(
        safeKeeper
          .connect(noble)
          .storeTreasure(beneficiary.address, unlockTime, {
            value: treasureAmount,
          })
      )
        .to.emit(safeKeeper, "TreasureStored")
        .withArgs(noble.address, beneficiary.address, netAmount, unlockTime, 0);

      const storedTreasure = await safeKeeper.treasures(0);
      expect(storedTreasure.amount).to.equal(netAmount);
      expect(storedTreasure.unlockTime).to.equal(unlockTime);
      expect(storedTreasure.noble).to.equal(noble.address);
      expect(storedTreasure.beneficiary).to.equal(beneficiary.address);
      expect(storedTreasure.claimed).to.equal(false);

      // Check collected fees
      expect(await safeKeeper.collectedFees()).to.equal(fee);

      // Check if the treasure ID was registered for the noble
      const nobleTreasureIds = await safeKeeper.viewTreasuresByNoble(
        noble.address
      );
      expect(nobleTreasureIds.length).to.equal(1);
      expect(nobleTreasureIds[0]).to.equal(0);

      // Check if the treasure ID was registered for the beneficiary
      const beneficiaryTreasureIds =
        await safeKeeper.viewTreasuresByBeneficiary(beneficiary.address);
      expect(beneficiaryTreasureIds.length).to.equal(1);
      expect(beneficiaryTreasureIds[0]).to.equal(0);
    });

    it("Should increment nextTreasureId after storing a treasure", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60;
      const treasureAmount = ethers.parseEther("1");

      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime, {
          value: treasureAmount,
        });

      expect(await safeKeeper.nextTreasureId()).to.equal(1);

      // Store another treasure
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime + 1000, {
          value: treasureAmount,
        });

      expect(await safeKeeper.nextTreasureId()).to.equal(2);
    });

    it("Should revert if unlock time is in the past", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const pastTime = (await time.latest()) - 1;

      await expect(
        safeKeeper.connect(noble).storeTreasure(beneficiary.address, pastTime, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Unlock time must be in the future.");
    });

    it("Should revert if no Ether is sent", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60;

      await expect(
        safeKeeper
          .connect(noble)
          .storeTreasure(beneficiary.address, unlockTime, { value: 0 })
      ).to.be.revertedWith("Treasure value must be greater than zero.");
    });

    it("Should revert if beneficiary is the zero address", async function () {
      const { safeKeeper, noble } = await loadFixture(deploySafeKeeperFixture);
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60;

      await expect(
        safeKeeper.connect(noble).storeTreasure(ZeroAddress, unlockTime, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Beneficiary must be a valid address.");
    });
  });

  describe("Claim Treasure", function () {
    // In the fixture
    async function storeAndClaimTreasureFixture() {
      const { safeKeeper, noble, beneficiary, otherAccount } =
        await loadFixture(deploySafeKeeperFixture);
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60; // 1 year from now
      const treasureAmount = ethers.parseEther("1"); // 1 ETH

      const feeBasisPoints = 42;

      // Calculate store fee and net stored amount
      const storeFee = (treasureAmount * BigInt(feeBasisPoints)) / 10000n;
      const netStoredAmount = treasureAmount - storeFee;

      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime, {
          value: treasureAmount,
        });

      return {
        safeKeeper,
        noble,
        beneficiary,
        otherAccount,
        unlockTime,
        treasureAmount,
        netStoredAmount,
        storeFee,
        feeBasisPoints,
      };
    }

    it("Should transfer the net funds to the beneficiary upon successful claim", async function () {
      const {
        safeKeeper,
        beneficiary,
        unlockTime,
        netStoredAmount,
        feeBasisPoints,
      } = await loadFixture(storeAndClaimTreasureFixture);

      await time.increaseTo(unlockTime + 1);

      // Calculate claim fee and net claim amount
      const claimFee = (netStoredAmount * BigInt(feeBasisPoints)) / 10000n;
      const netClaimAmount = netStoredAmount - BigInt(claimFee);

      await expect(() =>
        safeKeeper.connect(beneficiary).claimTreasure(0)
      ).to.changeEtherBalance(beneficiary, netClaimAmount, {
        delta: ethers.parseEther("0.0001"),
      });
    });

    it("Should revert if treasure is claimed by someone other than the beneficiary", async function () {
      const { safeKeeper, otherAccount, unlockTime } = await loadFixture(
        storeAndClaimTreasureFixture
      );
      await time.increaseTo(unlockTime + 1);

      await expect(
        safeKeeper.connect(otherAccount).claimTreasure(0)
      ).to.be.revertedWith("Not the beneficiary of this treasure.");
    });

    it("Should mark treasure as claimed after it is claimed", async function () {
      const { safeKeeper, beneficiary, unlockTime } = await loadFixture(
        storeAndClaimTreasureFixture
      );

      await time.increaseTo(unlockTime + 1);
      await safeKeeper.connect(beneficiary).claimTreasure(0);

      const treasure = await safeKeeper.treasures(0);
      expect(treasure.claimed).to.be.true;
      expect(treasure.amount).to.equal(0); // The amount should be zero after the claim
    });

    it("Should revert if trying to claim an already claimed treasure", async function () {
      const { safeKeeper, beneficiary, unlockTime } = await loadFixture(
        storeAndClaimTreasureFixture
      );

      await time.increaseTo(unlockTime + 1);
      await safeKeeper.connect(beneficiary).claimTreasure(0);

      await expect(
        safeKeeper.connect(beneficiary).claimTreasure(0)
      ).to.be.revertedWith("Treasure already claimed.");
    });
  });

  describe("Fee Management", function () {
    it("Should revert when non-owner tries to set a new fee", async function () {
      const { safeKeeper, noble } = await loadFixture(deploySafeKeeperFixture);

      await expect(safeKeeper.connect(noble).setFeeBasisPoints(100))
        .to.be.revertedWithCustomError(safeKeeper, "OwnableUnauthorizedAccount")
        .withArgs(noble.address);
    });

    it("Should revert when non-owner tries to withdraw fees", async function () {
      const { safeKeeper, noble } = await loadFixture(deploySafeKeeperFixture);

      await expect(safeKeeper.connect(noble).withdrawFees(noble.address))
        .to.be.revertedWithCustomError(safeKeeper, "OwnableUnauthorizedAccount")
        .withArgs(noble.address);
    });

    it("Should revert when setting fee over 100%", async function () {
      const { safeKeeper, owner } = await loadFixture(deploySafeKeeperFixture);

      await expect(
        safeKeeper.connect(owner).setFeeBasisPoints(10001)
      ).to.be.revertedWith("Fee cannot exceed 100%");
    });

    it("Should allow owner to withdraw collected fees", async function () {
      const { safeKeeper, owner, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 1000;
      const treasureAmount = ethers.parseEther("1");

      // Noble stores a treasure
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime, {
          value: treasureAmount,
        });

      // Calculate store fee
      const storeFee = (treasureAmount * 42n) / 10000n;

      // Owner withdraws fees
      await expect(() =>
        safeKeeper.connect(owner).withdrawFees(owner.address)
      ).to.changeEtherBalance(owner, storeFee);

      expect(await safeKeeper.collectedFees()).to.equal(0);
    });

    it("Should revert when withdrawing fees to zero address", async function () {
      const { safeKeeper, owner } = await loadFixture(deploySafeKeeperFixture);

      await expect(
        safeKeeper.connect(owner).withdrawFees(ZeroAddress)
      ).to.be.revertedWith("Recipient cannot be zero address");
    });
  });

  describe("View Functions", function () {
    it("Should return correct treasure IDs for noble and beneficiary", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime1 = (await time.latest()) + 365 * 24 * 60 * 60;
      const unlockTime2 = unlockTime1 + 1000;
      const treasureAmount = ethers.parseEther("1");

      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime1, {
          value: treasureAmount,
        });
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime2, {
          value: treasureAmount,
        });

      const nobleTreasureIds = await safeKeeper.viewTreasuresByNoble(
        noble.address
      );
      expect(nobleTreasureIds.length).to.equal(2);
      expect(nobleTreasureIds[0]).to.equal(0);
      expect(nobleTreasureIds[1]).to.equal(1);

      const beneficiaryTreasureIds =
        await safeKeeper.viewTreasuresByBeneficiary(beneficiary.address);
      expect(beneficiaryTreasureIds.length).to.equal(2);
      expect(beneficiaryTreasureIds[0]).to.equal(0);
      expect(beneficiaryTreasureIds[1]).to.equal(1);
    });

    it("Should return correct treasure details", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60;
      const treasureAmount = ethers.parseEther("1");

      // Store a treasure
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime, {
          value: treasureAmount,
        });

      const fee = (treasureAmount * 42n) / 10000n; // Taxa de 0.42%
      const netAmount = treasureAmount - fee;

      const treasure = await safeKeeper.getTreasureDetails(0);
      expect(treasure.amount).to.equal(netAmount);
      expect(treasure.unlockTime).to.equal(unlockTime);
      expect(treasure.noble).to.equal(noble.address);
      expect(treasure.beneficiary).to.equal(beneficiary.address);
      expect(treasure.claimed).to.equal(false);
    });
  });

  describe("Security Tests", function () {
    it("Should handle multiple treasures correctly", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const currentTime = await time.latest();
      const unlockTime1 = currentTime + 365 * 24 * 60 * 60;
      const unlockTime2 = currentTime + 2 * 365 * 24 * 60 * 60;
      const treasureAmount1 = ethers.parseEther("1");
      const treasureAmount2 = ethers.parseEther("2");

      // Store treasures
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime1, {
          value: treasureAmount1,
        });
      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime2, {
          value: treasureAmount2,
        });

      // Calculate fees and net amounts
      const storeFee1 = (treasureAmount1 * 42n) / 10000n;
      const netStoredAmount1 = treasureAmount1 - storeFee1;
      const storeFee2 = (treasureAmount2 * 42n) / 10000n;
      const netStoredAmount2 = treasureAmount2 - storeFee2;

      // Claim the first treasure
      await time.increaseTo(unlockTime1 + 1);
      const claimFee1 = (netStoredAmount1 * 42n) / 10000n;
      const netClaimAmount1 = netStoredAmount1 - claimFee1;

      await expect(() =>
        safeKeeper.connect(beneficiary).claimTreasure(0)
      ).to.changeEtherBalance(beneficiary, netClaimAmount1, {});

      // The second treasure cannot be claimed yet
      await expect(
        safeKeeper.connect(beneficiary).claimTreasure(1)
      ).to.be.revertedWith("Treasure not yet unlocked.");

      // Claim the second treasure
      await time.increaseTo(unlockTime2 + 1);
      const claimFee2 = (netStoredAmount2 * 42n) / 10000n;
      const netClaimAmount2 = netStoredAmount2 - claimFee2;

      await expect(() =>
        safeKeeper.connect(beneficiary).claimTreasure(1)
      ).to.changeEtherBalance(beneficiary, netClaimAmount2, {});
    });

    it("Should not allow noble to withdraw or interfere with the treasure after storing", async function () {
      const { safeKeeper, noble, beneficiary } = await loadFixture(
        deploySafeKeeperFixture
      );
      const unlockTime = (await time.latest()) + 365 * 24 * 60 * 60;
      const treasureAmount = ethers.parseEther("1");

      await safeKeeper
        .connect(noble)
        .storeTreasure(beneficiary.address, unlockTime, {
          value: treasureAmount,
        });

      // Noble tries to claim the treasure
      await time.increaseTo(unlockTime + 1);
      await expect(
        safeKeeper.connect(noble).claimTreasure(0)
      ).to.be.revertedWith("Not the beneficiary of this treasure.");

      // Noble tries to manipulate the treasure (not possible with the current contract)
      // Noble cannot alter the details of the treasure
    });
  });
});
