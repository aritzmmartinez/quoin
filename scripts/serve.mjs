// Quoin has no login, so it listens on loopback unless QUOIN_HOST says otherwise.
// HOST is overwritten, not read: a shell can export one for its own reasons, and
// react-router-serve would then listen on that interface without anyone choosing it.
import process from "node:process";

process.env.HOST = process.env.QUOIN_HOST || "127.0.0.1";
process.argv = [process.argv[0], process.argv[1], "build/server/index.js"];

await import("../node_modules/@react-router/serve/bin.cjs");
