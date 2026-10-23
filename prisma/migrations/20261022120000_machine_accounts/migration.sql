-- A machine account is a User row that a service holds: it never signs in,
-- and its MCP tokens carry its rights like a person's (#590). The flag keeps
-- it out of the queries that mean "people" and out of every sign-in path.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isMachine" BOOLEAN NOT NULL DEFAULT false;
