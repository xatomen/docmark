"use client";

import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown/render-markdown";
import {
  getPageDimensions,
  type DocumentSettings,
} from "@/lib/document/settings";

type DocumentPreviewProps = {
  markdown: string;
  settings: DocumentSettings;
};

type PreviewScale = {
  scale: number;
  pageHeight: number;
};

export function DocumentPreview({ markdown, settings }: DocumentPreviewProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState(false);
  const [previewScale, setPreviewScale] = useState<PreviewScale>({
    scale: 1,
    pageHeight: 0,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const dimensions = getPageDimensions(settings.pageSize, settings.orientation);

  useEffect(() => {
    let active = true;

    renderMarkdown(markdown)
      .then((renderedHtml) => {
        if (active) {
          setHtml(renderedHtml);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [markdown]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;

    let active = true;

    const measure = () => {
      const physicalWidth = page.offsetWidth;
      const pageHeight = page.offsetHeight;
      if (!active || physicalWidth <= 0 || pageHeight <= 0) return;

      const availableWidth = viewport.clientWidth;
      const scale = Math.min(1, availableWidth / physicalWidth);

      setPreviewScale((current) => {
        if (
          Math.abs(current.scale - scale) < 0.001 &&
          Math.abs(current.pageHeight - pageHeight) < 1
        ) {
          return current;
        }
        return { scale, pageHeight };
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(page);
    measure();

    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  const pageStyle = {
    width: `${dimensions.widthMm}mm`,
    minHeight: `${dimensions.heightMm}mm`,
    padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
    marginLeft: `-${dimensions.widthMm / 2}mm`,
    transform: `scale(${previewScale.scale})`,
    transformOrigin: "top center",
  };

  const marginSummary = `${settings.margins.top}/${settings.margins.right}/${settings.margins.bottom}/${settings.margins.left} mm`;

  return (
    <div
      ref={viewportRef}
      className="preview-canvas flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 sm:py-7"
    >
      <div
        className="page-stage mx-auto w-full shrink-0"
        style={{ height: `${previewScale.pageHeight * previewScale.scale}px` }}
      >
        <article ref={pageRef} className="physical-page document-theme" style={pageStyle}>
          {error ? (
            <p role="status">
              This document could not be rendered. Your Markdown is still available in the editor.
            </p>
          ) : (
            // Only HTML returned by renderMarkdown, after rehype-sanitize, reaches this sink.
            <div dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </article>
      </div>
      <p className="page-caption mt-4 shrink-0 text-center font-mono text-[0.6875rem]">
        {settings.pageSize === "a4" ? "A4" : "Letter"} · {settings.orientation} ·{" "}
        {dimensions.widthMm} × {dimensions.heightMm} mm · Margins {marginSummary}
      </p>
    </div>
  );
}
