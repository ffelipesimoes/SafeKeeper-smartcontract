// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SafeKeeper
 * @dev The SafeKeeper stores treasures from nobles until the right time arrives for each treasure to be claimed.
 *      This contract allows multiple treasures to be stored with individual unlock times and beneficiaries.
 */
contract SafeKeeper is ReentrancyGuard, Ownable {
    /// @notice Structure to store information about each treasure.
    struct Treasure {
        uint256 amount;         // Amount of Ether stored as treasure
        uint256 unlockTime;     // Timestamp when the treasure can be claimed
        bool claimed;           // Status indicating if the treasure has been claimed
        address noble;          // Address of the noble (depositor) who stored the treasure
        address beneficiary;    // Address of the beneficiary (heir) who can claim the treasure
    }

    /// @notice Unique ID to assign to each new treasure.
    uint256 public nextTreasureId;

    /// @dev Mapping of each treasure ID to its associated Treasure data.
    mapping(uint256 => Treasure) public treasures;

    /// @dev Mapping of each noble to an array of treasure IDs they have stored.
    mapping(address => uint256[]) public nobleTreasures;

    /// @dev Mapping of each heir (beneficiary) to an array of treasure IDs they can claim.
    mapping(address => uint256[]) public heirTreasures;

    /// @notice Fee in basis points
    uint256 public feeBasisPoints = 42;

    /// @notice Total collected fees
    uint256 public collectedFees;

    // @notice Initializes the contract with the deployer as the owner.
    constructor() Ownable(msg.sender) {}

    /// @notice Event emitted when a new treasure is stored by a noble.
    /// @param noble Address of the noble (depositor) who stored the treasure.
    /// @param beneficiary Address of the beneficiary who can claim the treasure.
    /// @param amount Amount of Ether stored as treasure (after fee deduction).
    /// @param unlockTime Timestamp when the treasure will be available for claim.
    /// @param treasureId Unique ID of the stored treasure.
    event TreasureStored(address indexed noble, address indexed beneficiary, uint256 amount, uint256 unlockTime, uint256 treasureId);

    /// @notice Event emitted when a treasure is successfully claimed by the beneficiary.
    /// @param beneficiary Address of the beneficiary who claimed the treasure.
    /// @param amount Amount of Ether claimed from the treasure (after fee deduction).
    /// @param treasureId Unique ID of the claimed treasure.
    event TreasureClaimed(address indexed beneficiary, uint256 amount, uint256 treasureId);

    /// @notice Event emitted when the fee is updated.
    /// @param newFeeBasisPoints The new fee in basis points.
    event FeeUpdated(uint256 newFeeBasisPoints);

    /// @notice Event emitted when the owner withdraws the collected fees.
    /// @param recipient Address that received the withdrawn fees.
    /// @param amount Amount of Ether withdrawn.
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    /**
     * @notice Allows a noble to store a treasure for a specified beneficiary with an unlock time.
     * @dev Collects a fee of 0.420% on the deposited amount.
     * @param beneficiary The address that will be able to claim the treasure after the unlock time.
     * @param unlockTime The Unix timestamp at which the treasure will become claimable.
     */
    function storeTreasure(address beneficiary, uint256 unlockTime) external payable {
        require(beneficiary != address(0), "Beneficiary must be a valid address.");
        require(msg.value > 0, "Treasure value must be greater than zero.");
        require(unlockTime > block.timestamp, "Unlock time must be in the future.");

        // Calculate fee and net amount
        uint256 fee = (msg.value * feeBasisPoints) / 10000;
        uint256 netAmount = msg.value - fee;
        collectedFees += fee;

        // Create and store the treasure with the specified details
        treasures[nextTreasureId] = Treasure({
            amount: netAmount,
            unlockTime: unlockTime,
            claimed: false,
            noble: msg.sender,
            beneficiary: beneficiary
        });

        // Record treasure ID in both noble and beneficiary mappings
        nobleTreasures[msg.sender].push(nextTreasureId);
        heirTreasures[beneficiary].push(nextTreasureId);

        emit TreasureStored(msg.sender, beneficiary, netAmount, unlockTime, nextTreasureId);

        // Increment the treasure ID counter for the next treasure
        nextTreasureId++;
    }

    /**
     * @notice Allows the beneficiary to claim a specific treasure once the unlock time has passed.
     * @dev Collects a fee on the treasure amount at withdrawal.
     * @param treasureId The ID of the treasure to be claimed.
     */
    function claimTreasure(uint256 treasureId) external nonReentrant {
        Treasure storage treasure = treasures[treasureId];

        require(treasure.beneficiary == msg.sender, "Not the beneficiary of this treasure.");
        require(!treasure.claimed, "Treasure already claimed.");
        require(block.timestamp >= treasure.unlockTime, "Treasure not yet unlocked.");
        require(treasure.amount > 0, "No amount to claim.");

        // Calculate fee and net amount
        uint256 fee = (treasure.amount * feeBasisPoints) / 10000;
        uint256 netAmount = treasure.amount - fee;
        collectedFees += fee;

        treasure.claimed = true;
        treasure.amount = 0;

        (bool success, ) = msg.sender.call{value: netAmount}("");
        require(success, "Treasure transfer failed.");

        emit TreasureClaimed(msg.sender, netAmount, treasureId);
    }

    /**
     * @notice Allows the owner to set a new fee.
     * @dev The fee is specified in basis points (1% = 100 basis points).
     * @param newFeeBasisPoints The new fee in basis points.
     */
    function setFeeBasisPoints(uint256 newFeeBasisPoints) external onlyOwner {
        require(newFeeBasisPoints <= 10000, "Fee cannot exceed 100%");
        feeBasisPoints = newFeeBasisPoints;
        emit FeeUpdated(newFeeBasisPoints);
    }

    /**
     * @notice Allows the owner to withdraw the collected fees.
     * @param recipient Address to receive the withdrawn fees.
     */
    function withdrawFees(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Recipient cannot be zero address");
        uint256 amount = collectedFees;
        collectedFees = 0;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit FeesWithdrawn(recipient, amount);
    }

    /**
     * @notice Returns the IDs of treasures stored by a specific noble.
     * @param noble The address of the noble to be queried.
     * @return Array of treasure IDs stored by the specified noble.
     */
    function viewTreasuresByNoble(address noble) external view returns (uint256[] memory) {
        return nobleTreasures[noble];
    }

    /**
     * @notice Returns the IDs of treasures assigned to a specific beneficiary.
     * @param beneficiary The address of the beneficiary to be queried.
     * @return Array of treasure IDs assigned to the specified beneficiary.
     */
    function viewTreasuresByBeneficiary(address beneficiary) external view returns (uint256[] memory) {
        return heirTreasures[beneficiary];
    }

    /**
     * @notice Provides details of a specific treasure by its ID.
     * @param treasureId The ID of the treasure to retrieve.
     * @return Treasure struct containing amount, unlockTime, claimed status, noble, and beneficiary addresses.
     */
    function getTreasureDetails(uint256 treasureId) external view returns (Treasure memory) {
        return treasures[treasureId];
    }
}