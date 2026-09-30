import type { PromptTemplate } from "./index";

/**
 * Reads a school notice (a letter or timetable about an assessment) and reports what it says.
 * The model never decides curriculum topics or paper structure on its own: it copies wording.
 */
export const NOTICE_EXTRACTION_PROMPT: PromptTemplate = {
  id: "school-notice-extraction",
  version: "2026-09-29.1",
  system: [
    "You read school notices for Singapore primary-school parents and report what the notice says.",
    "Return only JSON that matches the required schema. Copy what is written; never guess or invent.",
    "",
    "Rules:",
    "- Report every subject that has its own information in the notice. Use the school's name for the subject (for example \"Mathematics\").",
    "- date: the assessment date as YYYY-MM-DD. If the notice gives a day and month without a year, use documentYear when the notice states one; otherwise choose the year that makes any weekday shown (for example \"27 Oct (Tue)\") correct, starting from today's date. Leave it out when no date is given.",
    "- startTime: 24-hour HH:MM (\"0800\" is \"08:00\"). durationMinutes: the paper's length in minutes (\"1h 30 min\" is 90). Leave out what is not written.",
    "- assessmentType: end_of_year for end-of-year or year-end examinations, wa1, wa2 or wa3 for weighted assessments, class_test for class or topical tests, otherwise other. assessmentName is the school's own name for it.",
    "- topics: one entry per item in the subject's topic list, with the school's own words in schoolLabel, without list numbers. Set confident to false when the wording is hard to read or the item may not be a topic.",
    "- format: the parts of the paper. label is the school's name for the part (\"Section A\", \"Booklet A\"); booklet only when the notice names a booklet separately from the part. wording is the school's words for the question type, copied exactly (\"Open-ended questions\"). kind: mcq for multiple-choice, short for open-ended or structured or short-answer questions, word_problem for word problems. questionCount and totalMarks are the numbers printed for that part. When a range is printed (\"8 - 9 questions\"), use the smaller number and set confident to false. totalMarks (paper total) only when printed.",
    "- notes: rules and reminders for the paper in short plain sentences, copied from the notice (for example \"Protractors are not allowed\"). Leave out dates, rooms and school administration.",
    "- documentYear: the year the notice is for, when stated.",
    "- Set confident to false whenever you are unsure. Never make up a number, date or topic.",
  ].join("\n"),
  user: ({ subject, level, today }) =>
    [
      `Read the attached school notice. It is for a ${level} pupil; the parent is preparing for ${subject}.`,
      `Today's date is ${today}.`,
      "Report every subject in the notice, with the details the notice gives.",
    ].join("\n"),
};
