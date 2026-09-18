# Project-flow: Comprehensive Technical Documentation & Architecture Guide

> **Project-flow** is a modern, high-performance project management and creative collaboration platform designed for teams managing digital media, 3D game assets, and complex development workflows. It bridges the gap between structured project tracking (Kanban boards) and creative asset management (interactive 3D viewers, workspace asset libraries, and collaborative whiteboards).

---

## Table of Contents

1. [Executive Summary & High-Level Architecture](#1-executive-summary--high-level-architecture)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Database Schema & Data Model](#4-database-schema--data-model)
5. [Core Subsystems & Features](#5-core-subsystems--features)
   - [5.1 Workspaces & Role-Based Access Control (RBAC)](#51-workspaces--role-based-access-control-rbac)
   - [5.2 Kanban Boards & Card Engine](#52-kanban-boards--card-engine)
   - [5.3 Interactive Collaborative Whiteboards](#53-interactive-collaborative-whiteboards)
   - [5.4 3D Model Visualization Engine](#54-3d-model-visualization-engine)
   - [5.5 Workspace Asset Library](#55-workspace-asset-library)
   - [5.6 Smart Shared Asset & Content-Addressable Storage (CAS)](#56-smart-shared-asset--content-addressable-storage-cas)
6. [Cloudflare R2 Storage & Migration Pipeline](#6-cloudflare-r2-storage--migration-pipeline)
7. [API Route Catalog](#7-api-route-catalog)
8. [Frontend Architecture & State Management](#8-frontend-architecture--state-management)
9. [Security, Performance & Optimization](#9-security-performance--optimization)
10. [Local Development & Production Deployment](#10-local-development--production-deployment)

---

## 1. Executive Summary & High-Level Architecture

Project-flow is engineered as a decoupled full-stack application:
- **Frontend Client**: Built with **Next.js 16 (App Router + Turbopack)** and **React 19**, styled with a custom Apple-inspired design system adhering to strict WCAG contrast standards, fluent glassmorphism, responsive navigation, and keyboard-first accessibility.
- **Backend API**: Powered by **Node.js, Express 5, and TypeScript**, featuring **Prisma ORM** for PostgreSQL data access, strict input validation via **Zod**, centralized JWT authentication, rate limiting, and HTTP parameter pollution protection.
- **Object Storage**: Powered by **Cloudflare R2** via the `@aws-sdk/client-s3` API, utilizing **Content-Addressable Storage (CAS)** with **SHA-256 cryptographic hash deduplication** to guarantee that identical files are only stored once across the entire workspace.
- **Media Engine**: Deep 3D integration with **Three.js**, **React Three Fiber**, and **Google `<model-viewer>`**, enabling real-time WebGL rendering, orbit rotation, wireframe inspection, lighting controls, and drag-and-drop asset assignment.

---

## 2. Technology Stack

### Frontend
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Next.js** | `16.1.6` | React framework with App Router, server-rendered routes, and Turbopack compiler |
| **React** | `19.0.0` | Declarative UI rendering, hooks, and component lifecycle |
| **TypeScript** | `5.7.3` | End-to-end static type safety |
| **Three.js** | `0.183.2` | WebGL 3D graphics rendering engine |
| **@react-three/fiber** | `8.18.0` | React reconciler for Three.js scene graphs |
| **@react-three/drei** | `9.122.0` | Helper utilities, OrbitControls, Environment stages for Three.js |
| **@google/model-viewer** | `4.1.0` | Progressive 3D GLTF/GLB web component with thumbnail generation |
| **Framer Motion** | `12.4.1` | Hardware-accelerated UI animations and modal transitions |
| **Zustand** | `5.0.3` | Lightweight client state management (`authStore`, `boardStore`) |
| **Lucide React** | `0.475.0` | Consistent iconography |
| **React Hot Toast** | `2.5.2` | Non-blocking notification toasts |
| **Axios** | `1.7.9` | HTTP client with automatic JWT bearer interception and error normalization |

### Backend
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js & Express** | `5.2.1` | RESTful API server runtime |
| **TypeScript** | `5.9.3` | Type safety and modern ECMAScript compilation |
| **Prisma ORM** | `5.10.2` | Type-safe database queries, schema migrations, and connection pooling |
| **PostgreSQL** | `15+` | Relational database engine |
| **@aws-sdk/client-s3** | `3.1101.0` | Cloudflare R2 object storage integration (S3-compatible) |
| **Zod** | `4.3.6` | Runtime request body and query parameter validation |
| **Multer** | `2.2.0` | Multipart/form-data upload handling with memory buffer storage |
| **bcryptjs** | `3.0.3` | Password hashing with cryptographic salts |
| **jsonwebtoken** | `9.0.3` | Stateless authentication tokens |
| **Helmet** | `8.1.0` | HTTP security headers |
| **express-rate-limit** | `8.2.1` | IP-based request throttling and abuse prevention |
| **Compression & HPP** | `1.8.1 / 0.2.3` | Gzip compression and parameter pollution protection |

---

## 3. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT (Next.js 16)                             │
│                                                                             │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ Kanban Board   │  │ Interactive      │  │ Workspace Asset Library     │  │
│  │ (Cards, Lists, │  │ Whiteboard       │  │ (Folders, Tags, 3D Models,  │  │
│  │  Checklists)   │  │ (Infinite Canvas)│  │  Multi-Format Previews)     │  │
│  └───────┬────────┘  └────────┬─────────┘  └──────────────┬──────────────┘  │
│          │                    │                           │                 │
│          └────────────────────┼───────────────────────────┘                 │
│                               ▼                                             │
│               [Axios Interceptor + JWT Bearer Auth]                         │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTP / JSON / Multipart
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (Express API)                            │
│                                                                             │
│  [Helmet Security] ──► [CORS Allowlist] ──► [Rate Limiter] ──► [Auth Guard] │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────┐  │
│  │ /api/workspaces       │  │ /api/.../boards & cards │  │ /api/.../wb   │  │
│  └───────────────────────┘  └─────────────────────────┘  └───────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ /api/workspaces/:workspaceId/assets (CAS + Reference Counter Engine)  │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│     PostgreSQL Database      │              │    Cloudflare R2 Storage     │
│       (via Prisma ORM)       │              │  (Content-Addressable / CAS) │
│                              │              │                              │
│ • User / Workspace / Member  │              │ files/                       │
│ • Board / List / Card        │              │  ├── <sha256-hash-a>.glb     │
│ • Attachment / CardAsset     │              │  ├── <sha256-hash-b>.png     │
│ • Asset / AssetFolder / Tag  │              │  └── <sha256-hash-c>.mp4     │
│ • Whiteboard / ActivityLog   │              │                              │
└──────────────────────────────┘              └──────────────────────────────┘
```

---

## 4. Database Schema & Data Model

The PostgreSQL database is managed through Prisma. The schema establishes strict referential integrity with cascading deletes where appropriate:

### Entity Relationship Summary
```
User ────────────< WorkspaceMember >──────────── Workspace
  │                                                  │
  ├──────< Card (Creator)                            ├──────< Board ───< List ───< Card
  ├──────< Comment                                   ├──────< Whiteboard
  ├──────< ActivityLog                               ├──────< AssetFolder (Self-referencing tree)
  ├──────< Notification                              ├──────< AssetTag
  └──────< Asset (Uploader)                          └──────< Asset
                                                                │
                 Card ─────────< CardAsset >────────────────────┤ (Junction)
                  │                                             │
                  ├──< Attachment                               ├──< AssetTagAssignment
                  ├──< Checklist ──< ChecklistItem              └──> AssetFolder (Optional)
                  ├──< CardMember >── User
                  └──< CardLabel >── Label ──> Board
```

### Core Models

#### `User` & `Workspace`
- `User`: Handles identity, email uniqueness, hashed passwords, avatars, admin status, and password reset tokens.
- `Workspace`: Multi-tenant boundary. All boards, whiteboards, assets, and folders belong strictly to a workspace.
- `WorkspaceMember`: Junction table with composite primary key `[workspaceId, userId]` and role enumeration (`ADMIN` or `MEMBER`).

#### `Board`, `List`, `Card`
- `Board`: Belongs to a workspace; contains lists and board-scoped custom labels.
- `List`: Contains cards; sorted using a floating-point `position` field for collision-free drag-and-drop ordering.
- `Card`: The work unit containing title, rich description, priority (`low`, `medium`, `high`, `urgent`), due date, position, creator, comments, checklist items, assigned members, attachments, activity log, and JSON-encoded `model3DSections`.

#### `Asset`, `AssetFolder`, `AssetTag`, `CardAsset`
- `Asset`: Stores workspace media metadata: `fileName`, `fileUrl`, `fileSize`, `mimeType`, `uploadedById`, optional `folderId`.
- `AssetFolder`: Recursive tree model with optional `parentId` self-reference for nested folder structures.
- `AssetTag`: Workspace-scoped tags with custom hex colors (unique constraint on `[workspaceId, name]`).
- `AssetTagAssignment`: Many-to-many junction between `Asset` and `AssetTag`.
- `CardAsset`: Many-to-many junction between `Card` and `Asset`. Allows cards to reference workspace library assets directly without duplication.
- `Attachment`: Local card attachments. When an asset is deleted from the library but used on a card, it safely converts into an `Attachment` row so the card never breaks.

#### `Whiteboard`
- `Whiteboard`: Stores infinite canvas drawings, shapes, sticky notes, and text elements serialized as JSON.

---

## 5. Core Subsystems & Features

### 5.1 Workspaces & Role-Based Access Control (RBAC)
- **Multi-Tenancy**: Every resource is isolated by `workspaceId`.
- **Authorization Guard**: All API requests pass through `requireAuth` and verify workspace membership before executing any query.
- **Roles**:
  - `OWNER`: Full administrative control, billing, workspace deletion, role promotion.
  - `ADMIN`: Board creation, member invitations, asset taxonomy management (folders/tags).
  - `MEMBER`: Create and edit cards, upload attachments, edit whiteboards, manage own comments.

---

### 5.2 Kanban Boards & Card Engine
- **Fractional Position Drag & Drop**: Dragging cards between lists updates their `position` with a fractional midpoint algorithm (`(prev + next) / 2`). This avoids mass re-indexing of database rows.
- **Checklists with Visual Progress**: Cards support multiple named checklists. Checking items computes an animated completion percentage.
- **Custom Label Presets**: Boards support customizable colored labels (`LABEL_PRESETS`) with real-time assignment.
- **Activity Log Audit Trail**: Automatically records timestamps, users, and descriptions whenever cards are moved, assigned, commented on, or have files attached.
- **Comments Thread**: Real-time comments with in-place editing and deletion.

---

### 5.3 Interactive Collaborative Whiteboards
- Built with an HTML5 canvas layer for real-time visual collaboration.
- Supports geometric shapes (rectangles, circles, diamonds), freehand sketching, text blocks, sticky notes, and connecting arrows.
- Elements persist into PostgreSQL as structured JSON, allowing instant reloading and synchronization across team sessions.

---

### 5.4 3D Model Visualization Engine
Project-flow includes an industry-grade 3D model engine supporting game-ready formats (`.glb`, `.gltf`, `.obj`, `.fbx`):

1. **Integrated WebGL Orbit Viewer (`Three3DViewer.tsx`)**:
   - Built with **Three.js** and **React Three Fiber**.
   - Features dynamic studio lighting, ambient occlusion, auto-centering bounding box calculation, automatic camera framing, and OrbitControls.
   - Interactive controls: Toggle wireframe mode, toggle autorotation (with customizable speed), adjust background contrast, and capture viewport snapshots.
2. **Drag-and-Drop Model Attachment**:
   - Users can drag 3D attachments directly from the Card's Attachments list into a 3D section to load and preview the model instantly.
3. **Card-Level 3D Sections**:
   - Cards store `model3DSections` in JSON, allowing multiple 3D models to be embedded in a single card (e.g. "Low Poly Mesh", "High Poly Sculpt", "Rigged Variant").
4. **Thumbnail Previews (`AssetLibrary.tsx`)**:
   - Google `<model-viewer>` progressively renders interactive 3D thumbnails in the library grid without opening the modal.
5. **CORS Security Proxy (`/api/proxy-3d`)**:
   - Next.js server-side route handles CORS headers and binary streaming to ensure cross-origin 3D textures and binary buffers load seamlessly without browser security blocks.

---

### 5.5 Workspace Asset Library
A centralized digital asset management (DAM) workspace tab:
- **Taxonomy Management**: Create nested folder trees and color-coded tags.
- **Multi-Type Filters**: Filter by category (`3D Models`, `Images`, `Videos`, `Audio`) and search in real-time.
- **Bulk Uploads**: Drag and drop batches of files directly into the library.
- **Asset Inspector (`AssetDetailPanel.tsx`)**: Inspect file metadata, download files, edit tags, rename assets, view linked cards, and navigate directly to the cards using the file.

---

### 5.6 Smart Shared Asset & Content-Addressable Storage (CAS)
A critical innovation in Project-flow is its **Smart Shared (Reference-Counted) Asset System**:

#### How It Works:
1. **Content-Addressable Storage (CAS)**:
   - When any file is uploaded (whether from a Kanban Card or the Asset Library), the backend computes its cryptographic SHA-256 hash from the raw buffer:
     $$\text{key} = \text{files/} + \text{SHA256}(\text{buffer}) + \text{ext}$$
   - The backend checks Cloudflare R2 using `HeadObjectCommand`. If the file already exists in R2, upload is skipped and the existing URL is reused immediately.
   - **Zero Duplication**: Storing the exact same 3D model or image on multiple cards or the library consumes storage **only once**.
2. **"Attach from Library" Modal**:
   - Inside any Kanban card, users can open the Library Picker modal to search through workspace assets and attach them with one click without re-uploading.
3. **"Add to Library" Promotion**:
   - Any local file uploaded directly to a card can be promoted to the Workspace Asset Library with a single click. The card attachment shows an `"In Library"` badge.
4. **Safe Independent Deletion**:
   - **Deleting from Card**: If the file is also in the Asset Library, it unlinks from the card only. The asset remains in the library and R2 storage is preserved.
   - **Deleting from Library**: If any cards are linked to the asset, the backend automatically converts those links into local `Attachment` records before deleting the library record. Cards never break, and previews remain active.
   - **Physical R2 Deletion**: The physical object in Cloudflare R2 is only deleted when **zero** references remain across both the `Asset` table and `Attachment` table.

---

## 6. Cloudflare R2 Storage & Migration Pipeline

### Directory Structure in Cloudflare R2
All files are organized under a single deterministic path:
```
projectflowuploads/
└── files/
    ├── 9227a7d4a2c3a0322fcefb4304deb18f9a5b2f05accb6bfbbd0283cea7f5e4d2.glb
    ├── 4c89b120f3e82710da89b21a8123efd927189021890123789012389012389012.png
    └── 7e12f00812378912389012389012389012389012389012389012389012389012.mp4
```

### The Migration Pipeline (`migrate-r2-unified-storage.ts`)
To transition legacy split directories (`attachments/` and `assets/`) to the unified CAS model, an automated migration script was executed:
1. Scans all `Attachment` and `Asset` rows in PostgreSQL for URLs containing `/attachments/` or `/assets/`.
2. Downloads the binary content via S3 `GetObjectCommand` or HTTP fallback.
3. Computes the SHA-256 hash and uploads the object to `files/<sha256>.<ext>`.
4. Updates all database foreign references to point to the new unified public URL.
5. Issues S3 `DeleteObjectCommand` to permanently remove the legacy object from Cloudflare R2.
6. Operates idempotently: re-running the script verifies 0 legacy files remain.

---

## 7. API Route Catalog

### Authentication (`/api/auth`)
- `POST /register`: Register new user account.
- `POST /login`: Authenticate and receive JWT token.
- `GET /me`: Get authenticated user profile.
- `POST /forgot-password`: Generate password reset token.
- `POST /reset-password`: Reset password using token.

### Workspaces (`/api/workspaces`)
- `GET /`: List user's workspaces.
- `POST /`: Create new workspace.
- `GET /:workspaceId`: Get workspace details and member list.
- `PATCH /:workspaceId`: Update workspace name.
- `DELETE /:workspaceId`: Delete workspace (Cascades all boards/assets).
- `POST /:workspaceId/members`: Invite / add user to workspace.
- `PATCH /:workspaceId/members/:userId`: Update member role (`ADMIN` / `MEMBER`).
- `DELETE /:workspaceId/members/:userId`: Remove member from workspace.

### Kanban Boards & Cards (`/api/workspaces/:workspaceId/boards`)
- `GET /`: List boards in workspace.
- `POST /`: Create board.
- `GET /:boardId`: Get board with lists and cards.
- `PATCH /:boardId`: Update board metadata.
- `DELETE /:boardId`: Delete board.
- `POST /:boardId/lists`: Create list.
- `PATCH /:boardId/lists/:listId`: Rename list.
- `DELETE /:boardId/lists/:listId`: Delete list.
- `POST /:boardId/cards`: Create card in list.
- `PATCH /:boardId/cards/:cardId`: Update card (title, desc, priority, dueDate, 3D sections).
- `DELETE /:boardId/cards/:cardId`: Delete card.
- `PATCH /:boardId/cards/:cardId/move`: Move card between lists or update position.
- `POST /:boardId/cards/:cardId/attachments`: Upload file attachment (uses CAS).
- `GET /:boardId/cards/:cardId/attachments`: Get all card attachments and linked library assets.
- `DELETE /:boardId/cards/:cardId/attachments/:attachmentId`: Delete/unlink attachment with reference counting.
- `POST /:boardId/cards/:cardId/attachments/:attachmentId/save-to-library`: Promote local attachment to library.
- `POST /:boardId/cards/:cardId/attachments/link-asset/:assetId`: Link library asset to card.
- `POST /:boardId/cards/:cardId/checklists`: Create checklist.
- `POST /:boardId/cards/:cardId/checklists/:checklistId/items`: Add checklist item.
- `PATCH /:boardId/cards/:cardId/checklists/:checklistId/items/:itemId`: Toggle/edit item.
- `POST /:boardId/cards/:cardId/comments`: Add comment.
- `GET /:boardId/cards/:cardId/activity`: Get card activity audit log.

### Asset Library (`/api/workspaces/:workspaceId/assets`)
- `POST /`: Upload new asset (Multipart `file`, optional `folderId`, `tagIds`).
- `GET /`: List assets with pagination, search, folder filter, tag filter, and mime category (`3d`, `image`, `video`, `audio`).
- `GET /:assetId`: Get single asset details with linked cards.
- `PATCH /:assetId`: Rename asset or move to another folder.
- `DELETE /:assetId`: Delete asset from library (converts linked cards to local attachments; preserves R2 file if referenced).
- `POST /folders`: Create folder (nested tree).
- `GET /folders`: List folders with asset counts.
- `PATCH /folders/:folderId`: Rename or move folder.
- `DELETE /folders/:folderId`: Delete folder (unlinks assets to root).
- `POST /tags`: Create colored tag.
- `GET /tags`: List tags with assignment counts.
- `POST /:assetId/tags/:tagId`: Assign tag to asset.
- `DELETE /:assetId/tags/:tagId`: Remove tag from asset.

### Whiteboards (`/api/workspaces/:workspaceId/whiteboards`)
- `GET /`: List workspace whiteboards.
- `POST /`: Create whiteboard.
- `GET /:wbId`: Load whiteboard elements JSON.
- `PATCH /:wbId`: Save canvas elements JSON.
- `DELETE /:wbId`: Delete whiteboard.

---

## 8. Frontend Architecture & State Management

### Zustand Stores
1. **`authStore` (`frontend/src/store/auth.ts`)**:
   - Manages authenticated user session, JWT token in `localStorage`, and login/logout actions.
2. **`boardStore` (`frontend/src/store/board.ts`)**:
   - Manages active board state, real-time optimistic list/card updates during drag-and-drop actions.

### Key Component Directory
- `CardModal.tsx`: Comprehensive modal for card management: description editor, checklists, custom labels, assignees, activity log, attachments list with media lightbox, 3D model viewer sections, and library picker dialog.
- `AssetLibrary.tsx`: Full-page asset management system with taxonomy sidebar (folders & tags), search, category filters, drag-and-drop dropzone, and responsive grid/list cards.
- `Three3DViewer.tsx`: WebGL 3D canvas featuring Three.js OrbitControls, wireframe toggle, autorotate, lighting presets, and model dropzone.
- `AssetDetailPanel.tsx`: Flyout drawer for inspecting asset details, managing tags, copying public URLs, downloading files, and jumping to linked cards.

---

## 9. Security, Performance & Optimization

1. **Content-Addressable Storage (CAS)**:
   - Eliminates redundant R2 uploads by verifying SHA-256 hashes with `HeadObjectCommand` before streaming bytes over the wire.
2. **Server-Side Download Proxy (`/api/proxy-download`)**:
   - Sets appropriate `Content-Disposition: attachment; filename="..."` headers to force clean browser downloads regardless of cross-origin storage headers.
3. **CORS Streaming Proxy (`/api/proxy-3d`)**:
   - Resolves cross-origin WebGL texture and buffer restrictions by proxying 3D assets securely through Next.js edge routes.
4. **Dynamic Lazy-Loading**:
   - Three.js WebGL dependencies and Google `<model-viewer>` are loaded dynamically (`next/dynamic` with `ssr: false`) to keep initial bundle size minimal.
5. **Security Defenses**:
   - Rate limiting on sensitive endpoints (auth, file uploads, global API).
   - Helmet HTTP headers and Parameter Pollution (HPP) defenses.
   - Strict Zod validation on request payloads.

---

## 10. Local Development & Production Deployment

### Prerequisites
- Node.js `20.x` or higher
- PostgreSQL `15.x` or higher
- Cloudflare R2 bucket with API tokens

### Environment Configuration

#### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/projectflow"
JWT_SECRET="your-super-secret-jwt-key"
CORS_ORIGIN="http://localhost:3000"

# Cloudflare R2 Configuration
CLOUDFLARE_R2_ACCOUNT_ID="your_cloudflare_account_id"
CLOUDFLARE_R2_ACCESS_KEY_ID="your_r2_access_key"
CLOUDFLARE_R2_SECRET_ACCESS_KEY="your_r2_secret_key"
CLOUDFLARE_R2_BUCKET_NAME="projectflowuploads"
CLOUDFLARE_R2_PUBLIC_URL="https://pub-yourbucketid.r2.dev"
```

#### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
```

### Running Locally

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Run Database Migrations
cd backend
npx prisma migrate dev

# 3. Start Backend Server (Runs on port 5000)
npm run dev

# 4. Start Frontend Client (Runs on port 3000)
cd ../frontend
npm run dev
```

### Production Deployment

- **Backend (Render / Railway / AWS ECS)**:
  - Build Command: `npm install && npm run build`
  - Start Command: `npm start` (Runs `node dist/index.js`)
  - Ensure `DATABASE_URL`, `JWT_SECRET`, and `CLOUDFLARE_R2_*` environment variables are configured.
- **Frontend (Netlify / Vercel)**:
  - Build Command: `npm run build`
  - Output Directory: `.next`
  - Ensure `NEXT_PUBLIC_API_URL` points to the live backend URL.
