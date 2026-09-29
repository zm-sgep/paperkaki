import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { DEFAULT_CREATION_DATE } from "./student-paper";
import { A4_HEIGHT, BlockList, InlineRun, MM, colors, marksLabel, pdfText, styles } from "./primitives";
import type { AnswerPack, AnswerPackQuestion, RenderOptions } from "./types";

function AnswerQuestion({ question, images }: { question: AnswerPackQuestion; images: RenderOptions["images"] }): ReactElement {
  return (
    <View
      wrap={false}
      style={{ marginBottom: 10, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: colors.faint, borderBottomStyle: "solid" }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text style={[styles.bold, { fontSize: 12 }]}>{`${question.number}.`}</Text>
        <Text style={{ fontSize: 10 }}>{marksLabel(question.marks)}</Text>
      </View>
      <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 3 }}>{`Topic: ${pdfText(question.topicLabel)}`}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 3 }}>
        <Text style={[styles.bold, { marginRight: 4 }]}>Answer:</Text>
        <View style={{ flex: 1 }}>
          <InlineRun inlines={question.answer} bold style={{ marginBottom: 0 }} />
        </View>
      </View>
      <Text style={[styles.bold, { fontSize: 10, marginBottom: 2 }]}>Worked solution</Text>
      <BlockList blocks={question.workedSolution} images={images} />
    </View>
  );
}

export function AnswerPackDocument({ pack, options = {} }: { pack: AnswerPack; options?: RenderOptions }): ReactElement {
  const { images, creationDate = DEFAULT_CREATION_DATE } = options;
  return (
    <Document
      title={`${pack.title} · Answer pack`}
      author="PaperKaki"
      creator="PaperKaki"
      producer="PaperKaki"
      creationDate={creationDate}
      modificationDate={creationDate}
      language="en-SG"
    >
      <Page size="A4" style={[styles.body, { paddingTop: 20 * MM, paddingBottom: 22 * MM, paddingHorizontal: 20 * MM }]}>
        <View
          fixed
          style={{ position: "absolute", top: 8 * MM, left: 20 * MM, right: 20 * MM, flexDirection: "row", justifyContent: "space-between" }}
        >
          <Text style={{ fontSize: 8, color: colors.muted }}>PaperKaki</Text>
          <Text style={[styles.bold, { fontSize: 9 }]}>Answer pack · not for the child</Text>
        </View>
        <Text style={[styles.bold, { fontSize: 20, marginBottom: 10, lineHeight: 1.2 }]}>{pdfText(pack.title)}</Text>
        {pack.sections.map((section, s) => (
          <View key={s}>
            {section.booklet !== undefined && section.booklet !== pack.sections[s - 1]?.booklet ? (
              <Text minPresenceAhead={100} style={[styles.bold, { fontSize: 16, marginTop: 10, marginBottom: 4 }]}>
                {pdfText(section.booklet)}
              </Text>
            ) : null}
            <Text
              minPresenceAhead={80}
              style={[styles.bold, { fontSize: 13, marginTop: 6, marginBottom: 8, borderBottomWidth: 0.8, borderBottomColor: colors.ink, borderBottomStyle: "solid", paddingBottom: 2 }]}
            >
              {pdfText(section.title)}
            </Text>
            {section.questions.map((q) => (
              <AnswerQuestion key={q.number} question={q} images={images} />
            ))}
          </View>
        ))}
        <Text
          fixed
          style={{ position: "absolute", top: A4_HEIGHT - 13 * MM, left: 20 * MM, right: 20 * MM, textAlign: "center", fontSize: 9, color: colors.muted }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

/** Render the parent answer pack: answers, marks, worked solutions and topic labels. */
export async function renderAnswerPackPdf(pack: AnswerPack, options: RenderOptions = {}): Promise<Buffer> {
  return renderToBuffer(<AnswerPackDocument pack={pack} options={options} />);
}
