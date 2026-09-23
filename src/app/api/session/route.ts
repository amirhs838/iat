// =============================================================================
// POST /api/session — create Participant + Session + deterministic trial plan.
// Called ONCE before the experiment starts (after consent + demographics).
// The response contains the full trial plan; the client then preloads all
// stimuli and runs offline — no network during critical trials.
// =============================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError } from "@/lib/api-utils";
import { generateAnonymousId, generateSessionSeed, assignConditionOrder } from "@/lib/iat/random";
import { buildSessionPlan } from "@/lib/iat/sequence";
import { blockOrderString } from "@/lib/iat/blocks";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import { loadEffectiveDefinition } from "@/lib/iat/registry";
import { parseUserAgent } from "@/lib/ua";

export const runtime = "nodejs";

const BodySchema = z.object({
  consent: z.literal(true),
  age: z.number().int().min(8).max(100),
  gender: z.string().min(1).max(50),
  education: z.string().min(1).max(60),
  province: z.string().max(60).nullish(),
  environment: z
    .object({
      screenWidth: z.number().int().min(0).max(20000),
      screenHeight: z.number().int().min(0).max(20000),
      deviceType: z.string().max(20),
      language: z.string().max(20).nullish(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return jsonError("validation failed", 422, { issues: parsed.error.issues?.slice(0, 5) });
  }
  const body = parsed.data;

  // Active test version
  const testVersion = await db.testVersion.findFirst({ where: { active: true, code: IAT_TEST_DEFINITION.code } });
  if (!testVersion) {
    return jsonError("no active test version — run db:seed", 500);
  }

  // Counterbalancing: crypto-random 50/50 assignment (stored, documented)
  const conditionOrder = assignConditionOrder();
  const randomSeed = generateSessionSeed();
  const blockOrder = blockOrderString();

  // Effective definition: structure from static config, stimulus paths/labels
  // from the DB registry (panel uploads take effect for new sessions).
  const effectiveDef = await loadEffectiveDefinition(testVersion.id);

  // Deterministic, reproducible plan snapshot
  const plan = buildSessionPlan(conditionOrder, randomSeed, blockOrder, effectiveDef);

  const ua = req.headers.get("user-agent") ?? "";
  const uaInfo = parseUserAgent(ua);

  const participant = await db.participant.create({
    data: {
      anonymousId: generateAnonymousId(),
      age: body.age,
      gender: body.gender,
      education: body.education,
      province: body.province ?? null,
      consent: true,
      consentAt: new Date(),
    },
  });

  const session = await db.session.create({
    data: {
      participantId: participant.id,
      testVersionId: testVersion.id,
      conditionOrder,
      blockOrder,
      randomSeed,
      blockPlanJson: JSON.stringify(plan),
      status: "CREATED",
      userAgent: ua.slice(0, 500),
      browser: uaInfo.browser,
      browserVersion: uaInfo.browserVersion,
      operatingSystem: uaInfo.operatingSystem,
      screenWidth: body.environment?.screenWidth ?? null,
      screenHeight: body.environment?.screenHeight ?? null,
      deviceType: body.environment?.deviceType ?? uaInfo.deviceType,
      language: body.environment?.language ?? null,
    },
  });

  return json({
    sessionId: session.id,
    participantId: participant.id,
    anonymousId: participant.anonymousId,
    testVersion: {
      code: testVersion.code,
      version: testVersion.version,
      scoringVersion: testVersion.scoringVersion,
      blockStructure: testVersion.blockStructure,
    },
    conditionOrder,
    blockOrder,
    randomSeed,
    plan,
  });
}

export async function GET() {
  return jsonError("method not allowed", 405);
}
