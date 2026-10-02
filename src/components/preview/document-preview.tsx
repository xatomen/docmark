"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderMarkdown } from "@/lib/markdown/render-markdown";
import { paginateDocument, type PaginatedPage } from "@/lib/document/pagination";
import { PageDecorations } from "@/components/document/page-decorations";
import {
  getPageDimensions,
  type DocumentSettings,
} from "@/lib/document/settings";

type DocumentPreviewProps = {
  markdown: string;
  settings: DocumentSettings;
  onPaginationReady: (ready: boolean) => void;
};

const PX_PER_MM = 96 / 25.4;

export function DocumentPreview({
  markdown,
  settings,
  onPaginationReady,
}: DocumentPreviewProps) {
  const [html, setHtml] = useState("");
  const [renderError, setRenderError] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [pages, setPages] = useState<PaginatedPage[]>([
    { id: "page-1", html: "", isBlank: true, overflowPx: 0 },
  ]);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const firstPageRef = useRef<HTMLElement>(null);
  const renderedMeasurementRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const paginationGeneration = useRef(0);
  const dimensions = getPageDimensions(settings.pageSize, settings.orientation);
  const contentWidthMm =
    dimensions.widthMm - settings.margins.left - settings.margins.right;
  const contentHeightMm =
    dimensions.heightMm - settings.margins.top - settings.margins.bottom;
  const contentHeightPx = contentHeightMm * PX_PER_MM;
  const physicalWidthPx = dimensions.widthMm * PX_PER_MM;
  const physicalHeightPx = dimensions.heightMm * PX_PER_MM;

  useEffect(() => {
    let active = true;

    renderMarkdown(markdown)
      .then((renderedHtml) => {
        if (active) {
          setHtml(renderedHtml);
          setRenderError(false);
        }
      })
      .catch(() => {
        if (active) setRenderError(true);
      });

    return () => {
      active = false;
    };
  }, [markdown]);

  useEffect(() => {
    const content = measurementRef.current;
    const renderedContent = renderedMeasurementRef.current;
    if (!content || !renderedContent || renderError) return;

    let active = true;
    const generation = ++paginationGeneration.current;
    let initialPaginationComplete = false;
    let lastMeasurementHeight: number | null = null;
    content.style.width = `${contentWidthMm}mm`;
    renderedContent.style.width = `${contentWidthMm}mm`;
    content.style.setProperty("--document-content-height", `${contentHeightMm}mm`);

    const repaginate = () => {
      if (!active || generation !== paginationGeneration.current) return;
      onPaginationReady(false);
      try {
        setPages(paginateDocument(renderedContent, content, contentHeightPx));
        setPaginationError(false);
        onPaginationReady(true);
      } catch {
        setPaginationError(true);
        onPaginationReady(false);
      }
    };

    // Track actual source layout changes (for example a late image load or a
    // font metric change). The target used for trial measurements is separate,
    // so pagination never observes or reacts to its own output.
    const sourceObserver = new ResizeObserver(() => {
      const height = renderedContent.getBoundingClientRect().height;
      const changed =
        lastMeasurementHeight !== null &&
        Math.abs(height - lastMeasurementHeight) > 0.5;
      lastMeasurementHeight = height;
      if (changed && initialPaginationComplete) repaginate();
    });
    sourceObserver.observe(renderedContent);

    // Font readiness is a one-shot browser signal, not a polling loop. Markdown
    // and the editor remain usable while the browser finishes resolving fonts.
    document.fonts.ready
      .then(() => {
        if (!active || generation !== paginationGeneration.current) return;
        repaginate();
        initialPaginationComplete = true;
      })
      .catch(() => {
        if (active && generation === paginationGeneration.current) {
          setPaginationError(true);
          onPaginationReady(false);
        }
      });

    return () => {
      active = false;
      sourceObserver.disconnect();
    };
  }, [
    html,
    contentWidthMm,
    contentHeightMm,
    contentHeightPx,
    settings.pageSize,
    settings.orientation,
    settings.margins.top,
    settings.margins.right,
    settings.margins.bottom,
    settings.margins.left,
    onPaginationReady,
    renderError,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = firstPageRef.current;
    if (!viewport || !page) return;

    let active = true;
    const measureScale = () => {
      const width = page.offsetWidth;
      if (!active || width <= 0) return;
      const nextScale = Math.min(1, viewport.clientWidth / width);
      setScale((current) =>
        Math.abs(current - nextScale) < 0.001 ? current : nextScale,
      );
    };

    const observer = new ResizeObserver(measureScale);
    observer.observe(viewport);
    observer.observe(page);
    measureScale();

    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  const pageStyle: CSSProperties = {
    width: `${dimensions.widthMm}mm`,
    height: `${dimensions.heightMm}mm`,
    padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
    marginLeft: `-${dimensions.widthMm / 2}mm`,
    transform: `scale(${scale})`,
    transformOrigin: "top center",
  };
  const contentStyle = {
    "--document-content-height": `${contentHeightMm}mm`,
  } as CSSProperties;
  const marginSummary = `${settings.margins.top}/${settings.margins.right}/${settings.margins.bottom}/${settings.margins.left} mm`;
  const printPageStyle = `@page { size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm; margin: 0; }`;

  return (
    <div
      ref={viewportRef}
      className="preview-canvas flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 sm:py-7"
    >
      <style media="print">{printPageStyle}</style>
      <div className="page-list flex w-full shrink-0 flex-col items-center gap-[18px]">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className="page-stage shrink-0"
            style={{
              width: `${physicalWidthPx * scale}px`,
              height: `${(physicalHeightPx + page.overflowPx) * scale}px`,
              "--page-width": `${dimensions.widthMm}mm`,
              "--page-height": `${dimensions.heightMm}mm`,
            } as CSSProperties}
          >
            <article
              ref={index === 0 ? firstPageRef : undefined}
              className={`physical-page${page.overflowPx > 0.5 ? " physical-page-overflow" : ""}`}
              style={pageStyle}
              aria-label={`Page ${index + 1}${page.isBlank ? ", blank" : ""}`}
            >
              <div
                className="document-theme document-content"
                style={contentStyle}
                dangerouslySetInnerHTML={{ __html: page.html }}
              />
              <PageDecorations
                pageIndex={index}
                settings={settings.pageNumbers}
                leftMarginMm={settings.margins.left}
                rightMarginMm={settings.margins.right}
                bottomMarginMm={settings.margins.bottom}
              />
            </article>
          </div>
        ))}
      </div>

      <p className="page-caption mt-4 shrink-0 text-center font-mono text-[0.6875rem]">
        {settings.pageSize === "a4" ? "A4" : "Letter"} · {settings.orientation} ·{" "}
        {pages.length} {pages.length === 1 ? "page" : "pages"} · {dimensions.widthMm} × {dimensions.heightMm} mm · Margins {marginSummary}
      </p>
      {(renderError || paginationError) && (
        <p role="status" className="mt-2 shrink-0 text-center text-xs text-red-700 dark:text-red-300">
          {renderError
            ? "This document could not be rendered. Your Markdown is still available in the editor."
            : "Pagination could not be completed. Your Markdown is still available in the editor."}
        </p>
      )}

      <div className="measurement-layer" aria-hidden="true" inert>
        <div
          ref={renderedMeasurementRef}
          className="document-theme document-content"
          style={contentStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div
          ref={measurementRef}
          className="document-theme document-content"
          style={contentStyle}
        />
      </div>
    </div>
  );
}
