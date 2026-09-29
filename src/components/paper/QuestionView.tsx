import type { ReactElement, ReactNode } from "react";
import type { Block, Inline, QuestionContent } from "@/schemas/question-content";
import { DiagramView, isDiagramBlock } from "./diagrams";

/**
 * A question as a pupil will see it (M2-03). Renders the structured content (paragraphs, stacked
 * fractions, blanks, tables, images, diagrams and multiple-choice options) as plain HTML and inline
 * SVG. It never shows the answer, the working or the marking scheme: those have their own view
 * (AnswerView). Server-safe and free of state, so the same component can serve the iPad attempt
 * screen later.
 *
 * Images: files are private (ADR-0005), so this component never builds a URL. The caller passes
 * short-lived signed URLs in `imageUrls` (keyed by asset key); without one the picture shows as a
 * labelled placeholder, the same as the printed paper does when a file is missing.
 */

export type QuestionViewProps = {
  content: QuestionContent;
  /** The question number to show, e.g. 3. Omit in previews. */
  number?: number;
  marks?: number;
  imageUrls?: Readonly<Record<string, string>>;
  className?: string;
};

export function marksText(marks: number): string {
  return `(${marks} ${marks === 1 ? "mark" : "marks"})`;
}

export function FractionView({ inline }: { inline: Extract<Inline, { t: "frac" }> }): ReactElement {
  return (
    <span data-fraction className="mx-0.5 inline-flex items-center align-middle">
      {inline.whole !== undefined ? <span className="mr-0.5">{inline.whole}</span> : null}
      <span className="sr-only">{`${inline.n} over ${inline.d}`}</span>
      <span aria-hidden="true" className="inline-flex flex-col items-center text-[0.85em] leading-tight">
        <span className="px-1">{inline.n}</span>
        <span className="h-px w-full self-stretch bg-current" />
        <span className="px-1">{inline.d}</span>
      </span>
    </span>
  );
}

export function InlineView({ inline }: { inline: Inline }): ReactElement {
  if (inline.t === "text") return <>{inline.v}</>;
  if (inline.t === "frac") return <FractionView inline={inline} />;
  return (
    <span data-blank className="inline-block min-w-20 border-b-2 border-current align-baseline" role="img" aria-label={inline.label ? `blank for ${inline.label}` : "blank to fill in"}>
      {inline.label ? <span className="pr-1 text-sm">({inline.label})</span> : <span aria-hidden="true">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>}
    </span>
  );
}

export function InlineRunView({ inlines }: { inlines: readonly Inline[] }): ReactElement {
  return (
    <>
      {inlines.map((inline, i) => (
        <InlineView key={i} inline={inline} />
      ))}
    </>
  );
}

function BlockView({ block, imageUrls }: { block: Block; imageUrls: QuestionViewProps["imageUrls"] }): ReactElement {
  if (block.t === "p") {
    return (
      <p className="leading-relaxed">
        <InlineRunView inlines={block.c} />
      </p>
    );
  }
  if (block.t === "table") {
    const [head, ...body] = block.rows;
    const cellClass = "border border-black px-3 py-1.5 text-left align-middle";
    return (
      <div className="max-w-full overflow-x-auto">
        <table className="my-1 border-collapse">
          {block.header && head ? (
            <thead className="bg-neutral-100">
              <tr>
                {head.map((cell, c) => (
                  <th key={c} scope="col" className={`${cellClass} font-semibold`}>
                    <InlineRunView inlines={cell} />
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {(block.header ? body : block.rows).map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={cellClass}>
                    <InlineRunView inlines={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.t === "image") {
    const url = imageUrls?.[block.assetKey];
    if (url) {
      // Private files are served by short-lived signed links the caller creates; next/image would proxy them.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={block.alt} style={{ width: `${block.widthMm ?? 80}mm`, maxWidth: "100%" }} />;
    }
    return (
      <div role="img" aria-label={block.alt} className="flex h-28 items-center justify-center rounded border border-dashed border-neutral-500 p-3 text-sm text-neutral-700">
        {`[Image: ${block.alt}]`}
      </div>
    );
  }
  if (isDiagramBlock(block)) return <DiagramView block={block} />;
  return <></>;
}

/** Consecutive angles sit side by side, as on the printed paper. */
export function BlockListView({ blocks, imageUrls }: { blocks: readonly Block[]; imageUrls?: QuestionViewProps["imageUrls"] }): ReactElement {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i] as Block;
    if (block.t === "angle") {
      const group: Block[] = [block];
      while ((blocks[i + 1] as Block | undefined)?.t === "angle") {
        i += 1;
        group.push(blocks[i] as Block);
      }
      out.push(
        <div key={i} className="flex flex-wrap items-end gap-x-3">
          {group.map((g, j) => (
            <BlockView key={j} block={g} imageUrls={imageUrls} />
          ))}
        </div>,
      );
    } else {
      out.push(<BlockView key={i} block={block} imageUrls={imageUrls} />);
    }
  }
  return <div className="flex flex-col gap-2">{out}</div>;
}

export function QuestionView({ content, number, marks, imageUrls, className }: QuestionViewProps): ReactElement {
  return (
    <article data-question-view className={`flex gap-3 text-lg text-black ${className ?? ""}`.trim()}>
      {number !== undefined ? <span className="min-w-8 font-semibold">{number}.</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <BlockListView blocks={content.stem} imageUrls={imageUrls} />
        {content.options ? (
          <ol data-options className="flex flex-col gap-2">
            {content.options.map((option) => (
              <li key={option.id} className="flex gap-3">
                <span className="min-w-6 font-semibold">({option.id})</span>
                <span>
                  <InlineRunView inlines={option.c} />
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {marks !== undefined ? <span className="self-start whitespace-nowrap text-base">{marksText(marks)}</span> : null}
    </article>
  );
}
