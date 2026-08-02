import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');
    const fileName = searchParams.get('name') || 'download';

    if (!fileUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(fileUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const data = await response.blob();
        
        // Return the file with headers that force a download
        return new NextResponse(data, {
            headers: {
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
            },
        });
    } catch (error) {
        console.error('Proxy download error:', error);
        return new NextResponse('Failed to download file', { status: 500 });
    }
}
