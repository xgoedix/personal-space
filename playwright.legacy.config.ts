import current from "./playwright.config";
import { defineConfig } from "@playwright/test";
// Historical Talorys English navigation: retained for reference, not the BichO UI contract.
export default defineConfig({ ...current, testDir: "tests/legacy-e2e" });
