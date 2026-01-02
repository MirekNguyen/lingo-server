import { Config, defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error("Undefined DATABASE_URL");

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts"],
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  verbose: false,
  strict: true,
}) satisfies Config;
