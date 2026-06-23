import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Detect real file type from the first bytes of the decrypted content.
// Pinata loses the original Content-Type when storing encrypted binary blobs,
// so we must sniff the decrypted payload to set the correct Content-Type.
function detectMimeType(buffer) {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return 'application/pdf';
    }
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    // GIF: GIF8
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return 'image/gif';
    }
    // ZIP (also used by DOCX, XLSX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
        return 'application/zip';
    }
    // MP4: ftyp at offset 4
    if (buffer.length > 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return 'video/mp4';
    }
    // Try JSON
    try {
        JSON.parse(buffer.toString('utf8'));
        return 'application/json';
    } catch (_) { }
    // Try plain text (UTF-8 readable)
    const sample = buffer.slice(0, 512).toString('utf8');
    if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(sample)) {
        return 'text/plain';
    }
    return 'application/octet-stream';
}

export async function GET(request) {
    try {
        const cid = request.nextUrl.searchParams.get('cid');
        const download = request.nextUrl.searchParams.get('download') === 'true';
        const filename = request.nextUrl.searchParams.get('filename') || cid;

        if (!cid) {
            return NextResponse.json({ error: "No CID provided" }, { status: 400 });
        }

        // Fetch the raw blob from Pinata
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch from Pinata" }, { status: res.status });
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // --- AES-GCM Server-Side Decryption ---
        const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '12345678901234567890123456789012');

        // Check if it's large enough to have IV (12) + AuthTag (16)
        if (buffer.length > 28) {
            try {
                const iv = buffer.slice(0, 12);
                const authTag = buffer.slice(12, 28);
                const encrypted = buffer.slice(28);

                const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
                decipher.setAuthTag(authTag);
                let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
                
                // Detect real content type from decrypted bytes
                const contentType = detectMimeType(decrypted);

                const headers = {
                    'Content-Type': contentType
                };
                if (download) {
                    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
                }

                return new NextResponse(decrypted, { headers });
            } catch (e) {
                // If decryption fails (e.g., auth tag mismatch or wrong key), it was probably 
                // a plaintext file uploaded before encryption was added. We fallback to raw.
                console.warn("Decryption failed for CID, returning raw fallback:", cid);
            }
        }

        // Fallback: Return raw buffer (For old plain-text JSONs/Images)
        // Also sniff for JSON in case this is a legacy plaintext program details file
        let fallbackContentType = res.headers.get('Content-Type') || 'application/octet-stream';
        try {
            JSON.parse(buffer.toString('utf8'));
            fallbackContentType = 'application/json';
        } catch (_) {
            // Not JSON — keep original content type
        }

        const headers = {
            'Content-Type': fallbackContentType
        };
        if (download) {
            headers['Content-Disposition'] = `attachment; filename="${filename}"`;
        }

        return new NextResponse(buffer, { headers });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Error reading from IPFS" }, { status: 500 });
    }
}
