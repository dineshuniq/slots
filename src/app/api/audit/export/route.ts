import { AUDIT_EXPORT_LIMIT, listAudit } from "@/lib/audit";
import { fail, forbidden, serverError, unauthorized } from "@/lib/http";
import { getSession, isController } from "@/lib/session";
import { SCHEDULE_LOCALE, SCHEDULE_TIMEZONE } from "@/lib/time";
import { buildCsv, buildXlsx, type SheetCell } from "@/lib/xlsx";

const HEADERS = ["When", "Who", "Role", "Action", "What happened", "Subject"];

const ROLE_LABELS: Record<string, string> = {
  controller: "Controller",
  candidate: "Candidate",
  system: "System",
};

/** Same timestamp the page shows, so an export matches what was on screen. */
function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(SCHEDULE_LOCALE, {
    timeZone: SCHEDULE_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Download the audit trail as a spreadsheet. Controller only. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const params = new URL(request.url).searchParams;
    const format = (params.get("format") ?? "csv").toLowerCase();
    if (format !== "csv" && format !== "xlsx") {
      return fail("Format must be csv or xlsx.", 400);
    }

    const entries = await listAudit({
      from: params.get("from"),
      to: params.get("to"),
      action: params.get("action"),
      actorRole: params.get("actorRole"),
      search: params.get("q"),
      limit: AUDIT_EXPORT_LIMIT,
    });

    const rows: SheetCell[][] = entries.map((entry) => [
      formatWhen(entry.occurredAt),
      entry.actorName,
      ROLE_LABELS[entry.actorRole] ?? entry.actorRole,
      entry.actionLabel,
      entry.summary,
      entry.subjectLabel ?? "",
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `audit-logs-${stamp}.${format}`;

    // attachment + the filename is what makes the browser save rather than render.
    const disposition = `attachment; filename="${filename}"`;

    if (format === "csv") {
      return new Response(buildCsv(HEADERS, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": disposition,
          "Cache-Control": "no-store",
        },
      });
    }

    const workbook = buildXlsx("Audit Logs", HEADERS, rows);
    return new Response(workbook as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
