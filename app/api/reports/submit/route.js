import { NextResponse } from 'next/server';
import { getDB, saveDB } from '../../../../lib/db';

export async function POST(request) {
    try {
        const body = await request.json();
        const { id, title, description, severity, cvssScore, researcher, cid, txHash, program, organization, collaborators } = body;

        if (!researcher || !cid || !txHash) {
            return NextResponse.json({ error: "Missing critical Web3 data" }, { status: 400 });
        }

        // Save to Local DB
        const db = getDB();
        
        // Ensure reports array exists
        if (!db.reports) {
            db.reports = [];
        }

        const newReport = {
            id: id || Date.now(),
            title: title || "Untitled Report",
            description: description || "No description provided.",
            severity: severity || "None",
            cvssScore: cvssScore !== undefined ? cvssScore : null,
            program: program || "Unknown",
            researcher: researcher,
            cid: cid,
            txHash: txHash,
            organization: organization || "",
            collaborators: Array.isArray(collaborators) ? collaborators : [],
            status: "submitted",
            timestamp: new Date().toISOString()
        };
        
        db.reports.push(newReport);
        saveDB(db);

        return NextResponse.json({ success: true, report: newReport });

    } catch (error) {
        console.error("DB Save Error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
