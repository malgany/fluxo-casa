import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  response.status(200).json({
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    mode: "vercel-blob-sync-log",
    serverTime: new Date().toISOString()
  });
}
