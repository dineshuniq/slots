import {
  fail,
  forbidden,
  json,
  readJson,
  readString,
  serverError,
  unauthorized,
} from "@/lib/http";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";
import { findControllerById, updateControllerPassword } from "@/lib/queries";
import { getSession, isController } from "@/lib/session";

/**
 * A controller changing their own password.
 *
 * The target is always the signed-in controller - the id comes from the
 * session, never the request body, so this cannot be pointed at someone else.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const body = await readJson(request);
    const currentPassword = readString(body, "currentPassword");
    const newPassword = readString(body, "newPassword");

    if (!currentPassword || !newPassword) {
      return fail("Enter your current and new password.", 400);
    }

    const invalid = validatePassword(newPassword);
    if (invalid) return fail(invalid, 400);

    if (currentPassword === newPassword) {
      return fail("The new password must be different.", 400);
    }

    const controller = await findControllerById(session.controllerId);
    if (!controller) return fail("Account not found.", 404);

    if (!(await verifyPassword(currentPassword, controller.passwordHash))) {
      return fail("Your current password is incorrect.", 401);
    }

    await updateControllerPassword(
      controller.id,
      await hashPassword(newPassword),
    );

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
