import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", staging: "src/staging.ts", v3: "src/v3.ts", "v3-mobile": "src/v3-mobile.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  // Shared code (password policy and hashing) is bundled; runtime deps stay external.
  noExternal: ["@talorys/shared"],
  external: ["@clack/prompts", "wrangler"],
  banner: { js: "#!/usr/bin/env node" },
});
