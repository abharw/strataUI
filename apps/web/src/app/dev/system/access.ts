/**
 * Gates the `/dev/*` routes, which must never serve in production (noindex is not access control).
 * Uses `VERCEL_ENV` when set, else `NODE_ENV`, so hosts without Vercel fail closed.
 */
export function isProductionDeployment(vercelEnvironment = process.env.VERCEL_ENV): boolean {
  if (vercelEnvironment !== undefined && vercelEnvironment !== "") {
    return vercelEnvironment === "production";
  }
  return process.env.NODE_ENV === "production";
}
