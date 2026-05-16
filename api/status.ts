import { isAccessConfigured } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./types.js";

export default function handler(_request: ApiRequest, response: ApiResponse) {
  response.status(200).json({
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) && isAccessConfigured(),
    mode: "vercel-blob-sync-log",
    serverTime: new Date().toISOString()
  });
}
