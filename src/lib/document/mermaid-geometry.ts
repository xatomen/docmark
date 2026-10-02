export type DiagramSize = { width: number; height: number };

export function fitDiagramSize(
  intrinsic: DiagramSize,
  available: DiagramSize,
): DiagramSize {
  if (
    !Number.isFinite(intrinsic.width) ||
    !Number.isFinite(intrinsic.height) ||
    intrinsic.width <= 0 ||
    intrinsic.height <= 0 ||
    available.width <= 0 ||
    available.height <= 0
  ) return { width: 0, height: 0 };

  const scale = Math.min(1, available.width / intrinsic.width, available.height / intrinsic.height);
  return { width: intrinsic.width * scale, height: intrinsic.height * scale };
}

export function readSvgIntrinsicSize(svg: SVGSVGElement): DiagramSize | null {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const parseLength = (value: string | null) => {
    const match = value?.trim().match(/^([\d.]+)(?:px)?$/i);
    const number = match ? Number(match[1]) : NaN;
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const width = parseLength(svg.getAttribute("width"));
  const height = parseLength(svg.getAttribute("height"));
  return width && height ? { width, height } : null;
}

export function fitMermaidBlocks(
  content: HTMLElement,
  available: DiagramSize,
): void {
  for (const svg of Array.from(content.querySelectorAll<SVGSVGElement>(".docmark-mermaid svg"))) {
    const intrinsic = readSvgIntrinsicSize(svg);
    if (!intrinsic) continue;
    const fitted = fitDiagramSize(intrinsic, available);
    if (!fitted.width || !fitted.height) continue;
    svg.setAttribute("width", String(fitted.width));
    svg.setAttribute("height", String(fitted.height));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}
