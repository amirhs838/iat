// =============================================================================
// Shared types for the IAT engine.
// The engine is fully configuration-driven: no target/attribute category is
// hard-coded anywhere in engine, scoring, or database logic.
// =============================================================================

/** Counterbalancing condition.
 *  "A" = Iranian+Positive share a key in blocks 3-4 (first pairing)
 *  "B" = Iranian+Negative share a key in blocks 3-4 (first pairing)
 *  (Labels are configuration-driven; the semantic is "which pairing comes first".)
 */
export type ConditionOrder = "A" | "B";

/** Physical response keys. Standard IAT: E (left) / I (right). */
export type ResponseKey = "E" | "I";

export type StimulusType = "image" | "word";

export type BlockKind =
  | "target-discrimination"
  | "attribute-discrimination"
  | "combined"
  | "target-discrimination-reversed"
  | "combined-reversed";

export interface StimulusExemplar {
  /** Stable key used in DB and exports, e.g. "iranian-01", "pos-03" */
  id: string;
  /** image: public URL path; word: literal word text */
  path: string;
  /** Optional human-readable label (admin UI only) */
  label?: string;
}

export interface CategoryDefinition {
  /** Stable key, e.g. "iranian" — referenced by block mapping config */
  key: string;
  /** Display label (Persian), e.g. "ایرانی" */
  label: string;
  stimulusType: StimulusType;
  exemplars: StimulusExemplar[];
}

/** Full, immutable test definition (versioned). Snapshotted into TestVersion. */
export interface TestDefinition {
  name: string;
  version: string; // semver of the test definition
  code: string; // stable code, e.g. "iranian-afghan-att-v1"
  scoringVersion: string; // e.g. "improved-d-2003/v1"
  language: string;
  responseKeys: { left: "E"; right: "I" };
  timing: {
    /** Blank inter-trial interval (ms) between a correct response and the next stimulus */
    interTrialIntervalMs: number;
  };
  scoring: {
    errorPenaltyMs: number; // built-in error penalty (Greenwald et al., 2003) = 600
    slowCutoffMs: number; // trials > this are deleted = 10000
    fastThresholdMs: number; // fast-response threshold = 300
    fastMaxProportion: number; // > this proportion of fast trials invalidates session = 0.10
  };
  targets: CategoryDefinition[];
  attributes: CategoryDefinition[];
  /**
   * Counterbalancing conditions. `firstPairing` names the target x attribute
   * categories that share a response key in blocks 3-4.
   */
  conditions: Record<
    ConditionOrder,
    { description: string; firstPairing: { target: string; attribute: string } }
  >;
  /**
   * Explicit 7-block configuration (LOCKED, see README):
   * Greenwald, Nosek & Banaji (2003), Table 1 / Nosek et al. (2007) / Inquisit
   * standard: 20/20/20/40/40/20/40. BLOCK_5_TRIAL_COUNT = 40.
   */
  blocks: BlockConfig[];
}

export interface BlockConfig {
  number: number; // 1..7
  kind: BlockKind;
  trialCount: number;
  /** Included in D-score computation (blocks 3, 4, 6, 7) */
  isCritical: boolean;
}

// ---------------------------------------------------------------------------
// Session plan (server-generated, snapshotted per session)
// ---------------------------------------------------------------------------

export interface BlockPlanEntry {
  number: number;
  kind: BlockKind;
  trialCount: number;
  isCritical: boolean;
  /** Category keys sharing the LEFT (E) key in this block */
  leftCategories: string[];
  /** Category keys sharing the RIGHT (I) key in this block */
  rightCategories: string[];
  leftLabel: string; // display label(s) for the left side
  rightLabel: string;
  leftKey: "E";
  rightKey: "I";
  /** Convenience denormalization of the LEFT-side pairing (analysis metadata):
   *  - target blocks: targetCategory = left target, attributeCategory = ""
   *  - attribute blocks: targetCategory = "", attributeCategory = left attribute
   *  - combined blocks: both = left-side categories */
  targetCategory: string;
  attributeCategory: string;
  instructionTitle: string;
  instructionBody: string;
}

export interface TrialSpec {
  blockNumber: number;
  trialNumberInBlock: number;
  globalTrialNumber: number;
  stimulusId: string;
  /** image path or word text */
  stimulusPath: string;
  stimulusType: StimulusType;
  /** actual category of the displayed stimulus */
  stimulusCategory: string;
  correctKey: ResponseKey;
  /** block pairing context (see BlockPlanEntry) */
  targetCategory: string;
  attributeCategory: string;
}

export interface SessionPlan {
  conditionOrder: ConditionOrder;
  randomSeed: string;
  blockOrder: string;
  blocks: BlockPlanEntry[];
  trials: TrialSpec[];
}

// ---------------------------------------------------------------------------
// Client trial result (submitted at session completion)
// ---------------------------------------------------------------------------

export interface ClientTrialResult {
  blockNumber: number;
  trialNumberInBlock: number;
  globalTrialNumber: number;
  stimulusId: string;
  responseKey: ResponseKey | null; // first response
  rt: number | null; // ms from stimulus onset to FIRST keypress (raw)
  correctionRt: number | null; // ms from onset to CORRECT keypress (error trials)
  errorCount: number;
  /** client epoch ms at stimulus onset */
  timestamp: number;
}

export interface ClientQualityMetadata {
  fullscreenExitCount: number;
  fullscreenDenied: boolean;
  visibilityChangeCount: number;
  awayDurationMs: number;
  screenWidth: number;
  screenHeight: number;
  deviceType: string;
  language: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Scoring types
// ---------------------------------------------------------------------------

export interface ScoringTrial {
  blockNumber: number;
  rt: number | null;
  correct: boolean;
}
