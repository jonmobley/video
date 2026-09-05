import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import secretCatalog from "./secret-keys.json";

export { ContainerProxy };

const CONTAINER_SECRET_KEYS = [
  ...secretCatalog.required,
  ...secretCatalog.optional
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
