const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n🔄 ═══════════════════════════════════════");
    console.log("   Cache Rebuilder (Blockchain -> DB)");
    console.log("═══════════════════════════════════════════\n");

    const deploymentPath = path.join(__dirname, "..", "ignition", "deployments", "chain-1337", "deployed_addresses.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ No deployment found. Please deploy the contract first.");
        process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contractAddress = deployedAddresses["VulnerabilityPlatformModule#VulnerabilityPlatform"];
    console.log(`📄 Contract: ${contractAddress}\n`);

    const VulnerabilityPlatform = await ethers.getContractFactory("VulnerabilityPlatform");
    const contract = VulnerabilityPlatform.attach(contractAddress);

    // ─── Step 1: Rebuild Reports ───
    console.log("📥 Fetching reports from blockchain...");
    const reportCount = await contract.reportCount();
    const totalReports = Number(reportCount);
    const rebuiltReports = [];

    const statusMap = {
        0: 'submitted',
        1: 'acknowledged',
        2: 'validated',
        3: 'rejected',
        4: 'disputed',
        5: 'resolved'
    };

    for (let i = 1; i <= totalReports; i++) {
        const report = await contract.reports(i);
        if (Number(report.id) === 0) continue;

        const statusStr = statusMap[Number(report.status)] || 'submitted';
        
        let details = { 
            title: `Report #${i}`, 
            description: 'Could not fetch from IPFS', 
            severity: 'Unknown', 
            program: 'Unknown' 
        };

        // Try to fetch IPFS details if CID exists
        if (report.cid) {
            try {
                console.log(`   Fetching IPFS for report #${i}...`);
                // Timeout added to avoid hanging forever if IPFS gateway is slow
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(`https://gateway.pinata.cloud/ipfs/${report.cid}`, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    const data = await res.json();
                    details = { ...details, ...data };
                }
            } catch (e) {
                console.log(`   ⚠️ Failed to fetch IPFS CID ${report.cid} for report #${i}`);
            }
        }

        rebuiltReports.push({
            id: Number(report.id),
            title: details.title,
            description: details.description,
            severity: details.severity,
            program: details.program,
            researcher: report.researcher,
            cid: report.cid,
            txHash: 'Rebuilt-from-chain', // We don't easily have the original submission txHash without parsing all events
            status: statusStr,
            timestamp: new Date(Number(report.timestamp) * 1000).toISOString()
        });
    }

    // ─── Step 2: Rebuild Payouts ───
    console.log("\n💸 Fetching payout events from blockchain...");
    const rebuiltPayouts = [];
    
    try {
        const filter = contract.filters.PayoutReleased();
        const events = await contract.queryFilter(filter, 0, 'latest');
        
        for (const event of events) {
            const block = await event.getBlock();
            const reportId = Number(event.args.reportId);
            const amountEth = ethers.formatEther(event.args.amount);
            
            // Get org address from the report
            const report = await contract.reports(reportId);
            const orgWallet = report.organization;

            rebuiltPayouts.push({
                id: Number(event.blockHash.slice(0, 10).replace(/[^0-9]/g, '')) || Date.now() + Math.floor(Math.random() * 1000), // deterministic pseudo-id
                orgWallet: orgWallet,
                researcherWallet: event.args.researcher,
                amountEth: amountEth,
                reportId: reportId,
                txHash: event.transactionHash,
                timestamp: new Date(Number(block.timestamp) * 1000).toISOString()
            });
        }
    } catch (e) {
        console.log(`   ⚠️ Failed to parse payout events: ${e.message}`);
    }

    // ─── Step 3: Write to db.json ───
    console.log("\n🗄️  Writing rebuilt data to local database...");
    const dbPath = path.join(__dirname, "..", "data", "db.json");
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    // We don't overwrite programs since they are now fully fetched directly on frontend
    const newDb = {
        reports: rebuiltReports.reverse(), // Newest first
        programs: [],
        payouts: rebuiltPayouts.reverse()
    };

    fs.writeFileSync(dbPath, JSON.stringify(newDb, null, 2));
    
    console.log(`   ✅ Rebuilt ${rebuiltReports.length} reports.`);
    console.log(`   ✅ Rebuilt ${rebuiltPayouts.length} payouts.`);
    console.log("\n═══════════════════════════════════════════");
    console.log("🎉 Cache rebuild complete!");
    console.log("═══════════════════════════════════════════\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
