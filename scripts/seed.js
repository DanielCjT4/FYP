const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n🌱 ═══════════════════════════════════════");
    console.log("   DecenBug Seed Script");
    console.log("═══════════════════════════════════════════\n");

    // Get Hardhat signers (Account #0, #1, #2)
    const [researcher, organization, validator] = await ethers.getSigners();

    // Get deployed contract address from Ignition
    const deploymentPath = path.join(__dirname, "..", "ignition", "deployments", "chain-1337", "deployed_addresses.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ No deployment found. Run deployment first:");
        console.error("   npx hardhat ignition deploy ./ignition/modules/VulnerabilityPlatform.js --network localhost");
        process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contractAddress = deployedAddresses["VulnerabilityPlatformModule#VulnerabilityPlatform"];
    console.log(`📄 Contract: ${contractAddress}\n`);

    // Get contract instance
    const VulnerabilityPlatform = await ethers.getContractFactory("VulnerabilityPlatform");
    const contract = VulnerabilityPlatform.attach(contractAddress);

    // ─── Step 1: Register Users ───
    console.log("👤 Registering users...");

    try {
        const tx1 = await contract.connect(researcher).registerUser(1, "Alice", "QmSeedResearcherProfile");
        await tx1.wait();
        console.log(`   ✅ Researcher: ${researcher.address} → "Alice"`);
    } catch (e) {
        console.log(`   ⚠️  Researcher already registered or error: ${e.reason || e.message}`);
    }

    try {
        const tx2 = await contract.connect(organization).registerUser(2, "CyberCorp", "QmSeedOrgProfile");
        await tx2.wait();
        console.log(`   ✅ Organization: ${organization.address} → "CyberCorp"`);
    } catch (e) {
        console.log(`   ⚠️  Organization already registered or error: ${e.reason || e.message}`);
    }

    try {
        const tx3 = await contract.connect(validator).registerUser(3, "Judge", "QmSeedValidatorProfile");
        await tx3.wait();
        console.log(`   ✅ Validator: ${validator.address} → "Judge"`);
    } catch (e) {
        console.log(`   ⚠️  Validator already registered or error: ${e.reason || e.message}`);
    }

    // ─── Step 2: Fund Org Vault ───
    console.log("\n💰 Funding Organization vault...");
    try {
        const fundTx = await contract.connect(organization).fundVault({ value: ethers.parseEther("10") });
        await fundTx.wait();
        const vaultBal = await contract.orgVaults(organization.address);
        console.log(`   ✅ Vault funded: ${ethers.formatEther(vaultBal)} ETH`);
    } catch (e) {
        console.log(`   ⚠️  Vault funding error: ${e.reason || e.message}`);
    }

    // ─── Step 3: Create Sample Bounty Program On-Chain ───
    console.log("\n📋 Creating sample bounty program on-chain...");
    try {
        // In production this CID would point to real IPFS data
        // For seeding, we use a dummy CID — the details are in the JSON below
        const programDetails = JSON.stringify({
            name: "CyberCorp Web Security",
            scope: "Web Application, API, Smart Contracts",
            description: "Find vulnerabilities in CyberCorp's web infrastructure and smart contracts. All severity levels accepted.",
            bountyLow: "0.05",
            bountyMedium: "0.2",
            bountyHigh: "1.0",
            bountyCritical: "5.0",
            orgName: "CyberCorp"
        });
        // Use a deterministic fake CID for seeding (no IPFS needed)
        const fakeCid = "QmSeedProgram_CyberCorpWebSecurity";
        const progTx = await contract.connect(organization).createProgram(fakeCid);
        await progTx.wait();
        const count = await contract.programCount();
        console.log(`   ✅ Program #${count} created on-chain (CID: ${fakeCid})`);
    } catch (e) {
        console.log(`   ⚠️  Program creation error: ${e.reason || e.message}`);
    }

    // ─── Step 4: Reset Local DB Cache ───
    console.log("\n🗄️  Resetting local database cache...");
    const dbPath = path.join(__dirname, "..", "data", "db.json");
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const freshDB = {
        reports: [],
        programs: [],  // Programs now live on-chain, this is just a cache
        payouts: []
    };
    fs.writeFileSync(dbPath, JSON.stringify(freshDB, null, 2));
    console.log("   ✅ data/db.json reset");

    // ─── Summary ───
    console.log("\n═══════════════════════════════════════════");
    console.log("🎉 Seed complete! Quick reference:");
    console.log("═══════════════════════════════════════════");
    console.log(`   Contract:     ${contractAddress}`);
    console.log(`   Researcher:   ${researcher.address} (Account #0) → "Alice"`);
    console.log(`   Organization: ${organization.address} (Account #1) → "CyberCorp"`);
    console.log(`   Validator:    ${validator.address} (Account #2) → "Judge"`);
    console.log(`   Org Vault:    10 ETH`);
    console.log(`   Program:      #1 "CyberCorp Web Security"`);
    console.log("\n📝 Next: Reset MetaMask activity data, then login at http://localhost:3000\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
