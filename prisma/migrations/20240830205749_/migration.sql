-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiarizationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "DiarizationRequest_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DiarizationRequest" ("cityId", "councilMeetingId", "createdAt", "id", "updatedAt") SELECT "cityId", "councilMeetingId", "createdAt", "id", "updatedAt" FROM "DiarizationRequest";
DROP TABLE "DiarizationRequest";
ALTER TABLE "new_DiarizationRequest" RENAME TO "DiarizationRequest";
CREATE UNIQUE INDEX "DiarizationRequest_councilMeetingId_cityId_key" ON "DiarizationRequest"("councilMeetingId", "cityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
