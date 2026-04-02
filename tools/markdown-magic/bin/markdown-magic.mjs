#!/usr/bin/env node
// Register jiti's TypeScript transform hooks (equivalent to `node --import jiti/register`).
// Being a static import, this is evaluated before the module body, so the hooks are active
// by the time the dynamic import below runs.
import "jiti/register";

// Import the TypeScript entry point. Jiti's hooks transparently transpile it at runtime.
await import("../src/index.ts");
