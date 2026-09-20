import { NextResponse } from 'next/server';
import { isAllowedFileUrl, sanitizeFileName } from '@/lib/fileGuard';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');
    const fileName = sanitizeFileName(searchParams.get('name') || 'download');

    if (!fileUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    if (!isAllowedFileUrl(fileUrl)) {
        return new NextResponse('URL not allowed', { status: 403 });
    }

    try {
        // `redirect: 'manual'` matters: isAllowedFileUrl only vets the URL we were
        // given. With the default redirect handling, a 3xx from the storage host
        // would be followed to wherever it points — including internal addresses
        // and cloud metadata endpoints — re-opening the SSRF hole the guard closes.
        const response = await fetch(fileUrl, { redirect: 'manual' });

        if (response.status >= 300 && response.status < 400) {
            return new NextResponse('Redirects are not followed', { status: 502 });
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const data = await response.blob();

        // Return the file with headers that force a download
        return new NextResponse(data, {
            headers: {
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Proxy download error:', error);
        return new NextResponse('Failed to download file', { status: 500 });
    }
}
