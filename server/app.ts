import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { extname, join, normalize, resolve } from "node:path";

const host = process.env.APP_HOST ?? "::";
const port = Number(process.env.APP_PORT ?? 5173);
const distDir = resolve(process.env.APP_DIST_DIR ?? join(process.cwd(), "dist"));
const certPath = process.env.APP_HTTPS_CERT;
const keyPath = process.env.APP_HTTPS_KEY;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

if (!existsSync(distDir)) {
  throw new Error(`Build directory not found: ${distDir}. Run npm run build first.`);
}

const server =
  certPath && keyPath
    ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, handleRequest)
    : createHttpServer(handleRequest);

server.listen(port, host, () => {
  const protocol = certPath && keyPath ? "https" : "http";
  console.log(`Fluxo Casa app listening at ${protocol}://localhost:${port}`);
  console.log(`Host: ${host}`);
});

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const filePath = resolveSafe(pathname);
  const targetPath = filePath && existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distDir, "index.html");

  const ext = extname(targetPath);
  response.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
  response.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");

  if (request.method === "HEAD") {
    response.writeHead(200);
    response.end();
    return;
  }

  createReadStream(targetPath)
    .on("error", () => {
      response.writeHead(500);
      response.end("Internal server error");
    })
    .pipe(response);
}

function resolveSafe(pathname: string): string | undefined {
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(distDir, normalized === "/" ? "index.html" : normalized));
  return target.startsWith(distDir) ? target : undefined;
}
