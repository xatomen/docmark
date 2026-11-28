#!/usr/bin/env python3
"""Generate compact Unicode cmap coverage for the checked-in native PDF TTFs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
import fontTools


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "src/lib/pdf/fonts/registry.ts"
DEFAULT_OUTPUT = ROOT / "src/lib/pdf/fonts/coverage.generated.json"
NATIVE_FONT_PREFIXES = (
    "public/fonts/liberation/",
    "public/fonts/liberation-serif/",
    "public/fonts/liberation-mono/",
    "public/fonts/pdf/",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ranges_for(codepoints: set[int]) -> list[list[int]]:
    ranges: list[list[int]] = []
    for point in sorted(codepoints):
        if ranges and point == ranges[-1][1] + 1:
            ranges[-1][1] = point
        else:
            ranges.append([point, point])
    return ranges


def registry_assets() -> dict[str, str]:
    source = REGISTRY.read_text(encoding="utf-8")
    return {
        path: checksum
        for path, checksum in re.findall(r'asset\("(/fonts/[^"\n]+\.ttf)", "([a-f0-9]{64})"\)', source)
    }


def generate() -> dict[str, object]:
    registered = registry_assets()
    paths = sorted(
        file for prefix in NATIVE_FONT_PREFIXES
        for file in (ROOT / prefix).rglob("*.ttf")
    )
    found = {"/" + path.relative_to(ROOT / "public").as_posix(): path for path in paths}
    if set(found) != set(registered):
        missing = sorted(set(registered) - set(found))
        unregistered = sorted(set(found) - set(registered))
        raise RuntimeError(f"Registry/coverage font list differs. Missing files: {missing}; unregistered TTFs: {unregistered}")

    assets: dict[str, object] = {}
    for public_path, file_path in sorted(found.items()):
        actual_hash = sha256(file_path)
        if actual_hash != registered[public_path]:
            raise RuntimeError(f"Registry SHA-256 is stale for {public_path}: {actual_hash}")
        font = TTFont(file_path, lazy=False, recalcBBoxes=False, recalcTimestamp=False)
        try:
            if "cmap" not in font:
                raise RuntimeError(f"No cmap table in {public_path}")
            glyph_ids = font.getReverseGlyphMap()
            mapped: set[int] = set()
            for table in font["cmap"].tables:
                if not table.isUnicode():
                    continue
                for point, glyph_name in table.cmap.items():
                    if not (0 <= point <= 0x10FFFF) or 0xD800 <= point <= 0xDFFF:
                        continue
                    glyph_id = glyph_ids.get(glyph_name, 0)
                    if glyph_id > 0 and glyph_name != ".notdef":
                        mapped.add(point)
            assets[public_path] = {
                "sha256": actual_hash,
                "bytes": file_path.stat().st_size,
                "codePoints": len(mapped),
                "ranges": ranges_for(mapped),
            }
        finally:
            font.close()

    return {
        "schemaVersion": 1,
        "generator": "scripts/generate-pdf-font-coverage.py",
        "fontToolsVersion": fontTools.__version__,
        "cmapPolicy": "Unicode cmap subtables; valid Unicode scalar values mapped to non-.notdef glyph IDs; merged inclusive ranges",
        "assets": assets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail if the tracked coverage metadata is missing or stale")
    args = parser.parse_args()
    output = generate()
    rendered = json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            print(f"Font coverage metadata is missing or stale: {args.output}", file=sys.stderr)
            return 1
        print(f"Font coverage metadata is current ({args.output.stat().st_size} bytes)")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Generated {len(output['assets'])} font coverage records ({args.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
