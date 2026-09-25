// =============================================================================
// Block plan builder — implements the LOCKED 7-block IAT structure with
// explicit counterbalancing (condition A / B).
//
// Procedure source of truth:
//   Greenwald, Nosek & Banaji (2003), Table 1 (20/20/20/40/40/20/40);
//   Nosek, Greenwald & Banaji (2007) "The IAT at Age 7";
//   standard Inquisit IAT layout (also followed by the reference implementation
//   ianhussey/ImplicitAssociationTest).
//
// Response-mapping rules (verified against Inquisit/jsPsych reference behavior):
//   - Attribute categories keep the same response key in ALL combined blocks
//     (Positive -> E/left, Negative -> I/right for both conditions).
//   - Target categories swap sides at Block 5 and keep those sides through
//     blocks 6-7; therefore the target-attribute pairing is reversed.
//   - Condition A vs B differs in the initial target side assignment:
//       A: Block1 Iranian=E  => blocks 3-4 pair Iranian+Positive
//       B: Block1 Afghan=E   => blocks 3-4 pair Afghan+Positive (i.e. Iranian+Negative)
// =============================================================================

import { IAT_TEST_DEFINITION, describeBlockOrder } from "@/config/iat/test-definition";
import type {
  BlockPlanEntry,
  CategoryDefinition,
  ConditionOrder,
  TestDefinition,
} from "@/lib/iat/types";

function cat(def: TestDefinition, key: string): CategoryDefinition {
  const all = [...def.targets, ...def.attributes];
  const c = all.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown category key in test definition: ${key}`);
  return c;
}

function targetKeys(def: TestDefinition): [string, string] {
  return [def.targets[0].key, def.targets[1].key];
}

function attributeKeys(def: TestDefinition): [string, string] {
  return [def.attributes[0].key, def.attributes[1].key];
}

/** Build the per-session block plan for a given counterbalancing condition. */
export function buildBlockPlan(
  conditionOrder: ConditionOrder,
  def: TestDefinition = IAT_TEST_DEFINITION,
): BlockPlanEntry[] {
  const [targetA, targetB] = targetKeys(def); // e.g. iranian, afghan
  const [attrPos, attrNeg] = attributeKeys(def); // positive, negative

  const catA = cat(def, targetA);
  const catB = cat(def, targetB);
  const catPos = cat(def, attrPos);
  const catNeg = cat(def, attrNeg);

  // Condition determines the TARGET side in blocks 1, 3, 4 (and reversed after 5).
  // Attributes never move: positive stays on E (left), negative on I (right).
  const firstTargetLeft = conditionOrder === "A" ? catA : catB;
  const firstTargetRight = conditionOrder === "A" ? catB : catA;

  const entries: BlockPlanEntry[] = [];

  for (const block of def.blocks) {
    let leftCategories: string[];
    let rightCategories: string[];
    let leftLabel: string;
    let rightLabel: string;
    let targetCategory = "";
    let attributeCategory = "";
    let instructionTitle = "";
    let instructionBody = "";

    switch (block.kind) {
      case "target-discrimination": {
        leftCategories = [firstTargetLeft.key];
        rightCategories = [firstTargetRight.key];
        leftLabel = firstTargetLeft.label;
        rightLabel = firstTargetRight.label;
        targetCategory = firstTargetLeft.key;
        instructionTitle = "طبقه‌بندی هدف‌ها";
        instructionBody =
          `در این بخش تصویرهایی از دو گروه نمایش داده می‌شود.\n` +
          `اگر تصویر متعلق به گروه «${leftLabel}» بود، دکمهٔ سمت چپ را بزنید؛ اگر متعلق به گروه «${rightLabel}» بود، دکمهٔ سمت راست را بزنید.\n` +
          `نام هر گروه بالای صفحه مشخص است؛ روی رایانه با کلیدهای E و I و روی گوشی با دکمه‌های پایین صفحه پاسخ دهید. تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.`;
        break;
      }
      case "attribute-discrimination": {
        leftCategories = [catPos.key];
        rightCategories = [catNeg.key];
        leftLabel = catPos.label;
        rightLabel = catNeg.label;
        attributeCategory = catPos.key;
        instructionTitle = "طبقه‌بندی واژه‌ها";
        instructionBody =
          `در این بخش واژه‌هایی نمایش داده می‌شود.\n` +
          `اگر واژه معنای «${leftLabel}» داشت، دکمهٔ سمت چپ را بزنید و اگر معنای «${rightLabel}» داشت، دکمهٔ سمت راست را بزنید.\n` +
          `نام هر گروه بالای صفحه مشخص است؛ روی رایانه با کلیدهای E و I و روی گوشی با دکمه‌های پایین صفحه پاسخ دهید. تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.`;
        break;
      }
      case "combined": {
        leftCategories = [firstTargetLeft.key, catPos.key];
        rightCategories = [firstTargetRight.key, catNeg.key];
        leftLabel = `${firstTargetLeft.label} یا ${catPos.label}`;
        rightLabel = `${firstTargetRight.label} یا ${catNeg.label}`;
        targetCategory = firstTargetLeft.key;
        attributeCategory = catPos.key;
        instructionTitle = "وظیفه ترکیبی";
        instructionBody =
          `حالا دو وظیفهٔ قبلی با هم ترکیب می‌شوند.\n` +
          `اگر تصویر متعلق به «${firstTargetLeft.label}» یا واژه‌ای با معنای «${catPos.label}» بود، دکمهٔ سمت چپ را بزنید.\n` +
          `اگر تصویر متعلق به «${firstTargetRight.label}» یا واژه‌ای با معنای «${catNeg.label}» بود، دکمهٔ سمت راست را بزنید.\n` +
          `نام هر گروه بالای صفحه مشخص است؛ روی رایانه با کلیدهای E و I و روی گوشی با دکمه‌های پایین صفحه پاسخ دهید. تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.`;
        break;
      }
      case "target-discrimination-reversed": {
        leftCategories = [firstTargetRight.key];
        rightCategories = [firstTargetLeft.key];
        leftLabel = firstTargetRight.label;
        rightLabel = firstTargetLeft.label;
        targetCategory = firstTargetRight.key;
        instructionTitle = "طبقه‌بندی هدف‌ها (جای‌گروه‌ها عوض شده است)";
        instructionBody =
          `توجه: از این بخش، جای دو گروه عوض شده است.\n` +
          `اگر تصویر متعلق به گروه «${leftLabel}» بود، دکمهٔ سمت چپ را بزنید؛ اگر متعلق به گروه «${rightLabel}» بود، دکمهٔ سمت راست را بزنید.\n` +
          `قبل از شروع، نام گروه‌ها را بالای صفحه بررسی کنید؛ روی رایانه با کلیدهای E و I و روی گوشی با دکمه‌های پایین صفحه پاسخ دهید. تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.`;
        break;
      }
      case "combined-reversed": {
        leftCategories = [firstTargetRight.key, catPos.key];
        rightCategories = [firstTargetLeft.key, catNeg.key];
        leftLabel = `${firstTargetRight.label} یا ${catPos.label}`;
        rightLabel = `${firstTargetLeft.label} یا ${catNeg.label}`;
        targetCategory = firstTargetRight.key;
        attributeCategory = catPos.key;
        instructionTitle = "وظیفه ترکیبی (جای‌گروه‌ها عوض شده است)";
        instructionBody =
          `توجه: از این بخش، جای گروه‌های تصویری عوض شده است.\n` +
          `اگر تصویر متعلق به «${firstTargetRight.label}» یا واژه‌ای با معنای «${catPos.label}» بود، دکمهٔ سمت چپ را بزنید.\n` +
          `اگر تصویر متعلق به «${firstTargetLeft.label}» یا واژه‌ای با معنای «${catNeg.label}» بود، دکمهٔ سمت راست را بزنید.\n` +
          `قبل از شروع، نام گروه‌ها را بالای صفحه بررسی کنید؛ روی رایانه با کلیدهای E و I و روی گوشی با دکمه‌های پایین صفحه پاسخ دهید. تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.`;
        break;
      }
      default: {
        const exhaustive: never = block.kind;
        throw new Error(`Unhandled block kind: ${exhaustive}`);
      }
    }

    entries.push({
      number: block.number,
      kind: block.kind,
      trialCount: block.trialCount,
      isCritical: block.isCritical,
      leftCategories,
      rightCategories,
      leftLabel,
      rightLabel,
      leftKey: def.responseKeys.left,
      rightKey: def.responseKeys.right,
      targetCategory,
      attributeCategory,
      instructionTitle,
      instructionBody,
    });
  }

  return entries;
}

/** Canonical block-order description stored on the session row. */
export function blockOrderString(def: TestDefinition = IAT_TEST_DEFINITION): string {
  return describeBlockOrder(def);
}
