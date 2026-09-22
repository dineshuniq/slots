import { fail, json, readJson, readString, serverError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { findControllerByUsername } from "@/lib/queries";
import { clearAttempts, clientKey, tooManyAttempts } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const key = clientKey(request, "controller");
    if (tooManyAttempts(key)) {
      return fail("Too many attempts. Wait a minute and try again.", 429);
    }

    const body = await readJson(request);
    const username = readString(body, "username").toLowerCase();
    const password = readString(body, "password");

    if (!username || !password) {
      return fail("Enter your username and password.", 400);
    }

    const controller = await findControllerByUsername(username);

    // Hash even when the username is unknown, so a missing account and a wrong
    // password take the same time and cannot be told apart.
    if (!controller) {
      await hashPassword(password);
      return fail("Incorrect username or password.", 401);
    }

    if (!(await verifyPassword(password, controller.passwordHash))) {
      return fail("Incorrect username or password.", 401);
    }

    clearAttempts(key);
    await createSession({
      role: "controller",
      controllerId: controller.id,
      username: controller.username,
      name: controller.name,
    });

    return json({ role: "controller", redirectTo: "/schedule" });
  } catch (error) {
    return serverError(error);
  }
}
