import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only. Firestore rules tests need the emulator: npm run test:rules
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "rules-tests/**"] },
});
