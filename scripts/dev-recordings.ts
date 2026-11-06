/**
 * Dev-server only: lets the browser build open a recording package as if it had
 * just been captured, so the editor, playback and the agent can be worked on at
 * localhost without the desktop app. The desktop app never uses this; it gets
 * its recording from Rust (`capture_last_finished`).
 *
 *   GET /__dev/recording?name=…            a RecordingSummary (src/platform/capture.ts)
 *   GET /__dev/recording/<root>/<pkg>/screen.mp4   the video, with Range support
 *
 * `name` is empty for the sample in dev/sample, "latest" for your newest real
 * capture in ~/Movies/Spontaneous, or a package name from there.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Plugin } from "vite";

const SAMPLE = "Sample recording";
const ROOTS: Record<string, string> = {
  sample: resolve("dev/sample"),
  captures: join(homedir(), "Movies", "Spontaneous"),
};

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

/** Which package a name points at, or null. Only direct children of a root, never a path. */
function locate(name: string): { root: string; pkg: string } | null {
  if (!name) return { root: "sample", pkg: SAMPLE };
  const dir = ROOTS.captures!;
  if (!existsSync(dir)) return null;
  const packages = readdirSync(dir).filter((p) => p.endsWith(".spontaneous") && existsSync(join(dir, p, "recording", "screen.mp4")));
  if (name === "latest") {
    const newest = packages.map((p) => ({ p, at: statSync(join(dir, p)).mtimeMs })).sort((a, b) => b.at - a.at)[0];
    return newest ? { root: "captures", pkg: newest.p } : null;
  }
  const pkg = packages.find((p) => p === name || p === `${name}.spontaneous`);
  return pkg ? { root: "captures", pkg } : null;
}

/** The same summary the Rust recorder hands the editor when a capture stops (crates/capture/src/recorder.rs). */
function summary(root: string, pkg: string) {
  const dir = join(ROOTS[root]!, pkg);
  const rec = join(dir, "recording");
  const clicks = readJsonl<{ down: boolean }>(join(rec, "input", "clicks.jsonl"));
  const moves = readJsonl(join(rec, "input", "moves.jsonl"));
  return {
    projectDir: dir,
    videoPath: `/__dev/recording/${root}/${encodeURIComponent(pkg)}/screen.mp4`,
    session: JSON.parse(readFileSync(join(rec, "session.json"), "utf8")),
    input: {
      eventTap: true,
      accessibility: false,
      focusChanges: 0,
      moves: moves.length,
      clicks: clicks.length,
      keys: readJsonl(join(rec, "input", "keys.jsonl")).length,
      cursors: [],
    },
    clicks: clicks.filter((c) => c.down),
    moves,
  };
}

/** Stream a file, honouring a byte Range so <video> can seek without downloading it all. */
function sendVideo(file: string, range: string | undefined, res: ServerResponse) {
  const size = statSync(file).size;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-cache");
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? "");
  if (!m || (!m[1] && !m[2])) {
    res.setHeader("Content-Length", size);
    createReadStream(file).pipe(res);
    return;
  }
  // "bytes=-500" is the last 500 bytes; "bytes=100-" runs to the end.
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(file, { start, end }).pipe(res);
}

export function devRecordings(): Plugin {
  return {
    name: "spontaneous-dev-recordings",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/recording", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const notFound = () => { res.statusCode = 404; res.end(); };
        try {
          if (url.pathname === "/" || url.pathname === "") {
            const found = locate(url.searchParams.get("name") ?? "");
            if (!found) return notFound();
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache");
            res.end(JSON.stringify(summary(found.root, found.pkg)));
            return;
          }
          const [, root, rawPkg, file] = url.pathname.split("/");
          const pkg = decodeURIComponent(rawPkg ?? "");
          if (!root || !ROOTS[root] || file !== "screen.mp4" || basename(pkg) !== pkg || pkg.startsWith(".")) return notFound();
          const path = join(ROOTS[root]!, pkg, "recording", "screen.mp4");
          if (!existsSync(path)) return notFound();
          sendVideo(path, req.headers.range, res);
        } catch (error) {
          server.config.logger.error(`dev recording: ${String(error)}`);
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}
