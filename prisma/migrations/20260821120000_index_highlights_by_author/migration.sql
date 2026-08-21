-- The personal highlights page filters Highlight by author alone. The existing
-- Highlight_cityId_createdById_idx leads with cityId, so PostgreSQL cannot seek
-- it for that predicate and scans every leaf page instead.
-- CreateIndex
CREATE INDEX "Highlight_createdById_idx" ON "Highlight"("createdById");

-- HighlightedUtterance carried no index at all, so every read of a highlight's
-- utterances sequentially scanned the whole join table.
-- CreateIndex
CREATE INDEX "HighlightedUtterance_highlightId_idx" ON "HighlightedUtterance"("highlightId");

-- CreateIndex
CREATE INDEX "HighlightedUtterance_utteranceId_idx" ON "HighlightedUtterance"("utteranceId");
