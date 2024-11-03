SafeKeeper Solidity Smart Contract

The SafeKeeper contract securely stores Ether as “treasures” for designated beneficiaries, allowing them to claim these funds only after a specified unlock time. Designed for a use case where noble depositors entrust their Ether to heirs (beneficiaries) until the right time to unlock it, the contract includes features for secure storage, delayed access, and protection against reentrancy attacks.

Features

    •	Store Treasures with Unlock Times: Nobles (depositors) can store Ether for beneficiaries with individual unlock times.
    •	Claim Treasures: Beneficiaries can claim their treasures after the specified unlock time has passed.
    •	Reentrancy Protection: Protects against reentrancy attacks on the claimTreasure function.
    •	Flexible Viewing: Nobles and beneficiaries can view their stored treasures and their details.

Usage

Storing a Treasure

To store a treasure, call the storeTreasure function, specifying:

    •	beneficiary: The address of the heir who will eventually claim the Ether.
    •	unlockTime: The Unix timestamp after which the beneficiary can claim the Ether.

Example:

await safeKeeper.storeTreasure(beneficiary.address, unlockTime, { value: ethers.utils.parseEther("1") });

Claiming a Treasure

The claimTreasure function allows the designated beneficiary to claim the treasure after the unlockTime. Only the specified beneficiary can claim it, and only after the unlock time has passed.

Example:

await safeKeeper.connect(beneficiary).claimTreasure(treasureId);

Viewing Treasures

    •	For Nobles: Retrieve stored treasure IDs with viewTreasuresByNoble.
    •	For Beneficiaries: Retrieve treasure IDs they can claim with viewTreasuresByBeneficiary.
    •	For Specific Treasure Details: Call getTreasureDetails with a treasure ID to get the amount, unlock time, and claim status.

Contract Security

The SafeKeeper contract includes:

    •	ReentrancyGuard: Prevents reentrancy attacks in the claimTreasure function.
    •	Input Validation: Ensures the unlock time is in the future, the Ether value is greater than zero, and the beneficiary is a valid address.

Development Tools

    •	Hardhat: Ethereum development environment.
    •	Ethers.js: Library for interacting with the Ethereum blockchain.
    •	Solidity Coverage: Code coverage tool for Solidity.
    •	Chai: Assertion library for testing.

License

This project is licensed under the MIT License.

Make sure to replace https://github.com/your-username/safekeeper-contract.git with the actual URL of your repository.
