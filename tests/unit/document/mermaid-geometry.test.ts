import { describe, expect, it } from "vitest";
import { fitDiagramSize } from "@/lib/document/mermaid-geometry";

describe("Mermaid diagram geometry", () => {
  it("does not upscale diagrams smaller than the printable content box", () => {
    expect(fitDiagramSize({ width: 320, height: 180 }, { width: 600, height: 700 }))
      .toEqual({ width: 320, height: 180 });
  });

  it("scales a wide diagram to available width and preserves its ratio", () => {
    expect(fitDiagramSize({ width: 1200, height: 400 }, { width: 600, height: 800 }))
      .toEqual({ width: 600, height: 200 });
  });

  it("scales a tall diagram to available page height", () => {
    expect(fitDiagramSize({ width: 300, height: 1800 }, { width: 600, height: 900 }))
      .toEqual({ width: 150, height: 900 });
  });

  it("uses the smaller constraint when a diagram is both too wide and too tall", () => {
    expect(fitDiagramSize({ width: 1600, height: 1200 }, { width: 800, height: 400 }))
      .toEqual({ width: 533.3333333333333, height: 400 });
  });
});
