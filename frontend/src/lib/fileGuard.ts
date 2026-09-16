const DEFAULT_ALLOWED_HOSTS = ['pub-ccb200eead884efbac751122dac022ed.r2.dev'];

function getAllowedHosts(): string[] {
    const fromEnv = (process.env.NEXT_PUBLIC_ALLOWED_FILE_HOSTS || '')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_HOSTS;
}

/**
 * Only allow fetching attachments from known storage hosts.
 * Prevents SSRF: this proxy must never become a gateway to internal networks,
 * cloud metadata endpoints, or arbitrary third-party URLs.
 */
export function isAllowedFileUrl(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }

    const host = url.hostname.toLowerCase();

    // Local backend uploads are only reachable outside production
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    if (isLocal) {
        return process.env.NODE_ENV !== 'production' && url.protocol === 'http:';
    }

    if (url.protocol !== 'https:') return false;
    return getAllowedHosts().includes(host);
}

/** Strip anything that could break or inject into a Content-Disposition header. */
export function sanitizeFileName(name: string): string {
    const cleaned = name.replace(/[\r\n"\\]/g, '').replace(/[^\w.\- ()\[\]]/g, '_').trim();
    return cleaned.slice(0, 150) || 'download';
}
