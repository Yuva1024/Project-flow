# Task Checklist — Add All Missing CRUD Features

- [x] **Phase 1: Auth & User Profile**
  - [x] Add `GET /api/auth/me` to `auth.controller.ts`
  - [x] Add `PATCH /api/auth/profile` to `auth.controller.ts`
  - [x] Add `PATCH /api/auth/password` to `auth.controller.ts`
  - [x] Register new auth routes in `auth.routes.ts`
  - [x] Modify frontend `loadUser` store action to fetch user via API instead of JWT decoding in `frontend/src/store/auth.ts`
  - [x] Add `updateProfile` and `changePassword` actions to frontend auth store
  - [x] Create Profile settings page/modal in frontend

- [x] **Phase 2: Workspace Update & Delete**
  - [x] Add `PATCH /api/workspaces/:id` (rename) to `workspace.controller.ts`
  - [x] Add `DELETE /api/workspaces/:id` (delete) to `workspace.controller.ts`
  - [x] Register new routes in `workspace.routes.ts`
  - [x] Add `updateWorkspace` and `deleteWorkspace` actions to `frontend/src/store/board.ts`
  - [x] Add Rename/Delete UI & confirmation modal for Workspace in sidebar

- [x] **Phase 3: Frontend CRUD UI for Board, List, Card, Comment, Label, Checklist**
  - [x] Add `updateBoard` and `deleteBoard` to frontend board store
  - [x] Add `updateList` and `deleteList` to frontend board store
  - [x] Add Board rename/delete UI in dashboard and board header
  - [x] Add List rename/delete UI in list header
  - [x] Add Card delete UI on hover & inside CardModal
  - [x] Add Card title click-to-edit in CardModal
  - [x] Add edit/delete Comment UI in CardModal
  - [x] Add edit/delete Label UI in CardModal
  - [x] Add edit Checklist title UI in CardModal
  - [x] Add edit Checklist item text UI in CardModal

- [x] **Phase 4: List Drag-to-Reorder**
  - [x] Wrap list columns with horizontal Droppable & Draggable in `board/page.tsx`
  - [x] Update `onDragEnd` to support `LIST` dragging and trigger `reorderLists` store action

- [x] **Phase 5: Activity Log System**
  - [x] Create `logActivity` helper in `backend/src/utils/activity.helper.ts`
  - [x] Wire activity logging in card, comment, label, checklist, cardmember, and dnd controllers

- [x] **Phase 6: Notification System**
  - [x] Create `createNotification` helper in `backend/src/utils/notification.helper.ts`
  - [x] Add DELETE endpoint for notifications
  - [x] Wire notification creation in cardmember, comment, and workspace controllers
  - [x] Create `NotificationDropdown` component in frontend
  - [x] Add `NotificationDropdown` to dashboard and board pages

- [x] **Phase 7: Checklist Update Endpoint**
  - [x] Add `PATCH /api/checklists/:checklistId` to `checklist.controller.ts`
  - [x] Register checklist patch route in backend

- [x] **Phase 8: Bug Fixes & Verification**
  - [x] Resolve frontend login redirect loop caused by leftover backend compiled files returning 404 on `/auth/me`
  - [x] Run authentication endpoint verification script (`verify_auth.js`)
  - [x] Validate backend/frontend page redirects and button links

