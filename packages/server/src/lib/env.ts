// Centralized env access with sane dev fallbacks. Secrets must be set in prod;
// the fallbacks keep tests and local dev runnable without a full .env.
export const ENV = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-jwt-secret-change-me",
  // base64-encoded 32 bytes; the dev default is all-zero and must be replaced in prod.
  masterEncKey: process.env.MASTER_ENC_KEY ?? Buffer.alloc(32).toString("base64"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Optional env-level AI fallbacks when a team has no stored credential.
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  isProd: process.env.NODE_ENV === "production",
};
