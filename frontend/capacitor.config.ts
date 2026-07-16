import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hooman.disciplined",
  appName: "Disciplined",
  // Vite builds the web app into dist/; Capacitor bundles that into the native
  // app so it runs offline and talks to the Railway API over the network.
  webDir: "dist",
};

export default config;
