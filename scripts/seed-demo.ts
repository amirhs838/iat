// =============================================================================
// OPTIONAL demo-data seeder for the admin dashboard (NEVER used in production).
// Creates clearly-labeled demo participants ("DEMO-...") with synthetic
// sessions, trials, and scores so the dashboard can be evaluated.
//
// Run: bun run db:seed-demo
// =============================================================================

import { db } from "../src/lib/db";
import { buildSessionPlan } from "../src/lib/iat/sequence";
import { generateAnonymousId } from "../src/lib/iat/random";
import { computeSessionScores, validateSubmittedTrials } from "../src/lib/iat/scoring/index";
import { IAT_TEST_DEFINITION } from "../src/config/iat/test-definition";
import type { ClientTrialResult, ScoringTrial } from "../src/lib/iat/types";


function rngFactory(seed: string) {
  // mulberry32
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const tv = await db.testVersion.findUnique({ where: { code: IAT_TEST_DEFINITION.code } });
  if (!tv) throw new Error("TestVersion not seeded — run `bun run db:seed` first");

  const existing = await db.participant.count({ where: { anonymousId: { startsWith: "DEMO-" } } });
  if (existing > 0) {
    console.log(`demo data already present (${existing} participants) — skipping`);
    return;
  }

  const N = 40;
  const genders = ["زن", "مرد"];
  const educations = ["دیپلم", "کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری"];
  const provinces = ["تهران", "اصفهان", "فارس", "خراسان رضوی", "آذربایجان شرقی", "گیلان", "خوزستان"];

  let done = 0;
  for (let i = 0; i < N; i++) {
    const rand = rngFactory(`demo-${i}`);
    const conditionOrder: "A" | "B" = rand() < 0.5 ? "A" : "B";
    const seed = Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join("");
    const plan = buildSessionPlan(conditionOrder, seed, tv.blockStructure);
    const participant = await db.participant.create({
      data: {
        anonymousId: `DEMO-${generateAnonymousId().slice(2)}`,
        age: 18 + Math.floor(rand() * 30),
        gender: genders[Math.floor(rand() * 2)],
        education: educations[Math.floor(rand() * educations.length)],
        province: provinces[Math.floor(rand() * provinces.length)],
        consent: true,
        consentAt: new Date(Date.now() - Math.floor(rand() * 30) * 86400000),
      },
    });

    // simulate effect size heterogeneity + data quality variation
    const effect = rand() < 0.5 ? -1 : 1; // direction
    const magnitude = 40 + rand() * 180; // ms
    const errorRate = rand() < 0.15 ? 0.12 : 0.03 + rand() * 0.04;
    const fastRate = rand() < 0.08 ? 0.12 + rand() * 0.1 : rand() * 0.03;
    const incomplete = rand() < 0.06; // abandoned mid-test
    const session = await db.session.create({
      data: {
        participantId: participant.id,
        testVersionId: tv.id,
        conditionOrder,
        blockOrder: plan.blockOrder,
        randomSeed: seed,
        blockPlanJson: JSON.stringify(plan),
        status: incomplete ? "ABANDONED" : "COMPLETED",
        startedAt: new Date(Date.now() - (N - i) * 3600000),
        completedAt: incomplete ? null : new Date(Date.now() - (N - i) * 3600000 + 14 * 60000),
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DemoSeeder",
        browser: "Chrome",
        browserVersion: "120",
        operatingSystem: "Windows 10+",
        screenWidth: 1920,
        screenHeight: 1080,
        deviceType: "desktop",
        language: "fa-IR",
        fullscreenExitCount: rand() < 0.1 ? 1 : 0,
        visibilityChangeCount: Math.floor(rand() * 3),
        awayDurationMs: Math.floor(rand() * 4000),
      },
    });

    if (incomplete) continue;

    const clientTrials: ClientTrialResult[] = plan.trials.map((t) => {
      let base = 620 + rand() * 140;
      if (t.blockNumber >= 3) {
        const block = plan.blocks.find((b) => b.number === t.blockNumber)!;
        const irnPos =
          (block.leftCategories.includes("iranian") && block.leftCategories.includes("positive")) ||
          (block.rightCategories.includes("iranian") && block.rightCategories.includes("positive"));
        base += irnPos ? -effect * magnitude / 2 : +effect * magnitude / 2;
        if (rand() < fastRate) base = 180 + rand() * 100;
      }
      const rt = Math.round(base);
      const correct = rand() > errorRate;
      return {
        blockNumber: t.blockNumber,
        trialNumberInBlock: t.trialNumberInBlock,
        globalTrialNumber: t.globalTrialNumber,
        stimulusId: t.stimulusId,
        responseKey: correct ? t.correctKey : t.correctKey === "E" ? "I" : "E",
        rt,
        correctionRt: correct ? null : rt + 400,
        errorCount: correct ? 0 : 1,
        timestamp: Date.now(),
      };
    });

    const validation = validateSubmittedTrials(plan, clientTrials);
    if (!validation.ok) continue;
    const scoringTrials: ScoringTrial[] = validation.scoringTrials;
    const scores = computeSessionScores(scoringTrials, conditionOrder, null);

    const trialRows = clientTrials.map((s, idx) => {
      const spec = plan.trials[idx];
      return {
        sessionId: session.id,
        blockNumber: s.blockNumber,
        trialNumberInBlock: s.trialNumberInBlock,
        globalTrialNumber: s.globalTrialNumber,
        stimulusId: s.stimulusId,
        stimulusPath: spec.stimulusPath,
        stimulusType: spec.stimulusType,
        stimulusCategory: spec.stimulusCategory,
        targetCategory: spec.targetCategory,
        attributeCategory: spec.attributeCategory,
        correctKey: spec.correctKey,
        responseKey: s.responseKey,
        correct: s.responseKey === spec.correctKey,
        rt: s.rt,
        correctionRt: s.correctionRt,
        errorCount: s.errorCount,
        timestamp: new Date(s.timestamp),
        flags: JSON.stringify(validation.trials[idx].flags),
      };
    });
    await db.trial.createMany({ data: trialRows });

    const imp = scores.improved;
    const dirFactor = conditionOrder === "A" ? 1 : -1;
    await db.score.createMany({
      data: [
        {
          sessionId: session.id,
          scoringAlgorithm: "improved-d-2003",
          scoringVersion: "improved-d-2003/v1",
          dScore: imp.dScore,
          normalizedD: scores.normalizedD,
          d1: imp.d1,
          d2: imp.d2,
          b3Mean: imp.b3Mean,
          b4Mean: imp.b4Mean,
          b6Mean: imp.b6Mean,
          b7Mean: imp.b7Mean,
          pooledSdPractice: imp.pooledSdPractice,
          pooledSdTest: imp.pooledSdTest,
          errorRate: imp.errorRate,
          fastResponseRate: imp.fastResponseRate,
          valid: scores.sessionValid,
          exclusionReason: scores.exclusionReason,
          qualityFlags: JSON.stringify(scores.qualityFlags),
          statsJson: JSON.stringify(imp.stats),
        },
        ...(scores.conventional?.dScore !== null && scores.conventional?.dScore !== undefined
          ? [
              {
                sessionId: session.id,
                scoringAlgorithm: "conventional-2003",
                scoringVersion: "conventional-2003/v1",
                dScore: scores.conventional.dScore,
                normalizedD: scores.conventional.dScore * dirFactor,
                d1: scores.conventional.d1,
                d2: scores.conventional.d2,
                b3Mean: scores.conventional.b3Mean,
                b4Mean: scores.conventional.b4Mean,
                b6Mean: scores.conventional.b6Mean,
                b7Mean: scores.conventional.b7Mean,
                pooledSdPractice: scores.conventional.pooledSdPractice,
                pooledSdTest: scores.conventional.pooledSdTest,
                errorRate: scores.conventional.errorRate,
                fastResponseRate: null,
                valid: scores.conventional.ok,
                exclusionReason: scores.conventional.exclusionReason,
                qualityFlags: JSON.stringify(scores.conventional.flags),
                statsJson: JSON.stringify(scores.conventional.stats),
              },
            ]
          : []),
      ],
    });
    done += 1;
  }
  console.log(`demo seed complete: ${done} completed demo sessions created`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
