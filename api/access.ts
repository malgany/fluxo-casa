import { isAccessConfigured, isPinValid } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./types.js";

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Metodo nao permitido." });
    return;
  }

  if (!isAccessConfigured()) {
    response.status(500).json({ message: "ACCESS_PIN nao configurado no servidor." });
    return;
  }

  const payload = request.body as { pin?: string } | undefined;
  if (!isPinValid(payload?.pin)) {
    response.status(401).json({ message: "PIN invalido." });
    return;
  }

  response.status(200).json({ ok: true });
}
