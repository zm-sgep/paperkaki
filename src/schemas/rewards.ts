import { z } from "zod";
import { isValidIsoDate } from "@/domain/assessments/dates";
import { REWARD_ICON_KEYS } from "@/domain/rewards/catalogue";
import { MASTERY_STATES, DIFFICULTIES, ACTIVITY_TYPES } from "@/domain/rewards/entities";

/** Highest cost or bonus a parent can enter: a typo guard, not a rule about what a reward is worth. */
export const MAX_REWARD_COST = 5000;
export const MAX_BONUS_POINTS = 500;

const number = z.number().finite();
const perActivity = z.object(Object.fromEntries(ACTIVITY_TYPES.map((key) => [key, number])) as Record<(typeof ACTIVITY_TYPES)[number], typeof number>);
const perState = z.object(Object.fromEntries(MASTERY_STATES.map((key) => [key, number])) as Record<(typeof MASTERY_STATES)[number], typeof number>);
const perDifficulty = z.object(Object.fromEntries(DIFFICULTIES.map((key) => [key, number])) as Record<(typeof DIFFICULTIES)[number], typeof number>);
const difficulty = z.enum(DIFFICULTIES);
const masteryState = z.enum(MASTERY_STATES);

/** The stored shape of a reward policy: what the database's `policy` column must hold to be usable. */
export const RewardPolicySchema = z.object({
  version: z.string().min(1),
  basePoints: perActivity,
  activityCap: perActivity,
  masteryNeedMultiplier: perState,
  difficultyMultiplier: perDifficulty,
  firstMeaningfulAttempt: number,
  repeatAttempt: number,
  accuracy: z.object({ minFactor: number, fullCreditAt: number }),
  improvement: z.object({ minGain: number, scale: number, bonusMax: number }),
  weakAreaRecovery: z.object({ weakStates: z.array(masteryState), minGain: number, minAccuracy: number, bonus: number }),
  varietyBonus: number,
  retention: z.object({ bonus: number, minAccuracy: number, needMultiplier: number }),
  stretch: z.object({ minDifficulty: difficulty, needMultiplier: number, minAccuracy: number }),
  mistakeReviewNeedMultiplier: number,
  masteryBonus: number,
  sameFamilyDecay: z.array(number),
  masteredTopicSessionDecay: z.array(number),
  masteredDifficultyFloor: z.object({ minDifficulty: difficulty, belowFloorMultiplier: number }),
  cooldown: z.object({ windowMinutes: number, multiplier: number }),
  lowEffortMultiplier: number,
  lowYieldNudgeAtMostPoints: number,
});

const Title = z
  .string({ error: "Give the reward a name." })
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, { error: "Give the reward a name." }).max(60, { error: "Use 60 letters or fewer." }));

const Optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null || value === undefined ? null : value), schema.nullable());

const WholeNumber = (empty: string, min: number, minMessage: string, max: number, maxMessage: string) =>
  z.coerce
    .number({ error: empty })
    .int({ error: "Enter a whole number." })
    .min(min, { error: minMessage })
    .max(max, { error: maxMessage });

const OptionalDate = Optional(z.string().refine(isValidIsoDate, { error: "Choose a real date." }));

export const RewardInputSchema = z
  .object({
    title: Title,
    description: Optional(z.string().transform((value) => value.trim()).pipe(z.string().max(200, { error: "Use 200 letters or fewer." }))),
    cost: WholeNumber("Enter how many points it costs.", 1, "It has to cost at least 1 point.", MAX_REWARD_COST, `Use ${MAX_REWARD_COST} points or fewer.`),
    icon: z.enum(REWARD_ICON_KEYS as [string, ...string[]], { error: "Pick one of the pictures." }).default("gift"),
    /** Empty means all of the parent's children. */
    childId: Optional(z.string().uuid({ error: "Choose a child." })),
    weeklyLimit: Optional(WholeNumber("Enter a whole number.", 1, "The limit has to be at least 1.", 50, "Use 50 or fewer.")),
    availableFrom: OptionalDate,
    availableUntil: OptionalDate,
  })
  .refine((value) => value.availableFrom === null || value.availableUntil === null || value.availableUntil >= value.availableFrom, {
    error: "The last day can't be before the first day.",
    path: ["availableUntil"],
  });
export type RewardInput = z.output<typeof RewardInputSchema>;

export const BonusInputSchema = z.object({
  points: WholeNumber("Enter how many points to give.", 1, "Give at least 1 point.", MAX_BONUS_POINTS, `Give ${MAX_BONUS_POINTS} points or fewer at once.`),
  reason: z
    .string({ error: "Say what the bonus is for." })
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, { error: "Say what the bonus is for." }).max(120, { error: "Use 120 letters or fewer." })),
});
export type BonusInput = z.output<typeof BonusInputSchema>;
