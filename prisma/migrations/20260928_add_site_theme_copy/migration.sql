-- Add administrator-managed copy for the landing page and primary section headings.
-- Safe to apply to existing deployments; existing theme rows remain valid.
ALTER TABLE "SiteTheme" ADD COLUMN IF NOT EXISTS "copy" JSONB;
