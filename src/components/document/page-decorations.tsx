import type { CSSProperties } from "react";
import type { PageKind } from "@/lib/document/physical-pages";
import { getPageNumber, type HeaderFooterSettings, type PageNumberSettings } from "@/lib/document/settings";

type PageDecorationsProps = {
  pageIndex: number;
  settings: PageNumberSettings;
  header: HeaderFooterSettings;
  footer: HeaderFooterSettings;
  leftMarginMm: number;
  rightMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  pageKind?: PageKind;
};

function DecorationText({
  kind,
  decoration,
}: {
  kind: "header" | "footer";
  decoration: HeaderFooterSettings;
}) {
  if (!decoration.enabled || decoration.text.length === 0) return null;
  return (
    <span className={`page-decoration-text page-decoration-text-${decoration.alignment}`} data-page-decoration={kind}>
      {decoration.text}
    </span>
  );
}

/** Physical page elements rendered separately from measured Markdown content. */
export function PageDecorations({
  pageIndex,
  settings,
  header,
  footer,
  leftMarginMm,
  rightMarginMm,
  topMarginMm,
  bottomMarginMm,
  pageKind = "content",
}: PageDecorationsProps) {
  if (pageKind === "cover") return null;
  if (!settings.enabled && !header.enabled && !footer.enabled) return null;

  const style = {
    "--page-number-left": `${leftMarginMm}mm`,
    "--page-number-right": `${rightMarginMm}mm`,
    "--page-margin-bottom": `${bottomMarginMm}mm`,
    "--page-margin-top": `${topMarginMm}mm`,
  } as CSSProperties;
  const numberSlot = settings.enabled ? settings.position.replace("bottom-", "") : null;
  const footerSlot = footer.enabled ? footer.alignment : null;
  const hasCollision = numberSlot !== null && numberSlot === footerSlot && footer.text.length > 0;
  const number = settings.enabled ? (
    <span
      className={`page-number page-number-${settings.position}`}
      data-page-number
      aria-label={`Page number ${getPageNumber(settings.startAt, pageIndex)}`}
    >
      {getPageNumber(settings.startAt, pageIndex)}
    </span>
  ) : null;

  return (
    <div className="page-decorations" aria-label="Page decorations" style={style}>
      {header.enabled && (
        <header className="page-decoration-area page-decoration-area-top" aria-label="Page header">
          <div className="page-decoration-slots">
            {(["left", "center", "right"] as const).map((slot) => (
              <div className={`page-decoration-slot page-decoration-slot-${slot}`} key={slot}>
                {header.alignment === slot && <DecorationText kind="header" decoration={header} />}
              </div>
            ))}
          </div>
        </header>
      )}
      {(footer.enabled || settings.enabled) && (
        <footer className={`page-decoration-area page-decoration-area-bottom${hasCollision ? " page-decoration-area-collision" : ""}`} aria-label="Page footer and number">
          <div className="page-decoration-slots">
            {(["left", "center", "right"] as const).map((slot) => {
              const text = footerSlot === slot ? <DecorationText kind="footer" decoration={footer} /> : null;
              const pageNumber = numberSlot === slot ? number : null;
              return (
                <div className={`page-decoration-slot page-decoration-slot-${slot}`} key={slot}>
                  {text && pageNumber ? (
                    <>
                      <span className={`page-decoration-stack page-decoration-stack-${slot}`}>{text}</span>
                      {pageNumber}
                    </>
                  ) : <>{text}{pageNumber}</>}
                </div>
              );
            })}
          </div>
        </footer>
      )}
    </div>
  );
}
