-- Reconstructed. The original file was lost with the machine that wrote it; the
-- database had already applied it, so this reproduces the same end state rather
-- than being the byte-for-byte original. Verified against the live schema:
-- both columns are DECIMAL(12,2), NOT NULL, with no default.
--
-- The placeholder default is only there so the columns can be added to a table
-- that already has rows. It is dropped immediately, so every later insert has to
-- state a price instead of silently getting 0.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Product" ALTER COLUMN "sellingPrice" DROP DEFAULT,
ALTER COLUMN "costPrice" DROP DEFAULT;
