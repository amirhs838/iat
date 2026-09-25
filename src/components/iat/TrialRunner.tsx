"use client";

// =============================================================================
// TrialRunner — the critical experiment screen.
//
// TIMING CONTRACT (see README → RT measurement strategy):
//   - RT is measured with performance.now() from post-paint stimulus onset to
//     the FIRST response (raw, never transformed).
//   - PRIMARY INPUT: the two large on-screen buttons (pointerdown — identical
//     handling for touch, mouse and pen; lowest possible latency on mobile).
//     On desktop (pointer: fine + hover) the buttons display the physical KEY
//     letters (E / I) and the keyboard (event.code KeyE/KeyI) is the natural
//     input; clicking the buttons remains fully equivalent.
//     Touch devices keep the full category labels on the buttons.
//   - ANTICIPATION LOCKOUT (ANTICIPATION_LOCKOUT_MS): inputs arriving within
//     the first 200 ms after stimulus onset are IGNORED (not recorded).
//     Rationale: choice reaction time below ~200 ms is not physically
//     meaningful (anticipatory response), and this window also absorbs
//     double-press/double-tap input leaking from the previous trial into the
//     next one. No data transformation happens — the trial simply keeps
//     waiting for a real response. Raw RT of accepted responses is untouched.
//   - No network requests, animations, or lazy loading occur inside a trial
//     (active/hover styles are instant state changes, not transitions).
//   - Wrong response → red X + the CORRECT button is highlighted green; the
//     participant must press the correct button to continue (standard IAT
//     error handling). First-response latency and correction latency are
//     both stored.
//   - Inter-trial interval: blank 250 ms (config), stimulus hidden.
//   - SIDE MAPPING: every row that maps content to physical screen sides is
//     dir="ltr" (explicitly), so physical left/right ALWAYS match the engine
//     semantics (leftCategories → leftKey "E", rightCategories → rightKey
//     "I") regardless of the document RTL direction. Persian text inside
//     individual elements still renders RTL.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockPlanEntry, ClientTrialResult, ResponseKey, TrialSpec } from "@/lib/iat/types";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import { toFa } from "@/lib/format";

interface TrialRunnerProps {
  block: BlockPlanEntry;
  trials: TrialSpec[];
  onBlockDone: (records: ClientTrialResult[]) => void;
}

/** Inputs faster than this after stimulus onset are ignored (anticipatory /
 *  leaked double-press). Chosen below the ~250 ms choice-RT floor so no real
 *  perceptual response is ever discarded. Documented in docs/IAT_SCORING.md. */
export const ANTICIPATION_LOCKOUT_MS = 200;

const doubleRaf = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Desktop (mouse/trackpad) detection: fine pointer + hover capability.
 *  Desktop participants answer with the physical keyboard, so the response
 *  buttons display the KEY letters (E / I) — the classic desktop IAT layout —
 *  while the category names stay pinned at the top corners with matching key
 *  badges. Touch devices (phones/tablets) are UNCHANGED: buttons keep the
 *  full category labels. Lazy initializer is safe: TrialRunner only mounts
 *  client-side after user interaction (no SSR hydration involved). */
function useDesktopKeys(): boolean {
  const [desktop] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: fine)")?.matches === true &&
    window.matchMedia?.("(hover: hover)")?.matches === true
  );
  return desktop;
}

export function TrialRunner({ block, trials, onBlockDone }: TrialRunnerProps) {
  const [display, setDisplay] = useState<TrialSpec | null>(null);
  const [showX, setShowX] = useState(false);
  const [trialNum, setTrialNum] = useState(0);
  const desktopKeys = useDesktopKeys();

  const recordsRef = useRef<ClientTrialResult[]>([]);
  const resolverRef = useRef<((r: { key: ResponseKey; t: number }) => void) | null>(null);
  const currentTrialRef = useRef<TrialSpec | null>(null);
  const phaseRef = useRef<"idle" | "stimulus" | "error">("idle");
  const onsetRef = useRef(0);
  const wrongCountRef = useRef(0);
  const runningRef = useRef(true);
  const onBlockDoneRef = useRef(onBlockDone);
  useEffect(() => {
    onBlockDoneRef.current = onBlockDone;
  }, [onBlockDone]);

  const finish = useCallback(() => {
    if (!runningRef.current) return;
    onBlockDoneRef.current(recordsRef.current);
  }, []);

  // Unified response pipeline for BOTH on-screen buttons and keyboard.
  // Depends only on refs → stable identity; safe to call from any handler.
  const respond = useCallback((key: ResponseKey) => {
    const phase = phaseRef.current;
    if (phase === "stimulus" && resolverRef.current) {
      // Anticipation lockout: ignore impossible/leaked inputs (see header).
      if (performance.now() - onsetRef.current < ANTICIPATION_LOCKOUT_MS) return;
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve({ key, t: performance.now() });
    } else if (phase === "error") {
      const trial = currentTrialRef.current;
      if (!trial) return;
      if (key === trial.correctKey && resolverRef.current) {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        resolve({ key, t: performance.now() });
      } else if (key !== trial.correctKey) {
        wrongCountRef.current += 1; // extra wrong press inside correction phase
      }
    }
    // phase "idle" (ITI): all input ignored
  }, []);

  useEffect(() => {
    const iti = IAT_TEST_DEFINITION.timing.interTrialIntervalMs;

    const keyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      let key: ResponseKey | null = null;
      if (e.code === `Key${block.leftKey}`) key = block.leftKey;
      else if (e.code === `Key${block.rightKey}`) key = block.rightKey;
      if (!key) return;
      e.preventDefault();
      respond(key);
    };
    window.addEventListener("keydown", keyHandler);

    const driver = async () => {
      for (let i = 0; i < trials.length; i++) {
        if (!runningRef.current) return;
        const trial = trials[i];
        setTrialNum(i + 1);
        setShowX(false);
        setDisplay(trial);
        await doubleRaf(); // ensure paint before measuring onset
        if (!runningRef.current) return;
        onsetRef.current = performance.now();
        currentTrialRef.current = trial;
        wrongCountRef.current = 0;
        phaseRef.current = "stimulus";

        const first = await new Promise<{ key: ResponseKey; t: number }>((resolve) => {
          resolverRef.current = resolve;
        });
        if (!runningRef.current) return;

        const rt = Math.max(0, Math.round(first.t - onsetRef.current));
        const correct = first.key === trial.correctKey;
        let correctionRt: number | null = null;
        let errorCount = 0;

        if (!correct) {
          errorCount = 1 + wrongCountRef.current;
          setShowX(true);
          phaseRef.current = "error";
          const corrected = await new Promise<{ key: ResponseKey; t: number }>((resolve) => {
            resolverRef.current = resolve;
          });
          if (!runningRef.current) return;
          correctionRt = Math.max(0, Math.round(corrected.t - onsetRef.current));
          setShowX(false);
        }

        phaseRef.current = "idle";
        recordsRef.current.push({
          blockNumber: trial.blockNumber,
          trialNumberInBlock: trial.trialNumberInBlock,
          globalTrialNumber: trial.globalTrialNumber,
          stimulusId: trial.stimulusId,
          responseKey: first.key,
          rt,
          correctionRt,
          errorCount,
          timestamp: Math.round(Date.now()),
        });

        // Inter-trial interval: blank, no stimulus
        setDisplay(null);
        await sleep(iti);
      }
      finish();
    };
    void driver();

    return () => {
      runningRef.current = false;
      window.removeEventListener("keydown", keyHandler);
      // unblock any pending await so the loop can exit
      resolverRef.current?.({ key: "E", t: 0 });
      resolverRef.current = null;
    };
  }, [trials, finish, respond, block.leftKey, block.rightKey]);

  const isWord = display ? display.stimulusType === "word" : false;
  // During the error phase, highlight the button the participant must press.
  const correctSide: "left" | "right" | null =
    showX && display ? (display.correctKey === block.leftKey ? "left" : "right") : null;

  const onButtonPointerDown = (key: ResponseKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault(); // no ghost clicks, no focus scroll, no text selection
    if (e.button !== undefined && e.button !== 0) return; // primary pointer only
    respond(key);
  };

  const buttonBase =
    "flex-1 min-h-[88px] md:min-h-[104px] rounded-2xl border-2 px-2 flex items-center justify-center text-center " +
    "font-bold text-base md:text-xl leading-6 bg-white text-neutral-900 border-neutral-800 " +
    "select-none touch-manipulation active:bg-neutral-200";

  return (
    <div className="fixed inset-0 z-50 bg-white experiment-mode flex flex-col" data-testid="trial-runner">
      {/* Category labels — physically pinned to screen sides (dir=ltr row) */}
      <div
        dir="ltr"
        className="absolute top-3 left-3 right-3 md:top-6 md:left-6 md:right-6 flex justify-between items-start pointer-events-none"
      >
        <span
          className={`px-2 py-1.5 md:px-4 md:py-2 rounded-lg border-2 bg-white font-semibold text-sm md:text-xl text-center max-w-[46%] ${
            correctSide === "left"
              ? "border-green-700 text-green-800 bg-green-50"
              : "border-neutral-800 text-neutral-900"
          }`}
          data-testid="left-label"
        >
          {block.leftLabel}
          {desktopKeys && (
            <span
              className="mx-1.5 inline-flex items-center justify-center rounded-md border-2 border-current bg-white px-1.5 py-0.5 align-middle font-mono text-base font-bold leading-none"
              dir="ltr"
            >
              {block.leftKey}
            </span>
          )}
        </span>
        <span
          className={`px-2 py-1.5 md:px-4 md:py-2 rounded-lg border-2 bg-white font-semibold text-sm md:text-xl text-center max-w-[46%] ${
            correctSide === "right"
              ? "border-green-700 text-green-800 bg-green-50"
              : "border-neutral-800 text-neutral-900"
          }`}
          data-testid="right-label"
        >
          {block.rightLabel}
          {desktopKeys && (
            <span
              className="mx-1.5 inline-flex items-center justify-center rounded-md border-2 border-current bg-white px-1.5 py-0.5 align-middle font-mono text-base font-bold leading-none"
              dir="ltr"
            >
              {block.rightKey}
            </span>
          )}
        </span>
      </div>

      {/* Stimulus area — fixed height, no layout shift */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-14 md:pt-20">
        <div className="h-[34vh] min-h-[180px] max-h-[440px] w-full max-w-xl flex items-center justify-center">
          {display ? (
            isWord ? (
              <span
                className="text-4xl md:text-6xl font-bold text-neutral-900"
                data-testid="word-stimulus"
              >
                {display.stimulusPath}
              </span>
            ) : (
              <img
                src={display.stimulusPath}
                alt=""
                className="max-h-[min(34vh,440px)] max-w-full object-contain"
                draggable={false}
                data-testid="image-stimulus"
              />
            )
          ) : (
            <span className="text-neutral-200 text-4xl" aria-hidden>
              +
            </span>
          )}
        </div>

        {/* Error feedback slot — fixed height, appears below stimulus */}
        <div
          className="h-28 flex flex-col items-center justify-center gap-1"
          data-testid="feedback-slot"
        >
          {showX ? (
            <>
              <span className="text-6xl md:text-7xl font-bold text-red-600 leading-none" data-testid="error-x">
                ✕
              </span>
              <span className="text-sm md:text-base font-medium text-red-700">
                {desktopKeys ? "کلید سبزرنگ را فشار دهید" : "دکمهٔ سبزرنگ را فشار دهید"}
              </span>
            </>
          ) : null}
        </div>

        {/* Progress */}
        <div className="text-center text-neutral-400 text-xs md:text-sm" data-testid="progress" dir="ltr">
          {toFa(trialNum)} / {toFa(block.trialCount)}
        </div>
      </div>

      {/* On-screen response buttons — primary input (touch-first, works with
          mouse/pen too). Keyboard E/I remains silently supported. */}
      <div
        dir="ltr"
        className="w-full max-w-2xl mx-auto flex gap-2 md:gap-5 px-2 md:px-4 pt-1"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        data-testid="response-buttons"
      >
        <button
          type="button"
          aria-label={`پاسخ سمت چپ: ${block.leftLabel}`}
          onPointerDown={onButtonPointerDown(block.leftKey)}
          onContextMenu={(e) => e.preventDefault()}
          className={`${buttonBase} ${
            correctSide === "left"
              ? "!border-green-700 !bg-green-50 text-green-900 ring-4 ring-green-600 ring-inset"
              : correctSide === "right"
                ? "opacity-40"
                : ""
          }`}
          data-testid="left-button"
        >
          {desktopKeys ? (
            <span className="font-mono text-3xl md:text-4xl font-bold tracking-widest" dir="ltr">
              {block.leftKey}
            </span>
          ) : (
            block.leftLabel
          )}
        </button>
        <button
          type="button"
          aria-label={`پاسخ سمت راست: ${block.rightLabel}`}
          onPointerDown={onButtonPointerDown(block.rightKey)}
          onContextMenu={(e) => e.preventDefault()}
          className={`${buttonBase} ${
            correctSide === "right"
              ? "!border-green-700 !bg-green-50 text-green-900 ring-4 ring-green-600 ring-inset"
              : correctSide === "left"
                ? "opacity-40"
                : ""
          }`}
          data-testid="right-button"
        >
          {desktopKeys ? (
            <span className="font-mono text-3xl md:text-4xl font-bold tracking-widest" dir="ltr">
              {block.rightKey}
            </span>
          ) : (
            block.rightLabel
          )}
        </button>
      </div>
    </div>
  );
}
