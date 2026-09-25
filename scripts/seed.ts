// =============================================================================
// Database seed: admin user + active TestVersion + Stimulus registry.
// Idempotent — safe to re-run.
//
// Run: bun run db:seed
// Env: ADMIN_USERNAME (default "admin"), ADMIN_PASSWORD (REQUIRED in production;
//      dev default "iat-admin-2024" — CHANGE IT, see README).
// =============================================================================

import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { IAT_TEST_DEFINITION, STIMULUS_SPEC, describeBlockOrder } from "../src/config/iat/test-definition";

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "iat-admin-2024";

  const existing = await db.adminUser.findUnique({ where: { username } });
  if (existing) {
    // SAFETY: never overwrite an existing admin password during re-seeding.
    // Production databases are re-seeded on every stimulus/version change and
    // the researcher may have changed the password via admin → تنظیمات.
    console.log(`admin user exists, password left untouched: ${username}`);
  } else {
    const passwordHash = await hashPassword(password);
    await db.adminUser.create({ data: { username, passwordHash } });
    console.log(`admin user created: ${username} (default password — change it in admin → تنظیمات)`);
  }
}

async function seedTestVersion() {
  const def = IAT_TEST_DEFINITION;
  const blockStructure = def.blocks.map((b) => b.trialCount).join("/");
  const data = {
    name: def.name,
    version: def.version,
    code: def.code,
    configJson: JSON.stringify(def),
    scoringVersion: def.scoringVersion,
    blockStructure,
    active: true,
  };
  const tv = await db.testVersion.upsert({
    where: { code: def.code },
    update: data,
    create: data,
  });
  console.log(`test version seeded: ${tv.code} v${tv.version} (${tv.blockStructure})`);

  // Stimulus registry (mirrors configuration)
  // NOTE: rows with uploadedAt != null hold a file uploaded via the admin panel
  // by the researcher — re-seeding preserves that path and timestamp.
  const all = [...def.targets, ...def.attributes];
  let order = 0;
  for (const category of all) {
    for (const ex of category.exemplars) {
      const existing = await db.stimulus.findUnique({ where: { stimulusKey: ex.id } });
      const preserveUpload = existing?.uploadedAt != null;
      const description =
        STIMULUS_SPEC[ex.id] ??
        (category.stimulusType === "word"
          ? `واژه‌ی ویژگی استاندارد IAT (طبقه‌ی ${category.label}) — معادل فارسی واژه‌ی فهرست گرینوالد و همکاران (۱۹۹۸، ۲۰۰۳).`
          : null);
      const data = {
        type: category.stimulusType,
        category: category.key,
        path: preserveUpload ? existing!.path : ex.path,
        label: ex.label ?? null,
        description: description ?? null,
        version: def.version,
        active: true,
        sortOrder: order,
        testVersionId: tv.id,
      };
      await db.stimulus.upsert({
        where: { stimulusKey: ex.id },
        update: data,
        create: { stimulusKey: ex.id, ...data },
      });
      order += 1;
    }
  }
  console.log(`stimuli seeded: ${order}`);
  console.log(`block order: ${describeBlockOrder(def)}`);
}

async function main() {
  await seedAdmin();
  await seedTestVersion();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
