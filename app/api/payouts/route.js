import { NextResponse } from 'next/server';
import { getDB, saveDB } from '../../../lib/db';

export async function GET() {
    const db = getDB();
    return NextResponse.json({ success: true, payouts: db.payouts || [] });
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { orgWallet, researcherWallet, amountEth, reportId, txHash } = body;

        if (!orgWallet || !researcherWallet || !amountEth || !txHash) {
            return NextResponse.json({ error: "Missing required payout data" }, { status: 400 });
        }

        const db = getDB();
        if (!db.payouts) db.payouts = [];

        const newPayout = {
            id: Date.now(),
            orgWallet,
            researcherWallet,
            amountEth,
            reportId: reportId || "N/A",
            txHash,
            timestamp: new Date().toISOString()
        };

        db.payouts.push(newPayout);
        saveDB(db);

        return NextResponse.json({ success: true, payout: newPayout });
    } catch (error) {
        console.error("Payout log error:", error);
        return NextResponse.json({ error: "Server Error logging payout" }, { status: 500 });
    }
}
