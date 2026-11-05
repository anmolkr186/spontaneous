// Runs inside `npm version`: copies the new package.json version to Cargo, so
// recordings stamped with CARGO_PKG_VERSION match the release. Edits the files
// as text so a version bump doesn't need cargo on PATH.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const manifest = readFileSync("Cargo.toml", "utf8");
writeFileSync(
  "Cargo.toml",
  manifest.replace(/(\[workspace\.package\]\nversion = )"[^"]+"/, `$1"${version}"`),
);

const lock = readFileSync("Cargo.lock", "utf8");
writeFileSync(
  "Cargo.lock",
  lock.replace(/(name = "spontaneous(?:-capture)?"\nversion = )"[^"]+"/g, `$1"${version}"`),
);
