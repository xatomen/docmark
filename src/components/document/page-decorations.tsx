import type { CSSProperties } from "react";
import { getPageNumber, type PageNumberSettings } from "@/lib/document/settings";

type PageDecorationsProps = {
  pageIndex: number;
  settings: PageNumberSettings;
  leftMarginMm: number;
  rightMarginMm: number;
  bottomMarginMm: number;
};

/** Physical page elements rendered separately from measured Markdown content. */
export function PageDecorations({
  pageIndex,
  settings,
  leftMarginMm,
  rightMarginMm,
  bottomMarginMm,
}: PageDecorationsProps) {
  if (!settings.enabled) return null;

  const style = {
    "--page-number-left": `${leftMarginMm}mm`,
    "--page-number-right": `${rightMarginMm}mm`,
    "--page-margin-bottom": `${bottomMarginMm}mm`,
  } as CSSProperties;

  return (
    <footer className="page-decorations" aria-label="Page decorations" style={style}>
      <span
        className={`page-number page-number-${settings.position}`}
        data-page-number
        aria-label={`Page number ${getPageNumber(settings.startAt, pageIndex)}`}
      >
        {getPageNumber(settings.startAt, pageIndex)}
      </span>
    </footer>
  );
}
