-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "previewFileName" TEXT,
ADD COLUMN     "previewFileSize" INTEGER,
ADD COLUMN     "previewUrl" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_previewUrl_idx" ON "Attachment"("previewUrl");

