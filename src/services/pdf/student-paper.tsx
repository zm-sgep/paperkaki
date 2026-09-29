import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { QuestionContent } from "@/schemas/question-content";
import { A4_HEIGHT, BlockList, InlineRun, MM, colors, marksLabel, pdfText, styles } from "./primitives";
import type { PdfImage, RenderOptions, StudentPaper, StudentQuestion, StudentSection, WorkingSpace } from "./types";

/** Fixed so identical input gives identical bytes. */
export const DEFAULT_CREATION_DATE = new Date("2026-01-01T00:00:00.000Z");

const WORKING_SPACE_MM: Record<WorkingSpace, number> = { none: 0, small: 15, medium: 30, large: 55 };
const OPTION_LABELS = ["(1)", "(2)", "(3)", "(4)"] as const;

/** Keys that must never appear on student-facing data, even if a caller bypasses the types. */
const FORBIDDEN_KEYS = [
  "answer",
  "answers",
  "correct",
  "workedSolution",
  "solution",
  "verification",
  "markingScheme",
  "primaryOutcomeCode",
  "secondaryOutcomeCodes",
  "topicLabel",
] as const;

export class AnswerLeakError extends Error {
  constructor(where: string, key: string) {
    super(`Student paper data must not contain "${key}" (${where})`);
    this.name = "AnswerLeakError";
  }
}

function assertNoAnswerFields(paper: StudentPaper): void {
  const check = (where: string, obj: object) => {
    for (const key of FORBIDDEN_KEYS) {
      if (key in obj) throw new AnswerLeakError(where, key);
    }
  };
  check("paper", paper);
  for (const section of paper.sections) {
    check(`section "${section.title}"`, section);
    for (const q of section.questions) {
      check(`question ${q.number}`, q);
      check(`question ${q.number} content`, q.content);
    }
  }
}

function Options({ content }: { content: QuestionContent }): ReactElement | null {
  if (!content.options) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
      {content.options.map((option, idx) => (
        <View key={option.id} style={{ flexDirection: "row", width: "50%", marginBottom: 4, paddingRight: 8 }}>
          <Text style={{ width: 24 }}>{OPTION_LABELS[idx] ?? `(${idx + 1})`}</Text>
          <View style={{ flex: 1 }}>
            <InlineRun inlines={option.c} style={{ marginBottom: 0 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Question({
  question,
  images,
}: {
  question: StudentQuestion;
  images: RenderOptions["images"];
}): ReactElement {
  const isMcq = question.content.options !== undefined;
  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={[styles.bold, { width: 26 }]}>{`${question.number}.`}</Text>
        <View style={{ flex: 1 }}>
          <BlockList blocks={question.content.stem} images={images} />
          <Options content={question.content} />
          {isMcq ? null : (
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
              <Text>Ans: </Text>
              <View style={{ width: 120, borderBottomWidth: 0.8, borderBottomColor: colors.ink, borderBottomStyle: "solid" }} />
            </View>
          )}
        </View>
        <View style={{ width: 62, alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 10 }}>{marksLabel(question.marks)}</Text>
          {isMcq ? (
            <View style={{ width: 34, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12 }}>(</Text>
              <Text style={{ fontSize: 12 }}>)</Text>
            </View>
          ) : null}
        </View>
      </View>
      {question.workingSpace !== "none" ? (
        <View style={{ height: WORKING_SPACE_MM[question.workingSpace] * MM }} />
      ) : null}
    </View>
  );
}

function SectionHeading({ section }: { section: StudentSection }): ReactElement {
  return (
    <View style={{ marginTop: 6, marginBottom: 8 }}>
      <Text style={[styles.bold, { fontSize: 13, borderBottomWidth: 0.8, borderBottomColor: colors.ink, borderBottomStyle: "solid", paddingBottom: 2 }]}>
        {pdfText(section.title)}
      </Text>
      {section.instructions ? (
        <Text style={{ fontSize: 10, marginTop: 3, color: colors.muted }}>{pdfText(section.instructions)}</Text>
      ) : null}
    </View>
  );
}

function FillLine({ label, flex }: { label: string; flex: number }): ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", flex, marginRight: 14 }}>
      <Text>{`${label}: `}</Text>
      <View style={{ flex: 1, borderBottomWidth: 0.8, borderBottomColor: colors.ink, borderBottomStyle: "solid" }} />
    </View>
  );
}

type BookletInfo = { name: string; marks: number };

function Header({ paper, booklet }: { paper: StudentPaper; booklet?: BookletInfo }): ReactElement {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 8, color: colors.muted }}>PaperKaki</Text>
      <Text style={[styles.bold, { fontSize: 20, marginTop: 4, lineHeight: 1.2 }]}>{pdfText(paper.title)}</Text>
      <Text style={{ fontSize: 12, marginTop: 2 }}>{`${pdfText(paper.levelLabel)} · ${pdfText(paper.subjectLabel)}`}</Text>
      {booklet ? (
        <Text style={[styles.bold, { fontSize: 16, marginTop: 8 }]}>{pdfText(booklet.name)}</Text>
      ) : null}
      <Text style={{ fontSize: 11, marginTop: booklet ? 3 : 6 }}>
        {booklet
          ? `Duration: ${paper.durationMinutes} minutes (whole paper)   Total: ${booklet.marks} marks (this booklet)`
          : `Duration: ${paper.durationMinutes} minutes   Total: ${paper.totalMarks} marks`}
      </Text>
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <FillLine label="Name" flex={3} />
        <FillLine label="Class" flex={1.4} />
        <FillLine label="Date" flex={1.6} />
      </View>
      {paper.instructions.length > 0 ? (
        <View style={{ marginTop: 12, paddingTop: 6, borderTopWidth: 0.8, borderTopColor: colors.ink, borderTopStyle: "solid" }}>
          <Text style={[styles.bold, { fontSize: 11, marginBottom: 3 }]}>Instructions</Text>
          {paper.instructions.map((line, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={{ width: 16, fontSize: 10 }}>{`${i + 1}.`}</Text>
              <Text style={{ flex: 1, fontSize: 10 }}>{pdfText(line)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Consecutive sections of the same booklet, in paper order. A paper with no booklets is one group. */
function groupByBooklet(sections: readonly StudentSection[]): { booklet: string | undefined; sections: StudentSection[] }[] {
  const groups: { booklet: string | undefined; sections: StudentSection[] }[] = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if (last && last.booklet === section.booklet) last.sections.push(section);
    else groups.push({ booklet: section.booklet, sections: [section] });
  }
  return groups;
}

const marksOfSections = (sections: readonly StudentSection[]): number =>
  sections.reduce((total, section) => total + section.questions.reduce((sum, q) => sum + q.marks, 0), 0);

/** One page run: the header, then the sections. With booklets, each booklet starts its own run on a new page. */
function PaperPages({
  paper,
  sections,
  booklet,
  images,
}: {
  paper: StudentPaper;
  sections: StudentSection[];
  booklet?: BookletInfo;
  images: RenderOptions["images"];
}): ReactElement {
  return (
    <Page size="A4" style={[styles.body, { paddingTop: 20 * MM, paddingBottom: 22 * MM, paddingHorizontal: 20 * MM }]}>
      <Header paper={paper} {...(booklet ? { booklet } : {})} />
      {sections.map((section, s) => {
        const [first, ...rest] = section.questions;
        return (
          <View key={s}>
            {/* Keep the heading with its first question so it is never stranded at a page bottom. */}
            <View wrap={false}>
              <SectionHeading section={section} />
              {first ? <Question question={first} images={images} /> : null}
            </View>
            {rest.map((q) => (
              <Question key={q.number} question={q} images={images} />
            ))}
          </View>
        );
      })}
      {/* Page numbers run through the whole paper, booklet after booklet. */}
      <Text
        fixed
        style={{ position: "absolute", top: A4_HEIGHT - 13 * MM, left: 20 * MM, right: 20 * MM, textAlign: "center", fontSize: 9, color: colors.muted }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </Page>
  );
}

export function StudentPaperDocument({ paper, options = {} }: { paper: StudentPaper; options?: RenderOptions }): ReactElement {
  const { images, creationDate = DEFAULT_CREATION_DATE } = options;
  return (
    <Document
      title={paper.title}
      author="PaperKaki"
      creator="PaperKaki"
      producer="PaperKaki"
      creationDate={creationDate}
      modificationDate={creationDate}
      language="en-SG"
    >
      {groupByBooklet(paper.sections).map((group, g) => (
        <PaperPages
          key={g}
          paper={paper}
          sections={group.sections}
          images={images}
          {...(group.booklet === undefined ? {} : { booklet: { name: group.booklet, marks: marksOfSections(group.sections) } })}
        />
      ))}
    </Document>
  );
}

export type { PdfImage };

/** Render the student paper. Contains no answers, solutions or outcome data. */
export async function renderStudentPaperPdf(paper: StudentPaper, options: RenderOptions = {}): Promise<Buffer> {
  assertNoAnswerFields(paper);
  return renderToBuffer(<StudentPaperDocument paper={paper} options={options} />);
}
