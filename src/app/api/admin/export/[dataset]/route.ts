// =============================================================================
// GET /api/admin/export/[dataset]?format=csv|json
//
// Datasets (raw vs processed are kept SEPARATE):
//   participants — participant table
//   sessions     — session metadata (reproducibility fields included)
//   trials       — RAW trial data exactly as recorded by the browser
//   scores       — PROCESSED scoring outputs (per algorithm row)
//   full         — complete research bundle (JSON) or flat joined CSV (trials+session)
//
// Filters: from, to, testVersionId, conditionOrder, validity
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-utils";
import { parseFilters, completedWhere } from "@/lib/admin-queries";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

function fileResponse(body: string, contentType: string, filename: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const { dataset } = await params;
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") === "json" ? "json" : "csv";
  const filters = parseFilters(sp);
  const where = completedWhere(filters);
  const stamp = new Date().toISOString().slice(0, 10);

  const csvOrJson = <T extends object>(headers: string[], rows: unknown[][], items: T[], name: string) => {
    if (format === "json") {
      return fileResponse(
        JSON.stringify({ dataset: name, exportedAt: new Date().toISOString(), count: items.length, items }, null, 2),
        "application/json; charset=utf-8",
        `iat-${name}-${stamp}.json`,
      );
    }
    return fileResponse(toCsv(headers, rows), "text/csv; charset=utf-8", `iat-${name}-${stamp}.csv`);
  };

  try {
    if (dataset === "participants") {
      const items = await db.participant.findMany({ orderBy: { createdAt: "asc" } });
      const headers = ["id", "anonymousId", "age", "gender", "education", "income", "religiosity", "occupation", "consent", "consentAt", "createdAt"];
      const rows = items.map((p) => [p.id, p.anonymousId, p.age, p.gender, p.education, p.income, p.religiosity, p.occupation, p.consent, p.consentAt?.toISOString() ?? "", p.createdAt.toISOString()]);
      return csvOrJson(headers, rows, items, "participants");
    }

    if (dataset === "sessions") {
      const items = await db.session.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: { participant: { select: { anonymousId: true } }, testVersion: { select: { code: true, version: true } } },
      });
      const headers = [
        "id", "participantAnonymousId", "testVersionCode", "testVersionVersion", "conditionOrder", "blockOrder",
        "randomSeed", "status", "startedAt", "completedAt", "browser", "browserVersion", "operatingSystem",
        "screenWidth", "screenHeight", "deviceType", "language", "fullscreenExitCount", "fullscreenDenied",
        "visibilityChangeCount", "awayDurationMs", "exclusionReason", "qualityFlags", "createdAt",
      ];
      const rows = items.map((s) => [
        s.id, s.participant.anonymousId, s.testVersion.code, s.testVersion.version, s.conditionOrder, s.blockOrder,
        s.randomSeed, s.status, s.startedAt?.toISOString() ?? "", s.completedAt?.toISOString() ?? "", s.browser,
        s.browserVersion, s.operatingSystem, s.screenWidth, s.screenHeight, s.deviceType, s.language,
        s.fullscreenExitCount, s.fullscreenDenied, s.visibilityChangeCount, s.awayDurationMs, s.exclusionReason,
        s.qualityFlags ?? "", s.createdAt.toISOString(),
      ]);
      return csvOrJson(headers, rows, items, "sessions");
    }

    if (dataset === "trials") {
      const sessions = await db.session.findMany({ where, select: { id: true } });
      const ids = sessions.map((s) => s.id);
      const items = ids.length
        ? await db.trial.findMany({ where: { sessionId: { in: ids } }, orderBy: [{ sessionId: "asc" }, { globalTrialNumber: "asc" }] })
        : [];
      const headers = [
        "sessionId", "globalTrialNumber", "blockNumber", "trialNumberInBlock", "stimulusId", "stimulusPath",
        "stimulusType", "stimulusCategory", "targetCategory", "attributeCategory", "correctKey", "responseKey",
        "correct", "rt", "correctionRt", "errorCount", "timestamp", "flags",
      ];
      const rows = items.map((t) => [
        t.sessionId, t.globalTrialNumber, t.blockNumber, t.trialNumberInBlock, t.stimulusId, t.stimulusPath,
        t.stimulusType, t.stimulusCategory, t.targetCategory, t.attributeCategory, t.correctKey, t.responseKey ?? "",
        t.correct, t.rt ?? "", t.correctionRt ?? "", t.errorCount, t.timestamp, t.flags ?? "",
      ]);
      return csvOrJson(headers, rows, items, "trials-raw");
    }

    if (dataset === "scores") {
      const items = await db.score.findMany({
        where: { session: where },
        orderBy: { computedAt: "asc" },
        include: { session: { select: { conditionOrder: true, participant: { select: { anonymousId: true } } } } },
      });
      const headers = [
        "sessionId", "participantAnonymousId", "conditionOrder", "scoringAlgorithm", "scoringVersion", "dScore",
        "normalizedD", "d1", "d2", "b3Mean", "b4Mean", "b6Mean", "b7Mean", "pooledSdPractice", "pooledSdTest",
        "errorRate", "fastResponseRate", "valid", "exclusionReason", "qualityFlags", "computedAt",
      ];
      const rows = items.map((s) => [
        s.sessionId, s.session.participant.anonymousId, s.session.conditionOrder, s.scoringAlgorithm, s.scoringVersion,
        s.dScore ?? "", s.normalizedD ?? "", s.d1 ?? "", s.d2 ?? "", s.b3Mean ?? "", s.b4Mean ?? "", s.b6Mean ?? "",
        s.b7Mean ?? "", s.pooledSdPractice ?? "", s.pooledSdTest ?? "", s.errorRate ?? "", s.fastResponseRate ?? "",
        s.valid, s.exclusionReason ?? "", s.qualityFlags ?? "", s.computedAt.toISOString(),
      ]);
      return csvOrJson(headers, rows, items, "scores-processed");
    }

    if (dataset === "full") {
      const participants = await db.participant.findMany({ orderBy: { createdAt: "asc" } });
      const sessions = await db.session.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: {
          participant: { select: { anonymousId: true } },
          testVersion: { select: { code: true } },
        },
      });
      const sessionIds = sessions.map((s) => s.id);
      const trials = sessionIds.length
        ? await db.trial.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: [{ sessionId: "asc" }, { globalTrialNumber: "asc" }] })
        : [];
      const scores = await db.score.findMany({ where: { sessionId: { in: sessionIds } } });
      const testVersions = await db.testVersion.findMany();

      if (format === "json") {
        const bundle = {
          dataset: "full-research-dataset",
          exportedAt: new Date().toISOString(),
          scoringReference: "Greenwald, Nosek & Banaji (2003), JPSP 85(2), 197-216 — improved D (recommended algorithm)",
          note: "trials are RAW browser observations; scores are PROCESSED derived values. Never modify raw fields.",
          participants,
          sessions,
          trials,
          scores,
          testVersions,
        };
        return fileResponse(
          JSON.stringify(bundle, null, 2),
          "application/json; charset=utf-8",
          `iat-full-research-dataset-${stamp}.json`,
        );
      }
      // Flat joined CSV (one row per trial, enriched with session metadata)
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));
      const scoreMap = new Map(scores.filter((s) => s.scoringAlgorithm === "improved-d-2003").map((s) => [s.sessionId, s]));
      const headers = [
        "sessionId", "participantAnonymousId", "conditionOrder", "randomSeed", "testVersionCode", "sessionStatus",
        "globalTrialNumber", "blockNumber", "trialNumberInBlock", "stimulusId", "stimulusType", "stimulusCategory",
        "correctKey", "responseKey", "correct", "rt", "correctionRt", "errorCount", "flags",
        "improvedDScore", "normalizedD", "scoreValid",
      ];
      const rows = trials.map((t) => {
        const s = sessionMap.get(t.sessionId);
        const sc = scoreMap.get(t.sessionId);
        return [
          t.sessionId, s?.participant.anonymousId ?? "", s?.conditionOrder ?? "", s?.randomSeed ?? "",
          s?.testVersion.code ?? "", s?.status ?? "", t.globalTrialNumber, t.blockNumber, t.trialNumberInBlock,
          t.stimulusId, t.stimulusType, t.stimulusCategory, t.correctKey, t.responseKey ?? "", t.correct,
          t.rt ?? "", t.correctionRt ?? "", t.errorCount, t.flags ?? "", sc?.dScore ?? "", sc?.normalizedD ?? "",
          sc?.valid ?? "",
        ];
      });
      return fileResponse(toCsv(headers, rows), "text/csv; charset=utf-8", `iat-full-flat-${stamp}.csv`);
    }

    return jsonError("unknown dataset", 404);
  } catch (e) {
    console.error("export failed", e);
    return jsonError("export failed", 500);
  }
}
