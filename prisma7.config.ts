import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Only the Prisma CLI (migrate / introspect / studio) reads this file.
// Migrations run over Neon's *unpooled* endpoint — DDL and advisory locks do not
// survive PgBouncer. The app itself connects through the pooled DATABASE_URL via
// the driver adapter in lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
