import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { getS3Client } from '../utils/s3';

export interface SendToDiversionOptions {
    assetId: string;
    workspaceId: string;
    repoId: string;
    branch?: string;
    targetPath: string;
    commitMessage?: string;
    userId: string;
    apiKey?: string;
}

export interface DiversionExportResult {
    success: boolean;
    repoId: string;
    branch: string;
    path: string;
    fileName: string;
    fileSize: number;
    status: number;
    diversionResponse?: any;
}

export interface DiversionRepoItem {
    id: string;
    name: string;
    defaultBranch: string;
    description?: string;
    syncGitRepoUrl?: string;
}

function getEffectiveToken(apiKey?: string): string {
    const token = apiKey?.trim() || process.env.DIVERSION_API_TOKEN?.trim();
    if (!token) {
        throw new Error('Diversion API key is missing. Please enter your API key or configure DIVERSION_API_TOKEN on the server.');
    }
    return token;
}

/** Upload window for large binary assets. Every other call uses a short timeout. */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function getBaseUrl(): string {
    return (process.env.DIVERSION_API_BASE_URL || 'https://api.diversion.dev/v0').replace(/\/+$/, '');
}

function extractKeyFromUrl(fileUrl: string): string | null {
    if (fileUrl.includes('/files/')) {
        return 'files/' + fileUrl.split('/files/').pop();
    }
    if (fileUrl.includes('/attachments/')) {
        return 'attachments/' + fileUrl.split('/attachments/').pop();
    }
    if (fileUrl.includes('/assets/')) {
        return 'assets/' + fileUrl.split('/assets/').pop();
    }
    return null;
}

/**
 * Fetches the list of repositories accessible to the user via Diversion API.
 */
export const listDiversionRepositories = async (apiKey?: string): Promise<DiversionRepoItem[]> => {
    const token = getEffectiveToken(apiKey);
    const baseUrl = getBaseUrl();

    try {
        const response = await axios.get(`${baseUrl}/repos`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-DV-Client-ID': 'project-flow',
            },
            timeout: 15000,
        });

        const items: any[] = response.data?.items || [];
        return items.map((repo: any) => ({
            id: repo.repo_id,
            name: repo.repo_name,
            defaultBranch: repo.default_branch_name || 'main',
            description: repo.description,
            syncGitRepoUrl: repo.sync_git_repo_url,
        }));
    } catch (err: any) {
        const status = err.response?.status;
        const msg = err.response?.data?.detail || err.response?.data?.message || err.message;
        throw new Error(`Failed to list Diversion repositories (${status || 'Network'}): ${msg}`);
    }
};

/**
 * Resolves a branch name (e.g. 'main') to its corresponding branch_id if available.
 */
async function resolveBranchId(repoId: string, branch: string, token: string, baseUrl: string): Promise<string> {
    try {
        const encodedRepoId = encodeURIComponent(repoId);
        const res = await axios.get(`${baseUrl}/repos/${encodedRepoId}/branches`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-DV-Client-ID': 'project-flow',
            },
            timeout: 10000,
        });
        const branches: any[] = res.data?.items || [];
        const match = branches.find((b: any) => b.branch_name === branch || b.branch_id === branch);
        if (match?.branch_id) {
            return match.branch_id;
        }
    } catch (err: any) {
        console.warn('[Diversion] Could not resolve branch ID:', err.message);
    }
    return branch;
}

/**
 * Finds or creates an active workspace in the Diversion repository.
 * Diversion file mutation endpoints require a workspace ID as ref_id.
 */
async function getOrCreateWorkspace(
    repoId: string,
    branch: string,
    token: string,
    baseUrl: string
): Promise<string> {
    const encodedRepoId = encodeURIComponent(repoId);

    // 1. Resolve branch ID
    const targetBranchId = await resolveBranchId(repoId, branch, token, baseUrl);

    // 2. Check for existing workspaces in this repository
    try {
        const res = await axios.get(`${baseUrl}/repos/${encodedRepoId}/workspaces`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-DV-Client-ID': 'project-flow',
            },
            timeout: 10000,
        });

        const workspaces: any[] = res.data?.items || [];
        console.log(`[Diversion] Found ${workspaces.length} existing workspaces in repository ${repoId}`);

        // Try to find a workspace matching our branch or dedicated name
        const matchedWs = workspaces.find((ws: any) =>
            ws.name === 'project-flow' ||
            ws.name === `project-flow-${branch}` ||
            ws.branch_id === targetBranchId ||
            ws.branch_id === branch
        );

        if (matchedWs?.workspace_id) {
            console.log(`[Diversion] Reusing existing workspace: ${matchedWs.workspace_id} (${matchedWs.name})`);
            return matchedWs.workspace_id;
        }

        // If any workspace exists in this repo, use the first available workspace
        if (workspaces.length > 0 && workspaces[0].workspace_id) {
            console.log(`[Diversion] Reusing workspace: ${workspaces[0].workspace_id} (${workspaces[0].name})`);
            return workspaces[0].workspace_id;
        }
    } catch (listErr: any) {
        console.warn('[Diversion] Could not list workspaces:', listErr.response?.data || listErr.message);
    }

    // 3. Create a new workspace if none existed
    try {
        const wsName = `pf-${Date.now().toString(36)}`;
        const body: Record<string, any> = {
            name: wsName,
        };
        if (targetBranchId && targetBranchId !== 'main') {
            body.branch_id = targetBranchId;
        }

        console.log(`[Diversion] Creating new workspace: ${wsName}`, body);
        const createRes = await axios.post(`${baseUrl}/repos/${encodedRepoId}/workspaces`, body, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-DV-Client-ID': 'project-flow',
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });

        const newWsId = createRes.data?.id || createRes.data?.workspace_id;
        if (newWsId) {
            console.log(`[Diversion] Created workspace successfully: ${newWsId}`);
            return newWsId;
        }
    } catch (createErr: any) {
        const status = createErr.response?.status;
        const errDetail = createErr.response?.data?.detail || createErr.message;
        console.warn(`[Diversion] Create workspace returned HTTP ${status}: ${errDetail}`);

        // If workspace name conflicted or already created, re-fetch workspaces
        try {
            const retryRes = await axios.get(`${baseUrl}/repos/${encodedRepoId}/workspaces`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DV-Client-ID': 'project-flow',
                },
            });
            const items: any[] = retryRes.data?.items || [];
            if (items.length > 0 && items[0].workspace_id) {
                return items[0].workspace_id;
            }
        } catch {
            // ignore
        }

        throw new Error(`Failed to initialize Diversion workspace: ${errDetail}`);
    }

    throw new Error('Unable to find or create a Diversion workspace for file upload.');
}

/**
 * Fetches the list of folder paths in a Diversion repository branch using the tree API.
 */
export const listDiversionFolders = async (repoId: string, branch = 'main', apiKey?: string): Promise<string[]> => {
    const token = getEffectiveToken(apiKey);
    const baseUrl = getBaseUrl();

    try {
        const encodedRepo = encodeURIComponent(repoId);
        // Try to resolve branch name to branch ID or commit ID for tree fetching
        let targetRef = branch;
        try {
            const branchRes = await axios.get(`${baseUrl}/repos/${encodedRepo}/branches`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DV-Client-ID': 'project-flow',
                },
                timeout: 10000,
            });
            const branches: any[] = branchRes.data?.items || [];
            const matched = branches.find((b: any) => b.branch_name === branch || b.branch_id === branch);
            if (matched) {
                targetRef = matched.branch_id || matched.commit_id || branch;
            }
        } catch {
            // Fallback to passing branch directly
        }

        const encodedRef = encodeURIComponent(targetRef);
        const url = `${baseUrl}/repos/${encodedRepo}/trees/${encodedRef}`;

        const response = await axios.get(url, {
            params: {
                dirs_only: true,
                recurse: true,
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-DV-Client-ID': 'project-flow',
            },
            timeout: 15000,
        });

        const items: any[] = response.data?.items || [];
        // Extract paths and sort alphabetically
        const folderPaths = items
            .map((entry: any) => entry.path?.trim())
            .filter(Boolean);

        return Array.from(new Set(folderPaths)).sort();
    } catch (err: any) {
        const status = err.response?.status;
        const msg = err.response?.data?.detail || err.response?.data?.message || err.message;
        console.warn(`[Diversion] Could not fetch folder tree (${status}): ${msg}`);
        // Return empty array instead of throwing, so user can still manually type the folder path
        return [];
    }
};

/**
 * Streams an asset directly from Cloudflare R2 into the Diversion version control API.
 * Uses Node.js Readable streams and Axios chunked transfer encoding with zero disk or memory buffering.
 */
export const streamAssetToDiversion = async (options: SendToDiversionOptions): Promise<DiversionExportResult> => {
    const { assetId, workspaceId, repoId, branch = 'main', targetPath, commitMessage, apiKey } = options;

    const token = getEffectiveToken(apiKey);
    const baseUrl = getBaseUrl();

    // 1. Fetch asset record from database
    const asset = await prisma.asset.findUnique({
        where: { id: assetId },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
        throw new Error('Asset not found or access denied in this workspace.');
    }

    // 2. Obtain direct Readable stream (from Cloudflare R2 or local fallback)
    const s3Client = getS3Client();
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const r2Key = extractKeyFromUrl(asset.fileUrl);

    let stream: Readable;

    if (s3Client && bucketName && r2Key) {
        try {
            console.log(`[Diversion] Requesting stream from Cloudflare R2 key: ${r2Key}`);
            const s3Response = await s3Client.send(
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: r2Key,
                })
            );

            if (!s3Response.Body) {
                throw new Error(`Cloudflare R2 returned empty body for object key: ${r2Key}`);
            }

            stream = s3Response.Body as Readable;
        } catch (s3Err: any) {
            console.error(`[Diversion] Failed to stream from Cloudflare R2:`, s3Err);
            throw new Error(`Failed to retrieve file stream from Cloudflare R2: ${s3Err.message}`);
        }
    } else {
        // Local storage fallback stream
        const filename = r2Key ? r2Key.split('/').pop() || r2Key : path.basename(asset.fileUrl);
        const localPath = path.join(__dirname, '../../uploads', filename);

        if (fs.existsSync(localPath)) {
            console.log(`[Diversion] Streaming from local storage fallback: ${localPath}`);
            stream = fs.createReadStream(localPath);
        } else {
            throw new Error(`File binary not found in Cloudflare R2 or local storage for asset: ${asset.fileName}`);
        }
    }

    // 3. Normalize destination path: turn Windows backslashes into forward slashes,
    //    then drop any '.'/'..' segments. encodeURIComponent leaves '..' untouched,
    //    so without this a targetPath of '../../x' escapes the intended folder.
    const safeFileName = path.basename(asset.fileName).replace(/^\.+/, '') || 'file';
    let cleanPath = targetPath
        .replace(/\\+/g, '/')
        .split('/')
        .map(segment => segment.trim())
        .filter(segment => segment && segment !== '.' && segment !== '..')
        .join('/');
    if (!cleanPath.toLowerCase().endsWith(safeFileName.toLowerCase())) {
        cleanPath = cleanPath ? `${cleanPath}/${safeFileName}` : safeFileName;
    }

    // 4. Resolve / obtain active Diversion workspace ID (ref_id for file uploads MUST be a workspace ID)
    const diversionWorkspaceId = await getOrCreateWorkspace(repoId, branch, token, baseUrl);

    // Construct Diversion file mutation URL: POST /repos/{repo_id}/files/{workspace_id}/{path}
    const encodedRepoId = encodeURIComponent(repoId);
    const encodedWsId = encodeURIComponent(diversionWorkspaceId);
    const encodedFilePath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    const diversionUrl = `${baseUrl}/repos/${encodedRepoId}/files/${encodedWsId}/${encodedFilePath}`;

    const params: Record<string, any> = {
        mode: 33188, // Standard regular file mode (0644 in octal)
        mtime: Math.floor(Date.now() / 1000),
    };
    if (asset.fileSize) {
        params.size = asset.fileSize;
    }

    console.log(`[Diversion] Initiating zero-disk stream to Diversion API: ${diversionUrl}`);

    try {
        // RFC 7230 forbids Content-Length alongside Transfer-Encoding; sending both
        // gets the request rejected by proxies as smuggling. We know the exact byte
        // count from the Asset row, so prefer Content-Length and let the stream flow
        // without buffering. Fall back to chunked only when the size is unknown.
        const streamHeaders: Record<string, string> = {
            'Authorization': `Bearer ${token}`,
            'X-DV-Client-ID': 'project-flow',
            'Content-Type': 'application/octet-stream',
        };
        if (asset.fileSize) {
            streamHeaders['Content-Length'] = asset.fileSize.toString();
        } else {
            streamHeaders['Transfer-Encoding'] = 'chunked';
        }

        const response = await axios.post(diversionUrl, stream, {
            headers: streamHeaders,
            params,
            // Large 3D assets stream slowly; allow a generous window but never hang forever.
            timeout: UPLOAD_TIMEOUT_MS,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });

        console.log(`[Diversion] Upload accepted (HTTP ${response.status}) for ${cleanPath}`);

        // 5. Commit workspace changes to base branch
        try {
            console.log(`[Diversion] Committing workspace ${diversionWorkspaceId} changes...`);
            const commitRes = await axios.post(
                `${baseUrl}/repos/${encodedRepoId}/workspaces/${encodedWsId}/commit`,
                {
                    commit_message: commitMessage?.trim() || `Add ${asset.fileName} via Project-flow`,
                    include_paths: [cleanPath],
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-DV-Client-ID': 'project-flow',
                        'Content-Type': 'application/json',
                    },
                    timeout: 20000,
                }
            );
            console.log(`[Diversion] Commit response (HTTP ${commitRes.status}):`, commitRes.data);
        } catch (commitErr: any) {
            console.warn('[Diversion] Commit warning:', commitErr.response?.data || commitErr.message);
        }

        return {
            success: true,
            repoId,
            branch,
            path: cleanPath,
            fileName: asset.fileName,
            fileSize: asset.fileSize,
            status: response.status,
            diversionResponse: response.data,
        };
    } catch (axiosError: any) {
        const status = axiosError.response?.status;
        const errorData = axiosError.response?.data;
        const msg = errorData?.message || errorData?.detail || axiosError.message;

        console.error(`[Diversion API Error] HTTP ${status}:`, errorData || axiosError.message);
        throw new Error(`Diversion API error (${status || 'Network'}): ${msg}`);
    }
};
