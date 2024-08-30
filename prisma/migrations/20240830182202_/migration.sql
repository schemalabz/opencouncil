-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CouncilMeeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dateTime" DATETIME NOT NULL,
    "video" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "CouncilMeeting_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CouncilMeeting" ("cityId", "createdAt", "dateTime", "id", "name", "updatedAt", "video") SELECT "cityId", "createdAt", "dateTime", "id", "name", "updatedAt", "video" FROM "CouncilMeeting";
DROP TABLE "CouncilMeeting";
ALTER TABLE "new_CouncilMeeting" RENAME TO "CouncilMeeting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
