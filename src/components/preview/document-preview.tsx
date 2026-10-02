"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderMarkdownDocument } from "@/lib/markdown/render-markdown";
import { fitMermaidBlocks } from "@/lib/document/mermaid-geometry";
import { paginateDocument, type PaginatedPage } from "@/lib/document/pagination";
import { PageDecorations } from "@/components/document/page-decorations";
import { ensureDocumentFontReady } from "@/lib/document/font-loading";
import { getDocumentFontDefinition } from "@/lib/document/font-registry";
import {
  getPhysicalHeadingPages,
  stabilizeTocPagination,
  type TocPageMap,
} from "@/lib/document/toc";
import {
  getDocumentFontStack,
  getPageDimensions,
  type DocumentSettings,
} from "@/lib/document/settings";

type DocumentPreviewProps = {
  markdown: string;
  settings: DocumentSettings;
  onPaginationReady: (ready: boolean) => void;
};

const PX_PER_MM = 96 / 25.4;

type TocHeading = { id: string; level: number; label: string };

function visibleHeadingText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLBRElement) return " ";
  if (node instanceof HTMLImageElement) return node.alt;
  return Array.from(node.childNodes, visibleHeadingText).join("");
}

function readTocHeadings(renderedContent: HTMLElement): TocHeading[] {
  return Array.from(
    renderedContent.querySelectorAll<HTMLElement>("h1[data-docmark-heading-id], h2[data-docmark-heading-id], h3[data-docmark-heading-id]"),
    (heading) => ({
      id: heading.getAttribute("data-docmark-heading-id") ?? "",
      level: Number(heading.tagName.slice(1)),
      label: visibleHeadingText(heading).replace(/\s+/g, " ").trim(),
    }),
  ).filter((heading) => heading.id && heading.label);
}

function showMermaidLoadErrors(html: string): string {
  const host = document.createElement("div");
  host.innerHTML = html;
  for (const marker of Array.from(host.querySelectorAll("[data-docmark-mermaid]"))) {
    const error = document.createElement("div");
    error.className = "docmark-mermaid-error";
    error.setAttribute("role", "note");
    error.textContent = "This Mermaid diagram could not be rendered.";
    marker.replaceWith(error);
  }
  return host.innerHTML;
}

function renderToc(
  markers: HTMLElement[],
  headings: TocHeading[],
  pages: TocPageMap,
) {
  markers.forEach((marker, markerIndex) => {
    marker.classList.remove("docmark-toc");
    marker.replaceChildren();
    if (markerIndex !== 0) return;

    marker.classList.add("docmark-toc");
    const title = document.createElement("h2");
    title.className = "docmark-toc-title";
    title.textContent = "Table of Contents";

    const list = document.createElement("ol");
    list.className = "docmark-toc-list";
    for (const heading of headings) {
      const row = document.createElement("li");
      row.className = "docmark-toc-entry";
      row.dataset.docmarkTocEntry = heading.id;
      row.style.setProperty("--toc-indent", `${(heading.level - 1) * 0.65}rem`);

      const label = document.createElement("span");
      label.className = "docmark-toc-label";
      label.textContent = heading.label;

      const leader = document.createElement("span");
      leader.className = "docmark-toc-leader";
      leader.setAttribute("aria-hidden", "true");

      const page = document.createElement("span");
      page.className = "docmark-toc-page";
      page.textContent = String(pages[heading.id] ?? 1);

      row.append(label, leader, page);
      list.append(row);
    }

    marker.append(title, list);
  });
}

export function DocumentPreview({
  markdown,
  settings,
  onPaginationReady,
}: DocumentPreviewProps) {
  const [html, setHtml] = useState("");
  const [renderError, setRenderError] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [fontReadiness, setFontReadiness] = useState<{
    key: string;
    status: "ready" | "fallback";
  } | null>(null);
  const [tocPasses, setTocPasses] = useState(0);
  const [pages, setPages] = useState<PaginatedPage[]>([
    { id: "page-1", html: "", isBlank: true, overflowPx: 0, headingIds: [] },
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
  const fontFamily = settings.typography.fontFamily;
  const fontSize = settings.typography.fontSize;
  const fontKey = `${fontFamily}:${fontSize}`;
  const currentFontReadiness = fontReadiness?.key === fontKey ? fontReadiness.status : null;
  const fontLoadFailed = currentFontReadiness === "fallback";

  useEffect(() => {
    let active = true;
    const definition = getDocumentFontDefinition(fontFamily);

    void ensureDocumentFontReady(definition, fontSize).then((ready) => {
      if (active) {
        setFontReadiness({ key: fontKey, status: ready ? "ready" : "fallback" });
      }
    });

    return () => {
      active = false;
    };
  }, [fontFamily, fontKey, fontSize]);

  useEffect(() => {
    let active = true;

    onPaginationReady(false);

    renderMarkdownDocument(markdown)
      .then(async ({ html: renderedHtml, mermaidDiagrams }) => {
        let resolvedHtml = renderedHtml;
        if (mermaidDiagrams.length) {
          try {
            const { renderMermaidDiagrams } = await import("@/lib/document/render-mermaid");
            resolvedHtml = await renderMermaidDiagrams(renderedHtml, mermaidDiagrams);
          } catch {
            resolvedHtml = showMermaidLoadErrors(renderedHtml);
          }
        }
        if (active) {
          setHtml(resolvedHtml);
          setRenderError(false);
        }
      })
      .catch(() => {
        if (active) setRenderError(true);
      });

    return () => {
      active = false;
    };
  }, [markdown, onPaginationReady]);

  useEffect(() => {
    const content = measurementRef.current;
    const renderedContent = renderedMeasurementRef.current;
    if (!content || !renderedContent || renderError) return;

    let active = true;
    const generation = ++paginationGeneration.current;
    if (!currentFontReadiness) {
      onPaginationReady(false);
      return () => {
        active = false;
      };
    }

    let initialPaginationComplete = false;
    let lastMeasurementHeight: number | null = null;
    content.style.width = `${contentWidthMm}mm`;
    renderedContent.style.width = `${contentWidthMm}mm`;
    content.style.setProperty("--document-content-height", `${contentHeightMm}mm`);

    const repaginate = () => {
      if (!active || generation !== paginationGeneration.current) return;
      onPaginationReady(false);
      try {
        fitMermaidBlocks(renderedContent, {
          width: contentWidthMm * PX_PER_MM,
          height: Math.max(1, contentHeightPx - 16),
        });
        const tocMarkers = Array.from(
          renderedContent.querySelectorAll<HTMLElement>("[data-docmark-toc]"),
        );

        if (tocMarkers.length === 0) {
          setPages(paginateDocument(renderedContent, content, contentHeightPx));
          setTocPasses(0);
        } else {
          const headings = readTocHeadings(renderedContent);
          const initialPages = Object.fromEntries(headings.map(({ id }) => [id, 1]));
          const result = stabilizeTocPagination((tocPages) => {
            renderToc(tocMarkers, headings, tocPages);
            const paginated = paginateDocument(
              renderedContent,
              content,
              contentHeightPx,
              true,
            );
            const actualHeadingPages = getPhysicalHeadingPages(paginated);
            return {
              result: paginated,
              headingPages: Object.fromEntries(
                headings.map(({ id }) => [id, actualHeadingPages[id] ?? 1]),
              ),
            };
          }, initialPages);
          setPages(result.result);
          setTocPasses(result.passes);
        }
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
    fontFamily,
    fontKey,
    fontSize,
    currentFontReadiness,
    settings.typography.lineHeight,
    settings.typography.alignment,
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

  const typographyStyle = {
    "--doc-font-family": getDocumentFontStack(
      fontLoadFailed ? "Arial" : fontFamily,
    ),
    "--doc-font-size": `${fontSize}pt`,
    "--doc-line-height": settings.typography.lineHeight,
    "--doc-text-align": settings.typography.alignment,
  } as CSSProperties;
  const pageStyle = {
    width: `${dimensions.widthMm}mm`,
    height: `${dimensions.heightMm}mm`,
    padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
    marginLeft: `-${dimensions.widthMm / 2}mm`,
    transform: `scale(${scale})`,
    transformOrigin: "top center",
    ...typographyStyle,
  } as CSSProperties;
  const contentStyle = {
    "--document-content-height": `${contentHeightMm}mm`,
    ...typographyStyle,
  } as CSSProperties;
  const marginSummary = `${settings.margins.top}/${settings.margins.right}/${settings.margins.bottom}/${settings.margins.left} mm`;
  const printPageStyle = `@page { size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm; margin: 0; }`;

  return (
    <div
      ref={viewportRef}
      className="preview-canvas flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 sm:py-7"
    >
      <style media="print">{printPageStyle}</style>
      <div
        className="page-list flex w-full shrink-0 flex-col items-center gap-[18px]"
        data-toc-stabilization-passes={tocPasses}
      >
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
                header={settings.header}
                footer={settings.footer}
                leftMarginMm={settings.margins.left}
                rightMarginMm={settings.margins.right}
                topMarginMm={settings.margins.top}
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
      {fontLoadFailed && (
        <p role="status" className="mt-2 shrink-0 text-center text-xs text-amber-800 dark:text-amber-300">
          {fontFamily} could not be loaded. Arial is used for measurement, preview, and print.
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
