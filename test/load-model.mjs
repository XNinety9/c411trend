// Model.js is a QML `.pragma library` file, which is not valid ECMAScript, so
// strip that line and evaluate the rest with a CommonJS-style `module`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "Model.js"), "utf8").replace(/^\.pragma library\s*$/m, "");
const holder = { exports: {} };
new Function("module", source)(holder);

export const Model = holder.exports;

const TiB = 1024 ** 4;
const GiB = 1024 ** 3;
export { TiB, GiB };

// A steady seeder: `upPerDay` / `downPerDay` bytes a day, one sample per `stepH` hours.
export function steady({ days = 14, stepH = 1, up0 = 10 * TiB, down0 = 4 * TiB, upPerDay = 50 * GiB, downPerDay = 10 * GiB, t0 = 1_780_000_000 } = {}) {
  const out = [];
  for (let h = 0; h <= days * 24; h += stepH) {
    const d = h / 24;
    const up = up0 + upPerDay * d, down = down0 + downPerDay * d;
    out.push({ t: t0 + h * 3600, up, down, ratio: up / down, credit: 0 });
  }
  return out;
}
