import { NextResponse } from 'next/server';
import { getDB, saveDB } from '../../../lib/db';

export async function GET() {
    const db = getDB();
    return NextResponse.json({ success: true, reports: db.reports || [] });
}

export async function POST(request) {
    try {
        const { reportId, status, rejectionCid, disputeCid } = await request.json();

        const db = getDB();
        const reportIndex = db.reports.findIndex(r => r.id === reportId);

        if (reportIndex === -1) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        if (status) db.reports[reportIndex].status = status;
        if (rejectionCid) db.reports[reportIndex].rejectionCid = rejectionCid;
        if (disputeCid) db.reports[reportIndex].disputeCid = disputeCid;

        saveDB(db);

        return NextResponse.json({ success: true, report: db.reports[reportIndex] });

    } catch (error) {
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
