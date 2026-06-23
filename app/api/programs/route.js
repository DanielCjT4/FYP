import { NextResponse } from 'next/server';
import { getDB, saveDB } from '../../../lib/db';

// GET: Fetch all bounty programs
export async function GET() {
    const db = getDB();
    return NextResponse.json({ success: true, programs: db.programs || [] });
}

// POST: Create a new bounty program
export async function POST(request) {
    try {
        const body = await request.json();
        const { name, scope, description, bountyLow, bountyMedium, bountyHigh, bountyCritical, orgUsername } = body;

        if (!name || !scope) {
            return NextResponse.json({ error: "Program name and scope are required" }, { status: 400 });
        }

        const db = getDB();
        if (!db.programs) db.programs = [];

        const newProgram = {
            id: Date.now(),
            name,
            scope,
            description: description || "",
            bountyLow: bountyLow || "0",
            bountyMedium: bountyMedium || "0",
            bountyHigh: bountyHigh || "0",
            bountyCritical: bountyCritical || "0",
            orgUsername: orgUsername || "Unknown",
            active: true,
            createdAt: new Date().toISOString()
        };

        db.programs.push(newProgram);
        saveDB(db);

        return NextResponse.json({ success: true, program: newProgram });
    } catch (error) {
        console.error("Program creation error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}

// PUT: Update an existing program (toggle active, edit fields)
export async function PUT(request) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        const db = getDB();
        if (!db.programs) return NextResponse.json({ error: "No programs found" }, { status: 404 });

        const index = db.programs.findIndex(p => p.id === id);
        if (index === -1) return NextResponse.json({ error: "Program not found" }, { status: 404 });

        db.programs[index] = { ...db.programs[index], ...updates };
        saveDB(db);

        return NextResponse.json({ success: true, program: db.programs[index] });
    } catch (error) {
        console.error("Program update error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}

// DELETE: Remove a program
export async function DELETE(request) {
    try {
        const { id } = await request.json();
        const db = getDB();
        if (!db.programs) return NextResponse.json({ error: "No programs found" }, { status: 404 });

        db.programs = db.programs.filter(p => p.id !== id);
        saveDB(db);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Program delete error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
