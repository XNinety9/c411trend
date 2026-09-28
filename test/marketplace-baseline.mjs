// Runs the Omarchy plugin marketplace's Automated Security Baseline on this
// working tree, the way plugins.omarchy.org scans a submitted commit. It must
// report `passed` with no findings and no capabilities.
//
//   MARKETPLACE_DIR=/path/to/omarchy-plugin-marketplace node test/marketplace-baseline.mjs
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const scripts = resolve(process.env.MARKETPLACE_DIR || "", "scripts");
const { buildSecurityBaseline } = await import(pathToFileURL(join(scripts, "security-baseline-analysis.mjs")));
const { isSecurityScanPath } = await import(pathToFileURL(join(scripts, "security-baseline-scope.mjs")));

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isDirectory()) walk(path);
    else if (st.isFile()) {
      const rel = relative(root, path);
      if (isSecurityScanPath(rel)) files.push({ path: rel, content: readFileSync(path, "utf8") });
    }
  }
})(root);

const result = buildSecurityBaseline({
  repository: "xninety9/c411trend",
  repoUrl: "https://github.com/XNinety9/c411trend",
  commitSha: "0".repeat(40),
  files,
});
console.log(`scanned ${files.length} files: ${files.map((f) => f.path).join(", ")}`);
console.log(JSON.stringify({ outcome: result.outcome, findings: result.findings, capabilities: result.capabilities }, null, 2));
if (result.outcome !== "passed" || result.findings.length || result.capabilities.length) process.exit(1);
