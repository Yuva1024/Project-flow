# Project-flow 🚀

An advanced full-stack project management and creative collaboration platform built for developers, designers, and 3D digital media creators.

Project-flow brings together high-speed **Kanban boards**, real-time **interactive whiteboards**, an embedded **WebGL 3D model engine**, and a centralized **Workspace Asset Library** powered by **Content-Addressable Storage (CAS)** on Cloudflare R2.

---

## 📖 Complete Technical Documentation

For the complete architectural breakdown, database models, storage deduplication internals, API route catalog, and deployment instructions, see:

👉 **[PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)**

---

## ✨ Key Features

- 📋 **Kanban Boards & Cards**: Smooth fractional-position drag & drop, checklists with live completion progress, custom color-coded labels, user assignments, comment threads, and timestamped activity logs.
- 🎨 **Interactive Collaborative Whiteboards**: Infinite canvas for visual brainstorming with shapes, freehand drawing, sticky notes, and instant persistence.
- 🧊 **Integrated 3D Model Engine**: Real-time WebGL orbit viewer powered by **Three.js** and **React Three Fiber**, supporting `.glb`, `.gltf`, `.obj`, and `.fbx` with wireframe toggle, autorotation, and direct attachment drag-and-drop into cards.
- 🗄️ **Workspace Asset Library**: Centralized asset hub with hierarchical folders, color-coded taxonomy tags, category filters (3D models, images, videos, audio), and live search.
- ⚡ **Smart Shared Storage & Deduplication**:
  - **Content-Addressable Storage (CAS)** with SHA-256 cryptographic hashing under `files/<hash>.<ext>` in Cloudflare R2.
  - Zero duplicate file storage: identical files are stored once across the entire workspace.
  - **Attach from Library** and **Add to Library** actions on cards.
  - Safe reference-counted deletion: deleting from a card never breaks the library, and deleting from the library preserves card attachments.
- 🔐 **Multi-Tenant Workspaces & RBAC**: Granular role-based permissions (`OWNER`, `ADMIN`, `MEMBER`), team invites, and member management.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router + Turbopack), React 19, TypeScript, Three.js, React Three Fiber, Google `@google/model-viewer`, Zustand, Framer Motion, Lucide icons.
- **Backend**: Node.js, Express 5, TypeScript, Prisma ORM, PostgreSQL, Multer, Zod, Helmet, JWT, Rate Limiting.
- **Object Storage**: Cloudflare R2 via AWS S3 SDK (SHA-256 CAS Deduplication).

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in `backend` and set your `DATABASE_URL` (PostgreSQL) and Cloudflare R2 credentials. In `frontend`, configure `.env.local`.

### 3. Run Migrations & Start Development
```bash
# In backend
npx prisma migrate dev
npm run dev

# In frontend
npm run dev
```

Visit `http://localhost:3000` to access the application.
