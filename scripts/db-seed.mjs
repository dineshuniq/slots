/**
 * Seeds panels and demo candidates, then prints their sign-in tokens.
 *   npm run db:seed            (skips if candidates already exist)
 *   npm run db:seed -- --force (adds another batch anyway)
 */
import { randomBytes } from "node:crypto";

import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set. Create .env.local from .env.example.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const sql = postgres(url, {
  max: 1,
  ssl: isLocal || /sslmode=disable/.test(url) ? false : "require",
});

// No I/O/0/1 - these get read aloud and typed in by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeToken() {
  const bytes = randomBytes(6);
  let token = "";
  for (const byte of bytes) token += ALPHABET[byte % ALPHABET.length];
  return `CAND-${token}`;
}

const PANELS = [
  { id: "CELL1", label: "CELL1", sort_order: 1 },
  { id: "CELL2", label: "CELL2", sort_order: 2 },
  { id: "CELL3", label: "CELL3", sort_order: 3 },
];

const PEOPLE = [
  { name: "Aarav Sharma", panel: "CELL1" },
  { name: "Priya Nair", panel: "CELL1" },
  { name: "Rohan Gupta", panel: "CELL2" },
  { name: "Ananya Iyer", panel: "CELL2" },
  { name: "Vikram Reddy", panel: "CELL3" },
  { name: "Meera Krishnan", panel: "CELL3" },
];

try {
  for (const panel of PANELS) {
    await sql`
      insert into panels (id, label, sort_order)
      values (${panel.id}, ${panel.label}, ${panel.sort_order})
      on conflict (id) do update set label = excluded.label,
                                     sort_order = excluded.sort_order,
                                     active = true
    `;
  }
  console.log(`Panels ready: ${PANELS.map((p) => p.id).join(", ")}`);

  const existing = await sql`select count(*)::int as count from candidates`;
  const force = process.argv.includes("--force");

  if (existing[0].count > 0 && !force) {
    const rows = await sql`
      select name, token, panel_id from candidates where active order by name
    `;
    console.log(`\n${rows.length} candidate(s) already seeded:\n`);
    for (const row of rows) {
      console.log(`  ${row.token}  ${row.panel_id}  ${row.name}`);
    }
    console.log("\nRe-run with -- --force to add another batch.");
  } else {
    const created = [];
    for (const person of PEOPLE) {
      const token = makeToken();
      await sql`
        insert into candidates (token, name, panel_id)
        values (${token}, ${person.name}, ${person.panel})
      `;
      created.push({ token, ...person });
    }
    console.log(`\nSeeded ${created.length} candidates:\n`);
    for (const row of created) {
      console.log(`  ${row.token}  ${row.panel}  ${row.name}`);
    }
  }

  console.log("\nControllers sign in with CONTROLLER_PASSWORD from your env.");
} catch (error) {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
