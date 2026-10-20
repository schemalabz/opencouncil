/*
  Warnings:

  - You are about to drop the `ServiceApiKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- The service API key (sk_…) is gone: the MCP server takes MCP tokens only,
-- and the REST routes take a session only. Nothing reads the table any more.
-- No PGSync view reads it (elasticsearch/views.sql).
--
-- The drop is irreversible. Before the deploy, confirm on the admin API keys
-- page that no key was used recently. The container runs this migration
-- before the new code serves. In that window the old code still looks up
-- every bearer header in this table, so a REST request with any bearer value
-- that reaches the auth check answers 500 (GET /api/cities included); the
-- MCP server answers 401 to sk_.

-- DropForeignKey
ALTER TABLE "ServiceApiKey" DROP CONSTRAINT "ServiceApiKey_createdById_fkey";

-- DropTable
DROP TABLE "ServiceApiKey";
