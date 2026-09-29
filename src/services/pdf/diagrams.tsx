import { Circle, G, Line, Path, Polygon, Rect, Svg, Text as SvgText, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { Block } from "@/schemas/question-content";
import {
  layoutAngle,
  layoutBarGraph,
  layoutGrid,
  layoutLines,
  type Seg,
  type TextMark,
} from "./diagram-layout";
import { pdfText } from "./primitives-text";

/**
 * Diagram blocks drawn with react-pdf Svg primitives: black on white, fixed
 * sizes, Helvetica labels. All geometry comes from diagram-layout.ts.
 */

export type DiagramBlock = Extract<Block, { t: "bargraph" | "grid" | "angle" | "lines" }>;

const INK = "#000000";
const FAINT = "#8a8a8a";
const SHADE = "#c9c9c9";

export function isDiagramBlock(block: Block): block is DiagramBlock {
  return block.t === "bargraph" || block.t === "grid" || block.t === "angle" || block.t === "lines";
}

function Label({ mark }: { mark: TextMark }): ReactElement {
  return (
    <SvgText
      x={mark.x}
      y={mark.y}
      textAnchor={mark.anchor}
      style={{ fontFamily: mark.bold ? "Helvetica-Bold" : "Helvetica", fontSize: mark.size }}
      fill={INK}
    >
      {pdfText(mark.text)}
    </SvgText>
  );
}

function Stroke({ seg, width, color = INK }: { seg: Seg; width: number; color?: string }): ReactElement {
  return <Line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke={color} strokeWidth={width} />;
}

function BarGraph({ block }: { block: Extract<DiagramBlock, { t: "bargraph" }> }): ReactElement {
  const l = layoutBarGraph(block);
  return (
    <Svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`}>
      {l.gridlines.map((s, i) => (
        <Stroke key={`g${i}`} seg={s} width={0.5} color={FAINT} />
      ))}
      {l.bars.map((b, i) => (
        <Rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={SHADE} stroke={INK} strokeWidth={0.8} />
      ))}
      {l.axes.map((s, i) => (
        <Stroke key={`a${i}`} seg={s} width={1} />
      ))}
      {l.texts.map((t, i) => (
        <Label key={`t${i}`} mark={t} />
      ))}
    </Svg>
  );
}

function Grid({ block }: { block: Extract<DiagramBlock, { t: "grid" }> }): ReactElement {
  const l = layoutGrid(block);
  return (
    <Svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`}>
      {l.shaded.map((r, i) => (
        <Rect key={`s${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={SHADE} />
      ))}
      {l.lines.map((s, i) => (
        <Stroke key={`l${i}`} seg={s} width={0.5} color={FAINT} />
      ))}
      {l.outline ? <Polygon points={l.outline} fill="none" stroke={INK} strokeWidth={1} /> : null}
    </Svg>
  );
}

function Angle({ block }: { block: Extract<DiagramBlock, { t: "angle" }> }): ReactElement {
  const l = layoutAngle(block);
  return (
    <Svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`}>
      <Stroke seg={l.arm1} width={1} />
      <Stroke seg={l.arm2} width={1} />
      {l.rightMark ? (
        <Path d={l.rightMark} fill="none" stroke={INK} strokeWidth={0.8} />
      ) : (
        <Path d={l.arc} fill="none" stroke={INK} strokeWidth={0.6} />
      )}
      {l.label ? <Label mark={l.label} /> : null}
    </Svg>
  );
}

function Lines({ block }: { block: Extract<DiagramBlock, { t: "lines" }> }): ReactElement {
  const l = layoutLines(block);
  return (
    <Svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`}>
      <G>
        {l.dots.map((d, i) => (
          <Circle key={`d${i}`} cx={d.cx} cy={d.cy} r={0.9} fill={INK} />
        ))}
      </G>
      {l.segments.map((s, i) => (
        <Stroke key={`s${i}`} seg={s} width={1} />
      ))}
      {l.points.map((p, i) => (
        <Circle key={`p${i}`} cx={p.cx} cy={p.cy} r={2} fill={INK} />
      ))}
      {l.segments.map((s, i) => (s.label ? <Label key={`sl${i}`} mark={s.label} /> : null))}
      {l.points.map((p, i) => (
        <Label key={`pl${i}`} mark={p.label} />
      ))}
    </Svg>
  );
}

/** One diagram. Never splits across pages. */
export function DiagramView({ block }: { block: DiagramBlock }): ReactElement {
  return (
    <View wrap={false} style={{ marginVertical: 4, alignSelf: "flex-start" }}>
      {block.t === "bargraph" ? <BarGraph block={block} /> : null}
      {block.t === "grid" ? <Grid block={block} /> : null}
      {block.t === "angle" ? <Angle block={block} /> : null}
      {block.t === "lines" ? <Lines block={block} /> : null}
    </View>
  );
}
