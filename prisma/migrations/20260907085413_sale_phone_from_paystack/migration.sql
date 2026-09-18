-- Reconstructed. The original file was lost with the machine that wrote it; the
-- database had already applied it, so this reproduces the same end state rather
-- than being the byte-for-byte original.
--
-- customerPhone becomes optional. The number a charge actually reached is
-- Paystack's to report, not ours to assume: staff type one to start the STK
-- push, but the authoritative value arrives on the webhook, and a sale row can
-- exist before either is known.

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "customerPhone" DROP NOT NULL;
