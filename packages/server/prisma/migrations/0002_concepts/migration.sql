-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Cell" ADD COLUMN "conceptId" TEXT;

-- CreateIndex
CREATE INDEX "Concept_workspaceId_idx" ON "Concept"("workspaceId");

-- CreateIndex
CREATE INDEX "Concept_folderId_idx" ON "Concept"("folderId");

-- CreateIndex
CREATE INDEX "Cell_conceptId_idx" ON "Cell"("conceptId");

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
