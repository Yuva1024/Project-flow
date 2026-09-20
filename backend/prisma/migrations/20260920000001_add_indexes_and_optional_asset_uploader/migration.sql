-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE INDEX "Board_workspaceId_idx" ON "Board"("workspaceId");

-- CreateIndex
CREATE INDEX "List_boardId_idx" ON "List"("boardId");

-- CreateIndex
CREATE INDEX "Card_listId_position_idx" ON "Card"("listId", "position");

-- CreateIndex
CREATE INDEX "Card_createdBy_idx" ON "Card"("createdBy");

-- CreateIndex
CREATE INDEX "Comment_cardId_createdAt_idx" ON "Comment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Label_boardId_idx" ON "Label"("boardId");

-- CreateIndex
CREATE INDEX "CardLabel_labelId_idx" ON "CardLabel"("labelId");

-- CreateIndex
CREATE INDEX "CardMember_userId_idx" ON "CardMember"("userId");

-- CreateIndex
CREATE INDEX "Checklist_cardId_idx" ON "Checklist"("cardId");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "Attachment_cardId_idx" ON "Attachment"("cardId");

-- CreateIndex
CREATE INDEX "Attachment_fileUrl_idx" ON "Attachment"("fileUrl");

-- CreateIndex
CREATE INDEX "ActivityLog_cardId_createdAt_idx" ON "ActivityLog"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_assetId_createdAt_idx" ON "ActivityLog"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Whiteboard_workspaceId_updatedAt_idx" ON "Whiteboard"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssetFolder_workspaceId_idx" ON "AssetFolder"("workspaceId");

-- CreateIndex
CREATE INDEX "AssetFolder_parentId_idx" ON "AssetFolder"("parentId");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_createdAt_idx" ON "Asset"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_folderId_idx" ON "Asset"("folderId");

-- CreateIndex
CREATE INDEX "Asset_fileUrl_idx" ON "Asset"("fileUrl");

-- CreateIndex
CREATE INDEX "Asset_uploadedById_idx" ON "Asset"("uploadedById");

-- CreateIndex
CREATE INDEX "AssetTag_workspaceId_idx" ON "AssetTag"("workspaceId");

-- CreateIndex
CREATE INDEX "AssetTagAssignment_assetId_idx" ON "AssetTagAssignment"("assetId");

-- CreateIndex
CREATE INDEX "AssetTagAssignment_tagId_idx" ON "AssetTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "CardAsset_assetId_idx" ON "CardAsset"("assetId");

-- CreateIndex
CREATE INDEX "CardAsset_cardId_idx" ON "CardAsset"("cardId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

