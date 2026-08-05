import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');

    if (!fileUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(fileUrl);
        
        if (!response.ok) {
            return new NextResponse(`Failed to fetch model from storage: ${response.statusText}`, { status: response.status });
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
            },
        });
    } catch (error: any) {
        console.error('Proxy 3D error:', error);
        return new NextResponse(`Failed to proxy 3D model: ${error?.message || error}`, { status: 500 });
    }
}
