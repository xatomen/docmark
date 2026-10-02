import type { CSSProperties } from "react";
import type { CoverPageSettings } from "@/lib/document/settings";

export function DocumentCover({ settings }: { settings: CoverPageSettings }) {
  return (
    <div className="document-cover" data-document-cover>
      <div className="document-cover-main">
        {settings.title && <h1 className="document-cover-title">{settings.title}</h1>}
        {settings.subtitle && <p className="document-cover-subtitle">{settings.subtitle}</p>}
      </div>
      <div className="document-cover-metadata">
        {settings.author && <p>{settings.author}</p>}
        {settings.organization && <p>{settings.organization}</p>}
        {settings.date && <p>{settings.date}</p>}
      </div>
    </div>
  );
}

export function getDocumentCoverStyle(margins: { top: number; right: number; bottom: number; left: number }) {
  return {
    "--cover-inset-top": `max(${margins.top}mm, 12mm)`,
    "--cover-inset-right": `max(${margins.right}mm, 12mm)`,
    "--cover-inset-bottom": `max(${margins.bottom}mm, 12mm)`,
    "--cover-inset-left": `max(${margins.left}mm, 12mm)`,
  } as CSSProperties;
}
