import { buildAssessmentPlan } from "@/application/assessment-plan";
import {
  allowedTotalMarks,
  assessmentStateText,
  contextLine,
  countdownText,
  formatAssessmentDate,
  formatChoiceTitle,
  formatKindsText,
  futureFormatLabel,
  todayInSingapore,
  type FormatSection,
  type PaperSettings,
} from "@/domain/assessments";
import type { Database } from "@/repositories/postgres/client";
import {
  getOwnedAssessment,
  listAssessmentsForParent,
  listScopeItems,
  listTopicsInVersion,
  type OwnedAssessment,
} from "@/repositories/postgres/assessments";
import { getReadyDb } from "@/repositories/postgres/ready";
import { listPapersForAssessments } from "@/repositories/postgres/papers";
import { listCandidateQuestions } from "./questions";

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

async function readableAssessment(db: Database, parentProfileId: string, assessmentId: string): Promise<OwnedAssessment | null> {
  const assessment = await getOwnedAssessment(db, parentProfileId, assessmentId);
  return assessment && !assessment.childArchived ? assessment : null;
}

export type AssessmentHeader = {
  id: string;
  name: string;
  subject: string;
  childNickname: string;
  date: string;
  dateText: string;
  countdown: string;
  scopeConfirmed: boolean;
  /** "Darius · Mathematics WA2 · Tue 14 Oct", shown on every setup step. */
  contextLine: string;
};

function headerOf(assessment: OwnedAssessment, today: string): AssessmentHeader {
  const dateText = formatAssessmentDate(assessment.date, today);
  return {
    id: assessment.id,
    name: assessment.name,
    subject: assessment.subject,
    childNickname: assessment.childNickname,
    date: assessment.date,
    dateText,
    countdown: countdownText(assessment.date, today),
    scopeConfirmed: assessment.status === "scope_confirmed",
    contextLine: contextLine({ childNickname: assessment.childNickname, subject: assessment.subject, name: assessment.name, dateText }),
  };
}

export type ScopeTopicChoice = {
  id: string;
  /** The parent's wording. */
  label: string;
  selected: boolean;
  /** False when the question bank has nothing for this topic yet. It stays selectable. */
  hasQuestions: boolean;
};

export type ScopeSetup = { assessment: AssessmentHeader; topics: ScopeTopicChoice[] };

/** Everything the topic checklist needs, for one assessment of this parent. Null when it is not theirs. */
export async function getScopeSetup(parentProfileId: string, assessmentId: string, context: Context = {}): Promise<ScopeSetup | null> {
  const db = await resolveDb(context);
  const assessment = await readableAssessment(db, parentProfileId, assessmentId);
  if (!assessment) return null;
  const [topics, scope] = await Promise.all([
    listTopicsInVersion(db, assessment.curriculumVersionId, assessment.level),
    listScopeItems(db, assessment.id),
  ]);
  const candidates = await listCandidateQuestions(
    {
      curriculumVersionId: assessment.curriculumVersionId,
      outcomeIds: topics.flatMap((topic) => topic.outcomeIds),
      level: assessment.level,
      subject: assessment.subject,
    },
    { db },
  );
  const covered = new Set(candidates.map((candidate) => candidate.topicId));
  const selected = new Set(scope.map((item) => item.topicId));
  return {
    assessment: headerOf(assessment, todayInSingapore(context.now)),
    topics: topics.map((topic) => ({
      id: topic.topicId,
      label: topic.label,
      selected: selected.has(topic.topicId),
      hasQuestions: covered.has(topic.topicId),
    })),
  };
}

export type PaperFormatChoiceView = {
  /** "standard", "p3_end_of_year_common", "p3_weighted_common" or "saved". Never shown to the parent. */
  id: string;
  /** "Common Primary 3 end-of-year format (Sections A, B, C · 50 marks · 1 h 30 min)" */
  title: string;
  /** "6 multiple choice · 16 short answer · 4 word problems" */
  hint: string;
  recommended: boolean;
};

/** What the "Paper format" choice on the Customise paper panel needs. */
export type PaperFormatSetup = {
  choices: PaperFormatChoiceView[];
  /** The choice in force, or "custom" when the parent matched their school's paper. */
  selected: string;
  /** The parts and time in force: where "Match my school's paper" starts from. */
  current: { durationMinutes: number; parts: FormatSection[] };
  /** "Use this format for Darius's future WA2 papers" */
  futureLabel: string;
  /** True for the standard mock, whose marks and time the parent can change directly. */
  marksAndTimeEditable: boolean;
};

export type AssessmentSetup = {
  assessment: AssessmentHeader;
  /** "40 marks · 45 min · Sections A, B": the paper format in one line. */
  summary: string;
  /** "Fractions, Time, Measurement": the topics the mock covers, shown below the summary. */
  topicsLine: string;
  /** Names of the topics left out because the bank has no questions for them yet. */
  excludedNotice: string | null;
  /** For a later mock: "Mock 2 will focus a little more on Length and Time, and still cover every topic." Null otherwise. */
  focusLine: string | null;
  /** Hard problems in plain words; the mock cannot be created while any remain. */
  problems: string[];
  notices: string[];
  canGenerate: boolean;
  settings: PaperSettings;
  recommended: PaperSettings;
  usingRecommended: boolean;
  paperFormat: PaperFormatSetup;
  markOptions: number[];
  /** How many questions the preview picked, when it could. Never shown as internal detail. */
  preview: { questionCount: number; totalMarks: number } | null;
  /** Questions available per covered topic. For checks, not for display. */
  inventory: { topicId: string; label: string; questionCount: number }[];
  chosenTopics: { id: string; label: string }[];
  /** Mocks already made for this assessment, newest first. Empty until the first one exists. */
  mocks: MockSummary[];
};

export type MockSummary = {
  id: string;
  number: number;
  /** "Created Tue 14 Oct" */
  createdText: string;
  href: string;
};

/** Everything the "Your mock is ready to create" screen needs. Null when the assessment is not this parent's. */
export async function getAssessmentSetup(
  parentProfileId: string,
  assessmentId: string,
  context: Context = {},
): Promise<AssessmentSetup | null> {
  const db = await resolveDb(context);
  const assessment = await readableAssessment(db, parentProfileId, assessmentId);
  if (!assessment) return null;
  const plan = await buildAssessmentPlan(db, assessment, context.now ? { now: context.now } : {});
  const selection = plan.selection?.ok ? plan.selection : null;
  const today = todayInSingapore(context.now);
  const mocks = (await listPapersForAssessments(db, [assessment.id]))
    .filter((paper) => paper.status === "generated")
    .sort((a, b) => b.number - a.number)
    .map(
      (paper): MockSummary => ({
        id: paper.id,
        number: paper.number,
        createdText: `Created ${formatAssessmentDate(todayInSingapore(paper.createdAt), today)}`,
        href: `/prepare/${assessment.id}/mocks/${paper.id}`,
      }),
    );
  return {
    assessment: headerOf(assessment, today),
    summary: plan.summary,
    topicsLine: plan.topicsLine,
    excludedNotice: plan.excludedNotice,
    focusLine: plan.focusLine,
    problems: plan.problems,
    notices: plan.notices,
    canGenerate: plan.canGenerate && assessment.status === "scope_confirmed",
    settings: plan.settings,
    recommended: plan.recommended,
    usingRecommended: plan.storedSettingsSource === "recommended",
    paperFormat: {
      choices: plan.formatChoices.map((choice) => ({
        id: choice.id,
        title: formatChoiceTitle(choice.id, choice.format),
        hint: formatKindsText(choice.format),
        recommended: choice.recommended,
      })),
      selected: plan.selectedChoice,
      current: { durationMinutes: plan.format.durationMinutes, parts: plan.format.sections.map((section) => ({ ...section })) },
      futureLabel: futureFormatLabel(assessment.childNickname, assessment.assessmentType, assessment.name),
      marksAndTimeEditable: plan.selectedChoice === "standard",
    },
    markOptions: allowedTotalMarks(),
    preview: selection ? { questionCount: selection.selection.length, totalMarks: selection.report.totalMarks } : null,
    inventory: plan.inventory,
    chosenTopics: plan.chosen.map((topic) => ({ id: topic.topicId, label: topic.label })),
    mocks,
  };
}

export type AssessmentCard = AssessmentHeader & {
  stateText: string;
  actionLabel: string;
  actionHref: string;
  past: boolean;
};

export type PrepareOverview = { upcoming: AssessmentCard[]; past: AssessmentCard[] };

/** Cards for one child's assessments: upcoming first (soonest first), past ones separate. */
export async function getPrepareOverview(
  parentProfileId: string,
  childId: string,
  context: Context = {},
): Promise<PrepareOverview> {
  const db = await resolveDb(context);
  const today = todayInSingapore(context.now);
  const rows = await listAssessmentsForParent(db, parentProfileId, childId);
  const papers = await listPapersForAssessments(db, rows.map((row) => row.id));
  const cards = rows.map((row): AssessmentCard => {
      const header = headerOf(row, today);
      const latest = papers.find((paper) => paper.assessmentId === row.id && paper.status === "generated");
      if (header.scopeConfirmed && latest) {
        return {
          ...header,
          stateText: `Mock ${latest.number} is ready`,
          actionLabel: "Print mock",
          actionHref: `/prepare/${row.id}/mocks/${latest.id}`,
          past: row.date < today,
        };
      }
      return {
        ...header,
        stateText: assessmentStateText(header.scopeConfirmed),
        actionLabel: header.scopeConfirmed ? "Generate first mock" : "Choose topics",
        actionHref: header.scopeConfirmed ? `/prepare/${row.id}` : `/prepare/${row.id}/scope`,
        past: row.date < today,
      };
    });
  const byDate = (a: AssessmentCard, b: AssessmentCard) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return {
    upcoming: cards.filter((card) => !card.past).sort(byDate),
    past: cards.filter((card) => card.past).sort((a, b) => byDate(b, a)),
  };
}

