import { json, serverError } from "@/lib/http";
import { destroySession } from "@/lib/session";

export async function POST() {
  try {
    await destroySession();
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
