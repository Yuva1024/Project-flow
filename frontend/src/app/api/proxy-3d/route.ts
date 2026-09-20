import { NextResponse } from 'next/server';
import { isAllowedFileUrl } from '@/lib/fileGuard';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');

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
            return new NextResponse('Failed to fetch model from storage', { status: response.status });
        }

        const data = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'model/gltf-binary';

        return new NextResponse(data, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Proxy 3D error:', error);
        return new NextResponse('Failed to proxy 3D model', { status: 500 });
    }
}
