import type { ReactElement } from "react";
import type { Block } from "@/schemas/question-content";
import {
  layoutAngle,
  layoutBarGraph,
  layoutGrid,
  layoutLines,
  type Seg,
  type TextMark,
} from "@/services/pdf/diagram-layout";

/**
 * Diagram blocks as inline SVG, for the web preview and later the iPad attempt screen.
 *
 * Geometry comes from the same pure layout functions the PDF renderer uses (diagram-layout.ts),
 * in the same units, so a diagram has the same proportions on screen as on paper. The drawing is
 * scaled by 96/72 so one PDF point is one CSS pixel at print size; on a narrow screen it shrinks
 * to fit and never scrolls sideways. Screen readers get a short description that never states an
 * answer (an angle's size, the number of squares in a shape).
 */

export type DiagramBlock = Extract<Block, { t: "bargraph" | "grid" | "angle" | "lines" }>;

export function isDiagramBlock(block: Block): block is DiagramBlock {
  return block.t === "bargraph" || block.t === "grid" || block.t === "angle" || block.t === "lines";
}

const INK = "#000000";
const FAINT = "#8a8a8a";
const SHADE = "#c9c9c9";
/** CSS pixels per PDF point. */
const SCALE = 96 / 72;

function Frame({
  width,
  height,
  label,
  children,
}: {
  width: number;
  height: number;
  label: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={Math.round(width * SCALE * 100) / 100}
      height={Math.round(height * SCALE * 100) / 100}
      style={{ maxWidth: "100%", height: "auto", display: "block" }}
      fontFamily="Helvetica, Arial, sans-serif"
    >
      {children}
    </svg>
  );
}

function Label({ mark }: { mark: TextMark }): ReactElement {
  return (
    <text x={mark.x} y={mark.y} textAnchor={mark.anchor} fontSize={mark.size} fontWeight={mark.bold ? 700 : 400} fill={INK}>
      {mark.text}
    </text>
  );
}

function Stroke({ seg, width, color = INK }: { seg: Seg; width: number; color?: string }): ReactElement {
  return <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke={color} strokeWidth={width} />;
}

function BarGraph({ block }: { block: Extract<DiagramBlock, { t: "bargraph" }> }): ReactElement {
  const l = layoutBarGraph(block);
  const summary = block.bars.map((b) => `${b.label} ${b.value}`).join(", ");
  return (
    <Frame width={l.width} height={l.height} label={`Bar graph: ${block.title}. ${summary}.`}>
      {l.gridlines.map((s, i) => (
        <Stroke key={`g${i}`} seg={s} width={0.5} color={FAINT} />
      ))}
      {l.bars.map((b, i) => (
        <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={SHADE} stroke={INK} strokeWidth={0.8} />
      ))}
      {l.axes.map((s, i) => (
        <Stroke key={`a${i}`} seg={s} width={1} />
      ))}
      {l.texts.map((t, i) => (
        <Label key={`t${i}`} mark={t} />
      ))}
    </Frame>
  );
}

function Grid({ block }: { block: Extract<DiagramBlock, { t: "grid" }> }): ReactElement {
  const l = layoutGrid(block);
  return (
    <Frame width={l.width} height={l.height} label="A square grid with a shape drawn on it">
      {l.shaded.map((r, i) => (
        <rect key={`s${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={SHADE} />
      ))}
      {l.lines.map((s, i) => (
        <Stroke key={`l${i}`} seg={s} width={0.5} color={FAINT} />
      ))}
      {l.outline ? <polygon points={l.outline} fill="none" stroke={INK} strokeWidth={1} /> : null}
    </Frame>
  );
}

function Angle({ block }: { block: Extract<DiagramBlock, { t: "angle" }> }): ReactElement {
  const l = layoutAngle(block);
  return (
    <Frame width={l.width} height={l.height} label={block.label ? `Angle ${block.label}` : "An angle"}>
      <Stroke seg={l.arm1} width={1} />
      <Stroke seg={l.arm2} width={1} />
      {l.rightMark ? (
        <path d={l.rightMark} fill="none" stroke={INK} strokeWidth={0.8} />
      ) : (
        <path d={l.arc} fill="none" stroke={INK} strokeWidth={0.6} />
      )}
      {l.label ? <Label mark={l.label} /> : null}
    </Frame>
  );
}

function Lines({ block }: { block: Extract<DiagramBlock, { t: "lines" }> }): ReactElement {
  const l = layoutLines(block);
  return (
    <Frame
      width={l.width}
      height={l.height}
      label={block.dotGrid ? "A dot grid with line segments drawn on it" : "Line segments"}
    >
      <g>
        {l.dots.map((d, i) => (
          <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={0.9} fill={INK} />
        ))}
      </g>
      {l.segments.map((s, i) => (
        <Stroke key={`s${i}`} seg={s} width={1} />
      ))}
      {l.points.map((p, i) => (
        <circle key={`p${i}`} cx={p.cx} cy={p.cy} r={2} fill={INK} />
      ))}
      {l.segments.map((s, i) => (s.label ? <Label key={`sl${i}`} mark={s.label} /> : null))}
      {l.points.map((p, i) => (
        <Label key={`pl${i}`} mark={p.label} />
      ))}
    </Frame>
  );
}

/** One diagram, drawn to the same proportions as the printed paper. */
export function DiagramView({ block }: { block: DiagramBlock }): ReactElement {
  return (
    <div data-diagram={block.t} className="my-2 max-w-full self-start">
      {block.t === "bargraph" ? <BarGraph block={block} /> : null}
      {block.t === "grid" ? <Grid block={block} /> : null}
      {block.t === "angle" ? <Angle block={block} /> : null}
      {block.t === "lines" ? <Lines block={block} /> : null}
    </div>
  );
}
