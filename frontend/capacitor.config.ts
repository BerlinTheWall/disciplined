import type { CapacitorConfig } from "@capacitor/cli";

// Set CAP_LIVERELOAD_URL to a LAN dev-server URL (e.g. http://192.168.2.50:5173)
// before `npx cap sync ios` to make the app load from a running Vite dev server
// for live reload. Leave it unset for normal bundled builds.
const liveReloadUrl = process.env.CAP_LIVERELOAD_URL;

const config: CapacitorConfig = {
  appId: "com.hooman.disciplined",
  appName: "Disciplined",
  // Vite builds the web app into dist/; Capacitor bundles that into the native
  // app so it runs offline and talks to the Railway API over the network.
  webDir: "dist",
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: true } } : {}),
};

export default config;
