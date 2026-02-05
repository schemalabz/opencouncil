-- AlterTable
ALTER TABLE "City" ADD COLUMN "diavgeiaUid" TEXT;

-- AlterTable
ALTER TABLE "AdministrativeBody" ADD COLUMN "diavgeiaUnitIds" TEXT[] NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ada" TEXT,
    "protocolNumber" TEXT,
    "title" TEXT,
    "pdfUrl" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Decision_subjectId_key" ON "Decision"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_ada_key" ON "Decision"("ada");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
