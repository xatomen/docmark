export type PaginatedPage = {
  id: string;
  html: string;
  isBlank: boolean;
  overflowPx: number;
};

type Measure = (nodes: HTMLElement[]) => number;

const PAGE_BREAK_ATTRIBUTE = "data-docmark-page-break";

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isPageBreak(node: Node): boolean {
  return isElement(node) && node.hasAttribute(PAGE_BREAK_ATTRIBUTE);
}

function isHeading(node: HTMLElement): boolean {
  return /^H[1-6]$/.test(node.tagName);
}

function cloneNodes(nodes: HTMLElement[]): HTMLElement[] {
  return nodes.map((node) => node.cloneNode(true) as HTMLElement);
}

function serializeNodes(nodes: HTMLElement[]): string {
  const wrapper = document.createElement("div");
  wrapper.append(...cloneNodes(nodes));
  return wrapper.innerHTML;
}

function textPositions(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const positions: { node: Text; start: number; end: number }[] = [];
  let length = 0;
  let current = walker.nextNode();

  while (current) {
    const node = current as Text;
    const start = length;
    length += node.data.length;
    positions.push({ node, start, end: length });
    current = walker.nextNode();
  }

  return { positions, length };
}

function fragmentByTextRange(
  element: HTMLElement,
  positions: ReturnType<typeof textPositions>["positions"],
  start: number,
  end: number,
): HTMLElement | null {
  const first = positions.find((position) => start < position.end);
  const last = [...positions].reverse().find((position) => end > position.start);
  if (!first || !last) return null;

  const range = document.createRange();
  range.setStart(first.node, Math.max(0, start - first.start));
  range.setEnd(last.node, Math.min(last.node.data.length, end - last.start));

  const fragment = element.cloneNode(false) as HTMLElement;
  fragment.append(range.cloneContents());

  if (element.tagName === "TABLE" && start > 0) {
    const head = element.querySelector("thead");
    if (head && !fragment.querySelector("thead")) {
      fragment.insertBefore(head.cloneNode(true), fragment.firstChild);
    }
  }

  return fragment;
}

function preferredBreak(
  element: HTMLElement,
  positions: ReturnType<typeof textPositions>["positions"],
  start: number,
  end: number,
): number {
  const text = positions
    .map(({ node }) => node.data)
    .join("")
    .slice(start, end);
  const lowerBound = Math.floor(text.length * 0.65);
  const isCode = element.tagName === "PRE";
  const preferred = isCode ? text.lastIndexOf("\n") : -1;
  const whitespace = text.search(/\s(?=[^\s]*$)/);
  const split = preferred >= lowerBound ? preferred + 1 : whitespace;
  return split >= lowerBound ? start + split : end;
}

/** Split rendered text at DOM range boundaries using actual layout measurements. */
function splitByText(
  element: HTMLElement,
  measure: Measure,
  maxHeight: number,
): HTMLElement[] {
  const { positions, length } = textPositions(element);
  if (length === 0) return [element.cloneNode(true) as HTMLElement];

  const fragments: HTMLElement[] = [];
  let start = 0;

  while (start < length) {
    let low = start + 1;
    let high = length;
    let best = start;

    while (low <= high) {
      const end = Math.floor((low + high) / 2);
      const candidate = fragmentByTextRange(element, positions, start, end);
      if (candidate && measure([candidate]) <= maxHeight + 0.5) {
        best = end;
        low = end + 1;
      } else {
        high = end - 1;
      }
    }

    // A single glyph can itself be taller than the usable page area. Consume it
    // anyway so malformed or oversized input can never stall pagination.
    const end = best === start ? start + 1 : preferredBreak(element, positions, start, best);
    const fragment = fragmentByTextRange(element, positions, start, end);
    if (!fragment) return [element.cloneNode(true) as HTMLElement];
    fragments.push(fragment);
    start = end;
  }

  return fragments;
}

function wrapListItem(list: HTMLElement, item: HTMLElement, startIndex: number) {
  const fragment = list.cloneNode(false) as HTMLElement;
  if (list.tagName === "OL") {
    const initial = Number(list.getAttribute("start") ?? 1);
    fragment.setAttribute("start", String(initial + startIndex));
  }
  fragment.append(item.cloneNode(true));
  return fragment;
}

function splitList(
  list: HTMLElement,
  measure: Measure,
  maxHeight: number,
): HTMLElement[] {
  const items = Array.from(list.children).filter(
    (child): child is HTMLElement => child.tagName === "LI",
  );
  if (items.length === 0) return splitByText(list, measure, maxHeight);

  const result: HTMLElement[] = [];
  let group: HTMLElement[] = [];
  const flush = () => {
    if (!group.length) return;
    const fragment = list.cloneNode(false) as HTMLElement;
    const index = items.indexOf(group[0]);
    if (list.tagName === "OL") {
      fragment.setAttribute("start", String(Number(list.getAttribute("start") ?? 1) + index));
    }
    fragment.append(...cloneNodes(group));
    result.push(fragment);
    group = [];
  };

  items.forEach((item, index) => {
    const candidate = [...group, item];
    if (measure([wrapListGroup(list, candidate, index - group.length)]) <= maxHeight + 0.5) {
      group = candidate;
      return;
    }

    flush();
    const single = wrapListItem(list, item, index);
    if (measure([single]) <= maxHeight + 0.5) {
      group = [item];
      return;
    }

    const splitItem = splitByText(item, (nodes) => measure([wrapListItem(list, nodes[0], index)]), maxHeight);
    splitItem.forEach((part) => {
      const wrapped = wrapListItem(list, part, index);
      if (group.length) flush();
      result.push(wrapped);
    });
  });

  flush();
  return result;
}

function wrapListGroup(list: HTMLElement, items: HTMLElement[], startIndex: number) {
  const fragment = list.cloneNode(false) as HTMLElement;
  if (list.tagName === "OL") {
    fragment.setAttribute("start", String(Number(list.getAttribute("start") ?? 1) + startIndex));
  }
  fragment.append(...cloneNodes(items));
  return fragment;
}

function splitTable(table: HTMLElement, measure: Measure, maxHeight: number) {
  const rows = Array.from(table.querySelectorAll("tbody tr, tr"));
  if (rows.length < 2) return splitByText(table, measure, maxHeight);

  const head = table.querySelector("thead");
  const shell = () => {
    const fragment = table.cloneNode(false) as HTMLElement;
    for (const child of Array.from(table.children)) {
      if (child.tagName === "CAPTION" || child.tagName === "COLGROUP") {
        fragment.append(child.cloneNode(true));
      }
    }
    if (head) fragment.append(head.cloneNode(true));
    return fragment;
  };

  const result: HTMLElement[] = [];
  let currentRows: Element[] = [];
  const build = (selectedRows: Element[]) => {
    const fragment = shell();
    const groups = new Map<Element, HTMLElement>();
    for (const row of selectedRows) {
      const parent = row.parentElement;
      if (!parent || parent.tagName === "THEAD") continue;
      let group = groups.get(parent);
      if (!group) {
        group = parent.cloneNode(false) as HTMLElement;
        fragment.append(group);
        groups.set(parent, group);
      }
      group.append(row.cloneNode(true));
    }
    return fragment;
  };
  const flush = () => {
    if (currentRows.length) result.push(build(currentRows));
    currentRows = [];
  };

  rows.filter((row) => row.parentElement?.tagName !== "THEAD").forEach((row) => {
    const candidateRows = [...currentRows, row];
    if (measure([build(candidateRows)]) <= maxHeight + 0.5) {
      currentRows = candidateRows;
      return;
    }
    flush();
    const single = build([row]);
    if (measure([single]) <= maxHeight + 0.5) {
      currentRows = [row];
      return;
    }

    const splitRow = splitByText(row as HTMLElement, (nodes) => measure([build([nodes[0]])]), maxHeight);
    splitRow.forEach((part) => result.push(build([part])));
  });

  flush();
  return result.length ? result : splitByText(table, measure, maxHeight);
}

function splitOversized(node: HTMLElement, measure: Measure, maxHeight: number) {
  if (node.tagName === "UL" || node.tagName === "OL") {
    return splitList(node, measure, maxHeight);
  }
  if (node.tagName === "TABLE") return splitTable(node, measure, maxHeight);
  return splitByText(node, measure, maxHeight);
}

/**
 * Paginate sanitized rendered DOM. Measurement is performed by the caller's
 * offscreen, physically sized document-theme element. Character-range splits
 * preserve valid element nesting; unbreakable media or text falls back to one
 * overflowing fragment after consuming the source node, guaranteeing progress.
 */
export function paginateDocument(
  renderedContent: HTMLElement,
  measurementContent: HTMLElement,
  contentHeightPx: number,
): PaginatedPage[] {
  const measure: Measure = (nodes) => {
    measurementContent.replaceChildren(...cloneNodes(nodes));
    return measurementContent.getBoundingClientRect().height;
  };
  const sourceNodes = Array.from(renderedContent.childNodes).filter((node) => {
    return isElement(node) || node.textContent?.trim();
  });
  const blocks = sourceNodes.map((node) => node as HTMLElement);
  const pages: { html: string; overflowPx: number }[] = [];
  let current: HTMLElement[] = [];

  const flush = () => {
    const height = current.length ? measure(current) : 0;
    pages.push({
      html: current.length ? serializeNodes(current) : "",
      overflowPx: Math.max(0, height - contentHeightPx),
    });
    current = [];
  };
  const addFragments = (fragments: HTMLElement[]) => {
    for (const fragment of fragments) {
      if (measure([...current, fragment]) <= contentHeightPx + 0.5) {
        current.push(fragment);
      } else if (current.length) {
        flush();
        if (measure([fragment]) <= contentHeightPx + 0.5) {
          current.push(fragment);
        } else {
          // Safe progress fallback for indivisible content (for example one
          // extremely tall image or a glyph larger than the page itself).
          current.push(fragment);
        }
      } else {
        current.push(fragment);
      }
    }
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (isPageBreak(block)) {
      flush();
      continue;
    }

    const next = blocks[index + 1];
    if (isHeading(block) && next && !isPageBreak(next) && current.length) {
      if (measure([...current, block, next]) > contentHeightPx + 0.5) {
        flush();
      }
    }

    if (measure([...current, block]) <= contentHeightPx + 0.5) {
      current.push(block);
      continue;
    }

    const headingNeedsNext =
      current.length === 1 && isHeading(current[0]) && !isHeading(block);
    if (current.length && !headingNeedsNext) flush();

    if (measure([...current, block]) <= contentHeightPx + 0.5) {
      current.push(block);
      continue;
    }

    const availableHeight = Math.max(
      1,
      contentHeightPx - (current.length ? measure(current) : 0),
    );
    const fragments = splitOversized(block, measure, availableHeight);
    addFragments(fragments);
  }

  if (current.length || pages.length === 0 || isPageBreak(blocks[blocks.length - 1])) {
    const height = current.length ? measure(current) : 0;
    pages.push({
      html: current.length ? serializeNodes(current) : "",
      overflowPx: Math.max(0, height - contentHeightPx),
    });
  }

  return pages.map((page, index) => ({
    id: `page-${index + 1}`,
    html: page.html,
    isBlank: page.html === "",
    overflowPx: page.overflowPx,
  }));
}
