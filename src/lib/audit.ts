import { sql } from "@/lib/db";
import type { Session } from "@/lib/session";

/**
 * The audit trail.
 *
 * Each row stores the finished English sentence rather than raw fields, so the
 * Audit Logs page is a plain list and an entry still reads correctly years
 * later, after the code that produced it has changed.
 *
 * Recording never blocks the action it describes: if the write fails the
 * original request still succeeds and the failure is logged server-side. An
 * audit trail that can take the booking system down with it is worse than one
 * with an occasional gap.
 */

export const AUDIT_ACTIONS = {
  candidateCreated: "candidate.created",
  candidateEnabled: "candidate.enabled",
  candidateDisabled: "candidate.disabled",
  candidateDeleted: "candidate.deleted",
  bookingCreated: "booking.created",
  bookingMoved: "booking.moved",
  bookingCancelled: "booking.cancelled",
  waitingJoined: "waiting.joined",
  waitingLeft: "waiting.left",
  waitingPlaced: "waiting.placed",
  panelClosed: "panel.closed",
  panelReopened: "panel.reopened",
  controllerSignedIn: "controller.signed_in",
  controllerPasswordChanged: "controller.password_changed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Human labels for the filter menu, in the order they should appear. */
export const AUDIT_ACTION_LABELS: { action: AuditAction; label: string }[] = [
  { action: AUDIT_ACTIONS.bookingCreated, label: "Session booked" },
  { action: AUDIT_ACTIONS.bookingMoved, label: "Session moved" },
  { action: AUDIT_ACTIONS.bookingCancelled, label: "Session cancelled" },
  { action: AUDIT_ACTIONS.candidateCreated, label: "Token issued" },
  { action: AUDIT_ACTIONS.candidateEnabled, label: "Token enabled" },
  { action: AUDIT_ACTIONS.candidateDisabled, label: "Token disabled" },
  { action: AUDIT_ACTIONS.candidateDeleted, label: "Candidate deleted" },
  { action: AUDIT_ACTIONS.waitingJoined, label: "Joined waiting list" },
  { action: AUDIT_ACTIONS.waitingPlaced, label: "Placed from waiting list" },
  { action: AUDIT_ACTIONS.waitingLeft, label: "Left waiting list" },
  { action: AUDIT_ACTIONS.panelClosed, label: "Panel closed" },
  { action: AUDIT_ACTIONS.panelReopened, label: "Panel reopened" },
  { action: AUDIT_ACTIONS.controllerSignedIn, label: "Controller signed in" },
  {
    action: AUDIT_ACTIONS.controllerPasswordChanged,
    label: "Password changed",
  },
];

export function actionLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS.find((entry) => entry.action === action)?.label ??
    action
  );
}

export type AuditEntry = {
  id: string;
  occurredAt: string;
  actorRole: "controller" | "candidate" | "system";
  actorName: string;
  action: string;
  actionLabel: string;
  summary: string;
  subjectLabel: string | null;
};

type RecordInput = {
  session: Session | null;
  action: AuditAction;
  summary: string;
  subjectLabel?: string | null;
  details?: Record<string, unknown>;
};

/** Writes one entry. Swallows its own failures by design - see above. */
export async function recordAudit(input: RecordInput): Promise<void> {
  const actorRole = input.session?.role ?? "system";
  const actorName = input.session?.name ?? "System";
  const actorId =
    input.session?.role === "controller"
      ? input.session.controllerId
      : input.session?.role === "candidate"
        ? input.session.candidateId
        : null;

  try {
    await sql`
      insert into audit_logs
        (actor_role, actor_id, actor_name, action, summary, subject_label, details)
      values
        (${actorRole}, ${actorId}, ${actorName}, ${input.action},
         ${input.summary}, ${input.subjectLabel ?? null},
         ${JSON.stringify(input.details ?? {})}::jsonb)
    `;
  } catch (error) {
    console.error("[audit] could not record", input.action, error);
  }
}

export type AuditFilters = {
  from?: string | null;
  to?: string | null;
  action?: string | null;
  actorRole?: string | null;
  search?: string | null;
  limit?: number;
};

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_role: "controller" | "candidate" | "system";
  actor_name: string;
  action: string;
  summary: string;
  subject_label: string | null;
};

export const AUDIT_PAGE_LIMIT = 200;
export const AUDIT_EXPORT_LIMIT = 10_000;

export async function listAudit(
  filters: AuditFilters = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(
    Math.max(filters.limit ?? AUDIT_PAGE_LIMIT, 1),
    AUDIT_EXPORT_LIMIT,
  );

  const search = filters.search?.trim();

  const rows = await sql<AuditRow[]>`
    select id,
           occurred_at,
           actor_role,
           actor_name,
           action,
           summary,
           subject_label
      from audit_logs
     where true
       ${filters.from ? sql`and occurred_at >= ${filters.from}::date` : sql``}
       ${filters.to ? sql`and occurred_at < (${filters.to}::date + 1)` : sql``}
       ${filters.action ? sql`and action = ${filters.action}` : sql``}
       ${filters.actorRole ? sql`and actor_role = ${filters.actorRole}` : sql``}
       ${
         search
           ? sql`and (summary ilike ${"%" + search + "%"}
                   or actor_name ilike ${"%" + search + "%"}
                   or coalesce(subject_label, '') ilike ${"%" + search + "%"})`
           : sql``
       }
     order by occurred_at desc, id desc
     limit ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    occurredAt: new Date(row.occurred_at).toISOString(),
    actorRole: row.actor_role,
    actorName: row.actor_name,
    action: row.action,
    actionLabel: actionLabel(row.action),
    summary: row.summary,
    subjectLabel: row.subject_label,
  }));
}
