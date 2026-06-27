import { NextResponse } from 'next/server';

export const config = {
    api: {
        bodyParser: false,
    },
};

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
            return NextResponse.json({ error: "No files received." }, { status: 400 });
        }

        // --- AES-GCM Server-Side Encryption ---
        const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '12345678901234567890123456789012');
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const crypto = require('crypto');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Structure: IV (12 bytes) + AuthTag (16 bytes) + Encrypted Payload
        const finalBuffer = Buffer.concat([iv, authTag, encrypted]);
        const encryptedBlob = new Blob([finalBuffer]);

        // We must reconstruct the FormData object so Node.js explicitly sets the file name
        // Otherwise, Pinata receives an anonymous blob and hides it or names it 'unknown'
        const pinataData = new FormData();
        pinataData.append("file", encryptedBlob, file.name);
        
        // Tell Pinata to explicitly label this file in the Web Dashboard
        pinataData.append("pinataMetadata", JSON.stringify({
            name: file.name || "DecenBug_Encrypted_Data"
        }));

        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.PINATA_JWT}`,
            },
            body: pinataData,
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Error uploading to Pinata" }, { status: 500 });
    }
}
