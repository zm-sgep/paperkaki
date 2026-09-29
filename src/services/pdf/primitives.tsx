import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ComponentProps, ReactElement } from "react";
type Style = NonNullable<ComponentProps<typeof View>["style"]>;
import type { Block, Inline } from "@/schemas/question-content";
import { DiagramView, isDiagramBlock } from "./diagrams";
import { pdfText } from "./primitives-text";
import type { PdfImage } from "./types";

/**
 * Shared layout primitives. Built-in Helvetica only (no remote fonts) so
 * rendering is offline and deterministic.
 */

// Disable hyphenation: words are never split, so extracted text is exact.
Font.registerHyphenationCallback((word) => [word]);

export const MM = 72 / 25.4;
export const A4_HEIGHT = 297 * MM;

export { pdfText };

export const colors = { ink: "#000000", muted: "#444444", rule: "#000000", faint: "#888888", tint: "#efefef" };

export const styles = StyleSheet.create({
  body: { fontFamily: "Helvetica", fontSize: 11, color: colors.ink, lineHeight: 1.35 },
  bold: { fontFamily: "Helvetica-Bold" },
  paragraph: { marginBottom: 4 },
  inlineRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 4 },
  fracStack: { alignItems: "center", marginHorizontal: 2 },
  fracNum: { fontSize: 10, lineHeight: 1.1, paddingHorizontal: 2 },
  fracRule: { alignSelf: "stretch", borderTopWidth: 0.8, borderTopColor: colors.ink, borderTopStyle: "solid", marginVertical: 1 },
  table: {
    borderLeftWidth: 0.8,
    borderTopWidth: 0.8,
    borderColor: colors.ink,
    borderStyle: "solid",
    marginVertical: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  tableRow: { flexDirection: "row" },
  cell: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRightWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: colors.ink,
    borderStyle: "solid",
  },
  cellHeader: { backgroundColor: colors.tint },
  imageBox: {
    height: 30 * MM,
    borderWidth: 0.8,
    borderColor: colors.faint,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    padding: 6,
  },
});

function blankText(inline: Extract<Inline, { t: "blank" }>): string {
  return inline.label ? `(${pdfText(inline.label)}) ________` : "________";
}

function Fraction({ inline }: { inline: Extract<Inline, { t: "frac" }> }): ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {inline.whole !== undefined ? <Text>{inline.whole}</Text> : null}
      <View style={styles.fracStack}>
        <Text style={styles.fracNum}>{inline.n}</Text>
        <View style={styles.fracRule} />
        <Text style={styles.fracNum}>{inline.d}</Text>
      </View>
    </View>
  );
}

/** Words with their trailing space, so a wrapping row keeps natural spacing. */
function words(text: string): string[] {
  return pdfText(text).match(/\S+\s*|\s+/g) ?? [];
}

/**
 * A run of inline content. Text-only runs are one wrapping <Text>; runs with
 * stacked fractions become a wrapping row so the fraction can sit inline.
 */
export function InlineRun({
  inlines,
  bold = false,
  style,
}: {
  inlines: readonly Inline[];
  bold?: boolean;
  style?: Style;
}): ReactElement {
  const weight = bold ? styles.bold : undefined;
  if (!inlines.some((i) => i.t === "frac")) {
    return (
      <Text style={[weight ?? {}, styles.paragraph, style ?? {}]}>
        {inlines.map((i) => (i.t === "text" ? pdfText(i.v) : i.t === "blank" ? blankText(i) : "")).join("")}
      </Text>
    );
  }
  return (
    <View style={[styles.inlineRow, style ?? {}]}>
      {inlines.flatMap((inline, idx) => {
        if (inline.t === "frac") return [<Fraction key={idx} inline={inline} />];
        const text = inline.t === "text" ? inline.v : blankText(inline);
        return words(text).map((w, j) => (
          <Text key={`${idx}-${j}`} style={weight}>
            {w}
          </Text>
        ));
      })}
    </View>
  );
}

export function ImageOrPlaceholder({
  block,
  image,
}: {
  block: Extract<Block, { t: "image" }>;
  image: PdfImage | null | undefined;
}): ReactElement {
  if (!image) {
    return (
      <View style={styles.imageBox}>
        <Text style={{ fontSize: 9, color: colors.muted }}>{`[Image: ${pdfText(block.alt)}]`}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginVertical: 4 }}>
      {/* react-pdf Image draws into a PDF; it is not an HTML <img> and has no alt prop. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        src={{ data: Buffer.from(image.data), format: image.format }}
        style={{ width: (block.widthMm ?? 80) * MM, objectFit: "contain" }}
      />
    </View>
  );
}

export function BlockView({
  block,
  images,
}: {
  block: Block;
  images: Readonly<Record<string, PdfImage | null>> | undefined;
}): ReactElement {
  if (block.t === "p") return <InlineRun inlines={block.c} />;
  if (block.t === "image") return <ImageOrPlaceholder block={block} image={images?.[block.assetKey]} />;
  if (isDiagramBlock(block)) return <DiagramView block={block} />;
  return (
    <View style={[styles.table, { width: Math.min(block.rows[0]?.length ?? 1, 5) * 88 }]}>
      {block.rows.map((row, r) => (
        <View key={r} style={styles.tableRow}>
          {row.map((cell, c) => {
            const isHeader = block.header && r === 0;
            return (
              <View key={c} style={[styles.cell, isHeader ? styles.cellHeader : {}]}>
                <InlineRun inlines={cell.length > 0 ? cell : [{ t: "text", v: " " }]} bold={isHeader} style={{ marginBottom: 0 }} />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * A run of blocks. Consecutive angle diagrams sit side by side (wrapping if
 * needed) so a "which angle?" question does not become a tall column.
 */
export function BlockList({
  blocks,
  images,
}: {
  blocks: readonly Block[];
  images: Readonly<Record<string, PdfImage | null>> | undefined;
}): ReactElement {
  const out: ReactElement[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i] as Block;
    if (block.t === "angle") {
      const group: Block[] = [block];
      while ((blocks[i + 1] as Block | undefined)?.t === "angle") {
        i += 1;
        group.push(blocks[i] as Block);
      }
      out.push(
        <View key={i} wrap={false} style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, alignItems: "flex-end" }}>
          {group.map((g, j) => (
            <View key={j}>
              <BlockView block={g} images={images} />
            </View>
          ))}
        </View>,
      );
    } else {
      out.push(<BlockView key={i} block={block} images={images} />);
    }
  }
  return <View>{out}</View>;
}

export function marksLabel(marks: number): string {
  return `(${marks} ${marks === 1 ? "mark" : "marks"})`;
}
