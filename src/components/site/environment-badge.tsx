import { getEnvironmentConfig } from "@/lib/environment.mjs";

export function EnvironmentBadge() {
  if (getEnvironmentConfig().environment !== "dev") return null;
  return <span className="environment-badge" aria-label="Development environment">DEV</span>;
}
