/**
 * Is this email the app owner's?
 *
 * Frontend layer of the owner allowlist. It only improves the user experience
 * (strangers are signed out and see "Access denied"). The real security checks
 * are in the backend (app/auth.py) and the database (RLS).
 */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  if (!email || !ownerEmail) return false;
  return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}
