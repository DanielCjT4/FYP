import { NextResponse } from 'next/server';
import { getDB, saveDB } from '../../../../lib/db';
import { encryptText, decryptText } from '../../../../lib/crypto';

// GET: Retrieve and decrypt comments for a specific report (authorized only)
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const reportIdStr = searchParams.get('reportId');
        const userAddress = searchParams.get('userAddress')?.toLowerCase();
        const username = searchParams.get('username')?.toLowerCase();

        if (!reportIdStr) {
            return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
        }

        const reportId = parseInt(reportIdStr, 10);
        const db = getDB();
        const report = db.reports?.find(r => r.id === reportId);

        if (!report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        // --- Basic Authorization Check ---
        const isOrg = report.organization && userAddress && (report.organization.toLowerCase() === userAddress);
        const isPrimaryResearcher = 
            (report.researcher && username && report.researcher.toLowerCase() === username) || 
            (report.researcher && userAddress && report.researcher.toLowerCase() === userAddress);
        
        const isCollaborator = report.collaborators && report.collaborators.some(c => {
            const cLower = c.toLowerCase();
            return (username && cLower === username) || (userAddress && cLower === userAddress);
        });

        // Validators are granted read-only access to discussions when the report is under dispute.
        // This is required for fair arbitration — validators must see the full communication history.
        const isValidatorRole = searchParams.get('isValidator') === 'true';
        const isDisputedReport = report.status === 'disputed';
        const isValidator = isValidatorRole && isDisputedReport && !!userAddress;

        // For prototype convenience, if we don't have userAddress or username we can allow, 
        // but let's enforce security for registered roles.
        const isAuthorized = isOrg || isPrimaryResearcher || isCollaborator || isValidator;

        if (!isAuthorized && (userAddress || username)) {
            return NextResponse.json({ error: "Unauthorized to access this discussion" }, { status: 403 });
        }

        // Fetch comments
        const discussions = db.discussions || {};
        const comments = discussions[reportId] || [];

        // Decrypt messages
        const decryptedComments = comments.map(c => ({
            sender: c.sender,
            senderName: c.senderName || c.sender,
            text: decryptText(c.text),
            timestamp: c.timestamp
        }));

        return NextResponse.json({ success: true, comments: decryptedComments });

    } catch (error) {
        console.error("Fetch discussion error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}

// POST: Add a new comment (encrypted and saved off-chain)
export async function POST(request) {
    try {
        const { reportId, sender, senderName, text } = await request.json();

        if (!reportId || !sender || !text) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const db = getDB();
        const report = db.reports?.find(r => r.id === parseInt(reportId, 10));

        if (!report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        // Encrypt the message text
        const encryptedMessage = encryptText(text);

        // Store in DB under discussions
        db.discussions = db.discussions || {};
        if (!db.discussions[reportId]) {
            db.discussions[reportId] = [];
        }

        const newComment = {
            sender,
            senderName: senderName || sender,
            text: encryptedMessage,
            timestamp: Date.now()
        };

        db.discussions[reportId].push(newComment);
        saveDB(db);

        return NextResponse.json({ success: true, comment: { ...newComment, text } });

    } catch (error) {
        console.error("Add comment error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
