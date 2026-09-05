import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export { ContainerProxy };

const CONTAINER_SECRET_KEYS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SESSION_SECRET",
  "ADMIN_TOKEN",
  "JWT_SECRET",
  "ALLOWED_ORIGIN",
  "PUBLIC_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ALLOW_ANONYMOUS_UPLOADS",
  "WISTIA_API_PASSWORD"
];

function containerEnvVars() {
  const vars = {
    NODE_ENV: "production",
    PORT: "5000",
    COOKIE_SECURE: "true"
  };
  for (const key of CONTAINER_SECRET_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      vars[key] = value;
    }
  }
  return vars;
}

export class VidShare extends Container {
  defaultPort = 5000;
  sleepAfter = "30m";
  envVars = containerEnvVars();
}

export default {
  async fetch(request, workerEnv) {
    return getContainer(workerEnv.VIDSHARE).fetch(request);
  }
};
