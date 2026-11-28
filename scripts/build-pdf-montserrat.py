#!/usr/bin/env python3
"""Build the four static PDF faces from the pinned OFL Montserrat source."""

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen

from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/fonts/pdf/docmark-signature-sans"
SOURCE = "https://raw.githubusercontent.com/JulietaUla/Montserrat/cc8daf2e7085006b9c112542fc82b58afc13521d"
INPUTS = {
    "normal": (
        "fonts/variable/Montserrat[wght].ttf",
        "1e2c44ef8c956ed66998649d8c832d221e22c04eaab63c044f18eb05d1c63b7c",
    ),
    "italic": (
        "fonts/variable/Montserrat-Italic[wght].ttf",
        "985bf47b7763a0d81c7defda5ad52771f2b36c2756db644e41b5184f1fab784f",
    ),
}
FACES = {
    "Regular": ("normal", 400),
    "Bold": ("normal", 700),
    "Italic": ("italic", 400),
    "BoldItalic": ("italic", 700),
}
# Keep the generated sfnt `head.modified` timestamp stable. fontTools updates it
# from wall-clock time during instancing, which otherwise changes the checked-in
# face hashes and coverage metadata on every reproducible rebuild.
HEAD_MODIFIED = {
    "Regular": 3_878_651_031,
    "Bold": 3_878_651_035,
    "Italic": 3_878_651_040,
    "BoldItalic": 3_878_651_045,
}


def set_names(font: TTFont, style: str) -> None:
    name_table = font["name"]
    family = "Docmark Signature Sans"
    full_name = f"{family} {style}"
    postscript_name = f"DocmarkSignatureSans-{style}"
    replacements = {
        1: family,
        2: style,
        3: f"Docmark Signature Sans Phase A {style}",
        4: full_name,
        6: postscript_name,
        16: family,
        17: style,
        18: full_name,
        21: family,
        22: style,
    }
    for name_id, value in replacements.items():
        name_table.names = [record for record in name_table.names if record.nameID != name_id]
        name_table.setName(value, name_id, 3, 1, 0x409)
        name_table.setName(value, name_id, 1, 0, 0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="docmark-pdf-fonts-") as temporary:
        sources: dict[str, Path] = {}
        for role, (relative_url, expected_hash) in INPUTS.items():
            source_path = Path(temporary) / f"source-{role}.ttf"
            encoded_url = relative_url.replace("[", "%5B").replace("]", "%5D")
            with urlopen(f"{SOURCE}/{encoded_url}") as response:
                content = response.read()
            actual_hash = sha256(content).hexdigest()
            if actual_hash != expected_hash:
                raise RuntimeError(f"Unexpected {role} source hash: {actual_hash}")
            source_path.write_bytes(content)
            sources[role] = source_path

        for style, (role, weight) in FACES.items():
            variable = TTFont(sources[role])
            static = instantiateVariableFont(variable, {"wght": weight}, inplace=False)
            static["head"].modified = HEAD_MODIFIED[style]
            static.recalcTimestamp = False
            set_names(static, style)
            static_path = OUT / f"DocmarkSignatureSans-{style}.ttf"
            static.save(static_path)
            print(f"{static_path.relative_to(ROOT)} {static_path.stat().st_size} bytes {sha256(static_path.read_bytes()).hexdigest()}")

        with urlopen(f"{SOURCE}/OFL.txt") as response:
            (OUT / "OFL.txt").write_bytes(response.read())


if __name__ == "__main__":
    main()
