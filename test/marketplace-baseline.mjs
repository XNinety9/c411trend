// Runs the Omarchy plugin marketplace's Automated Security Baseline on this
// working tree, the way plugins.omarchy.org scans a submitted commit. It must
// report `passed` with no findings and no capabilities.
//
//   MARKETPLACE_DIR=/path/to/omarchy-plugin-marketplace node test/marketplace-baseline.mjs
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scripts = resolve(process.env.MARKETPLACE_DIR || "", "scripts");
const { buildSecurityBaseline } = await import(pathToFileURL(join(scripts, "security-baseline-analysis.mjs")));
const { isSecurityScanPath } = await import(pathToFileURL(join(scripts, "security-baseline-scope.mjs")));

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Scan what the marketplace scans: the committed tree. `git ls-files` also
// keeps out untracked checkouts such as CI's .marketplace/ (the scanner's own
// source would trip every rule). Outside a git checkout, walk the directory.
function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  } catch {
    const out = [];
    (function walk(dir) {
      for (const name of readdirSync(dir)) {
        if ([".git", "node_modules", ".marketplace"].includes(name)) continue;
        const path = join(dir, name);
        const st = lstatSync(path);
        if (st.isDirectory()) walk(path);
        else if (st.isFile()) out.push(relative(root, path));
      }
    })(root);
    return out;
  }
}

const files = trackedFiles()
  .filter((rel) => isSecurityScanPath(rel))
  .map((rel) => ({ path: rel, content: readFileSync(join(root, rel), "utf8") }));

const result = buildSecurityBaseline({
  repository: "xninety9/c411trend",
  repoUrl: "https://github.com/XNinety9/c411trend",
  commitSha: "0".repeat(40),
  files,
});
console.log(`scanned ${files.length} files: ${files.map((f) => f.path).join(", ")}`);
console.log(JSON.stringify({ outcome: result.outcome, findings: result.findings, capabilities: result.capabilities }, null, 2));
if (result.outcome !== "passed" || result.findings.length || result.capabilities.length) process.exit(1);
