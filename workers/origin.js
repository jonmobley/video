import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import secretCatalog from "./secret-keys.json";

export { ContainerProxy };

const CONTAINER_SECRET_KEYS = [
  ...secretCatalog.required,
  ...secretCatalog.optional
];

function containerEnvVars(workerEnv = env) {
  const vars = {
    NODE_ENV: "production",
    PORT: "5000",
    COOKIE_SECURE: "true"
  };
  for (const key of CONTAINER_SECRET_KEYS) {
    const value = workerEnv?.[key];
    if (typeof value === "string" && value.length > 0) {
      vars[key] = value;
    }
  }
  return vars;
}

export class VidShare extends Container {
  defaultPort = 5000;
  sleepAfter = "30m";

  constructor(ctx, workerEnv, options) {
    super(ctx, workerEnv, options);
    // Container defines `envVars` as an instance field (default {}). A subclass
    // getter is shadowed by that own property; assign after super() so start()
    // reads this Worker version's secrets.
    this.envVars = containerEnvVars(workerEnv);
  }
}

export default {
  async fetch(request, workerEnv) {
    return getContainer(workerEnv.VIDSHARE).fetch(request);
  }
};
