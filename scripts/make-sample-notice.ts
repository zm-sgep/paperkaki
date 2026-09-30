import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";

// @react-pdf/renderer only resolves as an ES module, and tsx runs this file as CommonJS, so it is
// loaded with a dynamic import() in main() and shared through these bindings.
type ReactPdf = typeof import("@react-pdf/renderer");
let Document!: ReactPdf["Document"];
let Page!: ReactPdf["Page"];
let Text!: ReactPdf["Text"];
let View!: ReactPdf["View"];
let styles!: ReturnType<typeof makeStyles>;
type TextStyle = NonNullable<import("react").ComponentProps<ReactPdf["Text"]>["style"]>;

/**
 * Makes the INVENTED sample school notice used by tests, browser tests and the extraction eval:
 * a Primary 3 end-of-year letter from the fictional "Example Primary School", with a timetable, rules
 * and a table of specifications, shaped like a real letter. Every name, number and date is made up.
 *
 * Run: npx tsx scripts/make-sample-notice.ts
 * Writes tests/fixtures/notices/p3-eoy-sample.pdf. Rendering is deterministic (fixed dates, built-in
 * font), so running it again gives the same bytes and the recorded answer in tests/fixtures/ai keeps
 * matching. A photo version is made by scripts/make-sample-notice-photo.py.
 */

const makeStyles = (StyleSheet: ReactPdf["StyleSheet"]) => StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.4 },
  crest: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  small: { fontSize: 9, color: "#444444" },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 6 },
  row: { flexDirection: "row" },
  table: { borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: "#000000", marginVertical: 6 },
  cell: { padding: 4, borderRightWidth: 0.8, borderBottomWidth: 0.8, borderColor: "#000000" },
  head: { fontFamily: "Helvetica-Bold", backgroundColor: "#eeeeee" },
  li: { flexDirection: "row", marginBottom: 2 },
  num: { width: 22 },
});

type Row3 = [string, string, string];

const TIMETABLE: Row3[] = [
  ["20 Oct (Tue)", "English Language", "0800 - 0945 (1h 45 min)"],
  ["22 Oct (Thu)", "Mother Tongue Language", "0800 - 0915 (1h 15 min)"],
  ["27 Oct (Tue)", "Mathematics", "0800 - 0930 (1h 30 min)"],
  ["29 Oct (Thu)", "Science", "0800 - 0940 (1h 40 min)"],
];

const RULES = [
  "Pupils must be in school uniform and report by 0745 on the day of each paper.",
  "Pupils should bring their own stationery. Sharing of stationery is not allowed.",
  "Pupils who are unwell should inform the school office on 6555 0100 before 0700.",
];

const MATHS_TOPICS = [
  "Numbers to 10 000",
  "Addition and Subtraction",
  "Money",
  "Multiplication Tables of 6, 7, 8 and 9",
  "Multiplication and Division",
  "More Word Problems",
  "Bar Graphs",
  "Angles",
  "Perpendicular and Parallel Lines",
  "Fractions",
  "Length, Mass and Volume",
  "Area and Perimeter",
  "Time",
];

const SCIENCE_TOPICS = ["Diversity of Living Things", "Plant Parts and Functions", "Matter", "Materials"];

const MATHS_FORMAT: Row3[] = [
  ["Section A", "6 Multiple-Choice questions", "12"],
  ["Section B", "16 Open-ended questions", "26"],
  ["Section C", "4 Word Problems", "12"],
];

const SCIENCE_FORMAT: Row3[] = [
  ["Booklet A", "18 Multiple-Choice questions", "36"],
  ["Booklet B", "8 - 9 Structured questions", "24"],
];

function table(head: string[], rows: string[][], widths: number[]): ReactElement {
  return h(
    View,
    { style: styles.table },
    [head, ...rows].map((cells, r) =>
      h(
        View,
        { key: r, style: styles.row },
        cells.map((text, c) => h(Text, { key: c, style: [styles.cell, r === 0 ? styles.head : {}, { width: `${widths[c] ?? 25}%` }] }, text)),
      ),
    ),
  );
}

function numbered(items: string[]): ReactElement {
  return h(
    View,
    null,
    items.map((item, i) => h(View, { key: item, style: styles.li }, h(Text, { style: styles.num }, `${i + 1}.`), h(Text, null, item))),
  );
}

const text = (style: TextStyle, content: string): ReactElement => h(Text, { style } as never, content);

function notice(): ReactElement {
  const fixed = new Date("2026-09-29T00:00:00Z");
  return h(
    Document,
    { title: "Primary 3 End-of-Year Examination 2026 (sample)", creationDate: fixed, modificationDate: fixed, producer: "PaperKaki sample", creator: "PaperKaki sample" },
    h(
      Page,
      { size: "A4", style: styles.page },
      text(styles.crest, "Example Primary School"),
      text(styles.small, "12 Sample Road, Singapore 000000 · Tel: 6555 0100 · This is an invented sample letter for software testing."),
      text([styles.p, { marginTop: 14 }], "29 September 2026"),
      text(styles.p, "Dear Parents/Guardians of Primary 3 Pupils,"),
      text(styles.h1, "PRIMARY 3 END-OF-YEAR EXAMINATION 2026"),
      text(
        styles.p,
        "The Primary 3 End-of-Year Examination will be held from 20 October to 29 October 2026. Please find the timetable, the rules and the table of specifications for each subject below. Kindly help your child to prepare well.",
      ),
      text(styles.h2, "1. Examination timetable"),
      table(["Date", "Subject", "Time (duration)"], TIMETABLE.map((r) => [...r]), [24, 38, 38]),
      text(styles.h2, "2. Rules and reminders"),
      numbered(RULES),
      text([styles.p, { marginTop: 14 }], "Thank you for your support."),
      text({}, "Mdm Lim Hui Min"),
      text(styles.small, "Year Head, Primary 3 (invented name)"),
    ),
    h(
      Page,
      { size: "A4", style: styles.page },
      text(styles.h1, "3. Table of specifications"),
      text(styles.h2, "Mathematics"),
      text(styles.p, "Topics tested:"),
      numbered(MATHS_TOPICS),
      text([styles.p, { marginTop: 6 }], "Protractors are not allowed during examination."),
      table(["Section", "Question type", "Marks"], [...MATHS_FORMAT.map((r) => [...r]), ["", "Total:", "50"]], [26, 48, 26]),
      text(styles.h2, "Science"),
      text(styles.p, "Topics tested:"),
      numbered(SCIENCE_TOPICS),
      table(["Booklet", "Question type", "Marks"], [...SCIENCE_FORMAT.map((r) => [...r]), ["", "Total:", "60"]], [26, 48, 26]),
      text(styles.small, "All information is subject to change. Example Primary School will inform parents in writing."),
    ),
  );
}

async function main(): Promise<void> {
  const pdf = await import("@react-pdf/renderer");
  ({ Document, Page, Text, View } = pdf);
  styles = makeStyles(pdf.StyleSheet);
  const outFile = path.resolve(process.cwd(), "tests/fixtures/notices/p3-eoy-sample.pdf");
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, await pdf.renderToBuffer(notice() as Parameters<typeof pdf.renderToBuffer>[0]));
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
}

void main();
