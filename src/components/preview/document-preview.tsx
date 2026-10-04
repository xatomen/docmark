"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Tooltip } from "@heroui/react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { renderMarkdownDocument } from "@/lib/markdown/render-markdown";
import { fitMermaidBlocks } from "@/lib/document/mermaid-geometry";
import { paginateDocument } from "@/lib/document/pagination";
import { PageDecorations } from "@/components/document/page-decorations";
import { DocumentCover, getDocumentCoverStyle } from "@/components/document/document-cover";
import { composePhysicalPages, type PhysicalPage } from "@/lib/document/physical-pages";
import { resolveDisplayPageNumbers } from "@/lib/document/page-numbering";
import { ensureDocumentFontReady } from "@/lib/document/font-loading";
import { getDocumentFontDefinition } from "@/lib/document/font-registry";
import {
  getHeadingDisplayPageNumbers,
  stabilizeTocPagination,
  type TocPageMap,
} from "@/lib/document/toc";
import {
  getDocumentFontStack,
  getPageDimensions,
  type DocumentSettings,
} from "@/lib/document/settings";
import { getDocumentThemeDefinition } from "@/lib/document/themes";

type DocumentPreviewProps = {
  markdown: string;
  settings: DocumentSettings;
  onPaginationReady: (ready: boolean) => void;
};

const PX_PER_MM = 96 / 25.4;
const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150] as const;

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
  const [pages, setPages] = useState<PhysicalPage[]>([
    { id: "page-1", kind: "content", html: "", isBlank: true, overflowPx: 0, headingIds: [] },
  ]);
  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [manualZoomIndex, setManualZoomIndex] = useState(ZOOM_LEVELS.indexOf(100));
  const [currentPage, setCurrentPage] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
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
          const physicalPages = composePhysicalPages(
            paginateDocument(renderedContent, content, contentHeightPx),
            settings.cover.enabled,
            renderedContent.childNodes.length > 0,
          );
          setPages(physicalPages);
          setCurrentPage((current) => Math.min(current, Math.max(1, physicalPages.length)));
          setTocPasses(0);
        } else {
          const headings = readTocHeadings(renderedContent);
          const initialDisplayPageNumber = settings.pageNumbers.startAt +
            Number(settings.cover.enabled && !settings.pageNumbers.excludeCover);
          const initialPages = Object.fromEntries(
            headings.map(({ id }) => [id, initialDisplayPageNumber]),
          );
          const result = stabilizeTocPagination((tocPages) => {
            renderToc(tocMarkers, headings, tocPages);
            const paginated = paginateDocument(
              renderedContent,
              content,
              contentHeightPx,
              true,
            );
            const physicalPages = composePhysicalPages(
              paginated,
              settings.cover.enabled,
              renderedContent.childNodes.length > 0,
            );
            const displayPageNumbers = resolveDisplayPageNumbers(physicalPages, settings.pageNumbers);
            const actualHeadingPages = getHeadingDisplayPageNumbers(physicalPages, displayPageNumbers);
            return {
              result: physicalPages,
              headingPages: Object.fromEntries(
                headings.map(({ id }) => [id, actualHeadingPages[id] ?? settings.pageNumbers.startAt]),
              ),
            };
          }, initialPages);
          setPages(result.result);
          setCurrentPage((current) => Math.min(current, Math.max(1, result.result.length)));
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
    settings.theme,
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
    settings.cover.enabled,
    settings.pageNumbers,
    onPaginationReady,
    renderError,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measureFitScale = () => {
      const styles = window.getComputedStyle(viewport);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const availableWidth = viewport.clientWidth - horizontalPadding;
      const pageWidth = dimensions.widthMm * PX_PER_MM;
      if (availableWidth <= 0 || pageWidth <= 0) return;
      const nextScale = Math.min(1, availableWidth / pageWidth);
      setFitScale((current) => Math.abs(current - nextScale) < 0.001 ? current : nextScale);
    };

    const observer = new ResizeObserver(measureFitScale);
    observer.observe(viewport);
    measureFitScale();
    return () => observer.disconnect();
  }, [dimensions.widthMm]);

  const pageIdentity = pages.map((page) => page.id).join("\u0000");

  useEffect(() => {
    const viewport = viewportRef.current;
    const pageElements = pageRefs.current.slice(0, pages.length);
    if (!viewport || pageElements.length === 0) return;

    const pageIndexes = new Map(pageElements.map((element, index) => [element, index + 1]));
    const visibleAreas = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = pageIndexes.get(entry.target as HTMLElement);
        if (pageNumber !== undefined) {
          visibleAreas.set(
            pageNumber,
            entry.isIntersecting ? entry.intersectionRect.width * entry.intersectionRect.height : 0,
          );
        }
      }

      let predominantPage = 0;
      let predominantArea = 0;
      for (const [pageNumber, area] of visibleAreas) {
        if (area > predominantArea) {
          predominantPage = pageNumber;
          predominantArea = area;
        }
      }
      if (predominantPage > 0) {
        setCurrentPage((current) => current === predominantPage ? current : predominantPage);
      }
    }, {
      root: viewport,
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });

    pageElements.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pageIdentity, pages.length]);

  const effectiveScale = zoomMode === "fit" ? fitScale : ZOOM_LEVELS[manualZoomIndex] / 100;
  const zoomPercentage = Math.round(effectiveScale * 100);

  const navigateToPage = useCallback((pageNumber: number) => {
    const viewport = viewportRef.current;
    const page = pageRefs.current[pageNumber - 1];
    if (!viewport || !page) return;

    const viewportBounds = viewport.getBoundingClientRect();
    const styles = window.getComputedStyle(viewport);
    const contentTop = viewportBounds.top + viewport.clientTop + Number.parseFloat(styles.paddingTop);
    const top = viewport.scrollTop + page.getBoundingClientRect().top - contentTop;
    viewport.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, []);

  const changeZoom = (direction: -1 | 1) => {
    const currentIndex = zoomMode === "manual"
      ? manualZoomIndex
      : ZOOM_LEVELS.reduce((closest, level, index) =>
        Math.abs(level / 100 - fitScale) < Math.abs(ZOOM_LEVELS[closest] / 100 - fitScale) ? index : closest,
      0);
    const nextIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, currentIndex + direction));
    setManualZoomIndex(nextIndex);
    setZoomMode("manual");
  };

  const typographyStyle = {
    "--doc-font-family": getDocumentFontStack(
      fontLoadFailed ? "Arial" : fontFamily,
    ),
    "--doc-font-size": `${fontSize}pt`,
    "--doc-line-height": settings.typography.lineHeight,
    "--doc-text-align": settings.typography.alignment,
  } as CSSProperties;
  const theme = getDocumentThemeDefinition(settings.theme);
  const documentThemeClass = `document-theme ${theme.className}`;
  const pageStyle = {
    width: `${dimensions.widthMm}mm`,
    height: `${dimensions.heightMm}mm`,
    padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
    marginLeft: `-${dimensions.widthMm / 2}mm`,
    transform: `scale(${effectiveScale})`,
    transformOrigin: "top center",
    ...typographyStyle,
  } as CSSProperties;
  const contentStyle = {
    "--document-content-height": `${contentHeightMm}mm`,
    ...typographyStyle,
  } as CSSProperties;
  const marginSummary = `${settings.margins.top}/${settings.margins.right}/${settings.margins.bottom}/${settings.margins.left} mm`;
  const printPageStyle = `@page { size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm; margin: 0; }`;
  const displayPageNumbers = resolveDisplayPageNumbers(pages, settings.pageNumbers);
  const displayedCurrentPage = pages.length > 0 ? Math.min(currentPage, pages.length) : 0;

  return (
    <>
      <header className="preview-toolbar flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <h2 id="preview-heading" className="text-sm font-medium text-foreground">Preview</h2>
          <span className="font-mono text-xs text-muted">Live</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          <div role="group" aria-label={`Page ${displayedCurrentPage} of ${pages.length}`} className="flex items-center gap-1">
            <Tooltip delay={500}>
              <Button
                isIconOnly
                isDisabled={pages.length <= 1 || displayedCurrentPage <= 1}
                aria-label="Previous page"
                onPress={() => navigateToPage(Math.max(1, displayedCurrentPage - 1))}
                variant="tertiary"
                size="sm"
                className="size-8 min-w-8 p-0 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Button>
              <Tooltip.Content>Previous page</Tooltip.Content>
            </Tooltip>
            <span className="min-w-[3.5rem] text-center font-mono text-xs tabular-nums text-foreground">
              <span className="sr-only">Page {displayedCurrentPage} of {pages.length}</span>
              <span aria-hidden="true">{pages.length === 0 ? "—" : displayedCurrentPage} / {pages.length}</span>
            </span>
            <Tooltip delay={500}>
              <Button
                isIconOnly
                isDisabled={pages.length <= 1 || displayedCurrentPage >= pages.length}
                aria-label="Next page"
                onPress={() => navigateToPage(Math.min(pages.length, displayedCurrentPage + 1))}
                variant="tertiary"
                size="sm"
                className="size-8 min-w-8 p-0 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
              <Tooltip.Content>Next page</Tooltip.Content>
            </Tooltip>
          </div>

          <span aria-hidden="true" className="h-5 w-px bg-border" />

          <div role="group" aria-label="Preview zoom controls" className="flex items-center gap-1">
            <Tooltip delay={500}>
              <Button
                isIconOnly
                isDisabled={zoomPercentage <= ZOOM_LEVELS[0]}
                aria-label="Zoom out"
                onPress={() => changeZoom(-1)}
                variant="tertiary"
                size="sm"
                className="size-8 min-w-8 p-0 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ZoomOut aria-hidden="true" className="size-4" />
              </Button>
              <Tooltip.Content>Zoom out</Tooltip.Content>
            </Tooltip>
            <span className="min-w-[3rem] text-center font-mono text-xs tabular-nums text-foreground">
              <span className="sr-only">Zoom {zoomPercentage}%</span>
              <span aria-hidden="true">{zoomPercentage}%</span>
            </span>
            <Tooltip delay={500}>
              <Button
                isIconOnly
                isDisabled={zoomPercentage >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                aria-label="Zoom in"
                onPress={() => changeZoom(1)}
                variant="tertiary"
                size="sm"
                className="size-8 min-w-8 p-0 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ZoomIn aria-hidden="true" className="size-4" />
              </Button>
              <Tooltip.Content>Zoom in</Tooltip.Content>
            </Tooltip>
            <Button
              aria-pressed={zoomMode === "fit"}
              onPress={() => setZoomMode("fit")}
              variant="tertiary"
              size="sm"
              className="ms-1 h-8 min-w-10 px-2 text-xs aria-pressed:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-accent"
            >
              Fit
            </Button>
          </div>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="preview-canvas flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 sm:py-7"
      >
        <style media="print">{printPageStyle}</style>
        <div
          className="page-list flex w-max min-w-full shrink-0 flex-col items-center gap-[18px]"
          data-toc-stabilization-passes={tocPasses}
        >
          {pages.map((page, index) => (
            <div
              key={page.id}
              className="page-stage shrink-0"
              style={{
                width: `${physicalWidthPx * effectiveScale}px`,
                height: `${(physicalHeightPx + page.overflowPx) * effectiveScale}px`,
                "--page-width": `${dimensions.widthMm}mm`,
                "--page-height": `${dimensions.heightMm}mm`,
              } as CSSProperties}
            >
              <article
                ref={(element) => { pageRefs.current[index] = element; }}
                className={`physical-page${page.overflowPx > 0.5 ? " physical-page-overflow" : ""}`}
                style={pageStyle}
                aria-label={`Page ${index + 1}${page.isBlank ? ", blank" : ""}`}
                data-page-kind={page.kind ?? "content"}
              >
              {page.kind === "cover" ? (
                <div
                  className={`${documentThemeClass} document-cover-theme`}
                  data-docmark-theme={theme.id}
                  style={{ ...contentStyle, ...getDocumentCoverStyle(settings.margins) }}
                >
                  <DocumentCover settings={settings.cover} />
                </div>
              ) : <div
                className={`${documentThemeClass} document-content`}
                data-docmark-theme={theme.id}
                style={contentStyle}
                dangerouslySetInnerHTML={{ __html: page.html }}
              />}
              <PageDecorations
                settings={settings.pageNumbers}
                displayPageNumber={displayPageNumbers[index] ?? null}
                header={settings.header}
                footer={settings.footer}
                leftMarginMm={settings.margins.left}
                rightMarginMm={settings.margins.right}
                topMarginMm={settings.margins.top}
                bottomMarginMm={settings.margins.bottom}
                pageKind={page.kind ?? "content"}
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
          className={`${documentThemeClass} document-content`}
          data-docmark-theme={theme.id}
          style={contentStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div
          ref={measurementRef}
          className={`${documentThemeClass} document-content`}
          data-docmark-theme={theme.id}
          style={contentStyle}
        />
      </div>
      </div>
    </>
  );
}
