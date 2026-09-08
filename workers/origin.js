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
  enableInternet = true;
  pingEndpoint = "localhost/health";

  constructor(ctx, workerEnv, options) {
    super(ctx, workerEnv, options);
    // Container defines `envVars` as an instance field (default {}). A subclass
    // getter is shadowed by that own property; assign after super() so start()
    // reads this Worker version's secrets.
    this.envVars = containerEnvVars(workerEnv);
  }

  onStart() {
    console.log("VidShare container started");
  }

  onStop(event) {
    console.log("VidShare container stopped", event);
  }

  onError(error) {
    console.error("VidShare container error", error);
  }
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    if (url.hostname === "www.vidshare.link") {
      url.hostname = "vidshare.link";
      return Response.redirect(url.toString(), 301);
    }
    return getContainer(workerEnv.VIDSHARE).fetch(request);
  }
};
