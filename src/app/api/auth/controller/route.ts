import { fail, json, readJson, readString, serverError } from "@/lib/http";
import { clearAttempts, clientKey, tooManyAttempts } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { safeEqual } from "@/lib/sign";

export async function POST(request: Request) {
  try {
    const key = clientKey(request, "controller");
    if (tooManyAttempts(key)) {
      return fail("Too many attempts. Wait a minute and try again.", 429);
    }

    const expected = process.env.CONTROLLER_PASSWORD;
    if (!expected) {
      return fail("CONTROLLER_PASSWORD is not configured on the server.", 500);
    }

    const body = await readJson(request);
    const password = readString(body, "password");
    if (!password) return fail("Enter the controller password.", 400);

    if (!(await safeEqual(password, expected))) {
      return fail("Incorrect password.", 401);
    }

    clearAttempts(key);
    await createSession({ role: "controller", name: "Controller" });

    return json({ role: "controller", redirectTo: "/schedule" });
  } catch (error) {
    return serverError(error);
  }
}
