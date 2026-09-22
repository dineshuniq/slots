/**
 * The recruiter to call about a session.
 *
 * Both parts are optional: at booking time the candidate often knows the
 * company but not yet who is arranging it. What is given still has to be
 * well formed, so a typed-in number is usable later without checking it.
 */

export const MAX_RECRUITER_PHONE = 32;
export const MAX_RECRUITER_EMAIL = 160;

const PHONE = /^[0-9+()\-\s]{6,}$/;

// Deliberately loose. Anything stricter rejects addresses that are valid, and
// the only real test of an address is sending to it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The reason the contact is unacceptable, or null when it is fine. */
export function recruiterContactError(
  phone: string,
  email: string,
): string | null {
  if (phone.length > MAX_RECRUITER_PHONE) {
    return `Recruiter phone must be ${MAX_RECRUITER_PHONE} characters or fewer.`;
  }
  if (phone && !PHONE.test(phone)) {
    return "Enter a valid recruiter phone number.";
  }

  if (email.length > MAX_RECRUITER_EMAIL) {
    return `Recruiter email must be ${MAX_RECRUITER_EMAIL} characters or fewer.`;
  }
  if (email && !EMAIL.test(email)) {
    return "Enter a valid recruiter email address.";
  }

  return null;
}
