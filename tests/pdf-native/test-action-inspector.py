from io import BytesIO
import sys
from pathlib import Path

from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    DictionaryObject,
    NameObject,
    RectangleObject,
    TextStringObject,
)

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from inspect_pdf_actions import inspect_reader


def make_pdf(mutator=None, annotation=None):
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    if mutator:
        mutator(writer, page)
    if annotation:
        writer.add_annotation(page, annotation)
    stream = BytesIO()
    writer.write(stream)
    from pypdf import PdfReader
    return PdfReader(BytesIO(stream.getvalue()))


def action(action_type, **extra):
    result = DictionaryObject({NameObject("/S"): NameObject(action_type)})
    for key, value in extra.items():
        result[NameObject(key)] = value
    return result


def link_annotation(uri, next_action=None):
    destination = action("/URI", **{"/URI": TextStringObject(uri)})
    if next_action is not None:
        destination[NameObject("/Next")] = next_action
    return {
        "/Type": "/Annot",
        "/Subtype": "/Link",
        "/Rect": RectangleObject([0, 0, 100, 20]),
        "/A": destination,
    }


SAFE = "https://example.test/path"

reader = make_pdf(annotation=link_annotation(SAFE))
assert inspect_reader(reader, [SAFE])["permittedUriActions"] == [SAFE]

bad_cases = {
    "catalog open JavaScript": lambda writer, page: writer._root_object.update({NameObject("/OpenAction"): action("/JavaScript", **{"/JS": TextStringObject("app.alert(1)")})}),
    "named JavaScript tree": lambda writer, page: writer._root_object.update({NameObject("/Names"): DictionaryObject({NameObject("/JavaScript"): DictionaryObject({NameObject("/Names"): ArrayObject([TextStringObject("run"), action("/JavaScript", **{"/JS": TextStringObject("alert(1)")})])})})}),
    "embedded file name tree": lambda writer, page: writer._root_object.update({NameObject("/Names"): DictionaryObject({NameObject("/EmbeddedFiles"): DictionaryObject({NameObject("/Names"): ArrayObject([])})})}),
    "page additional Launch action": lambda writer, page: page.update({NameObject("/AA"): DictionaryObject({NameObject("/O"): action("/Launch", **{"/F": TextStringObject("bad.exe")})})}),
    "associated files": lambda writer, page: writer._root_object.update({NameObject("/AF"): ArrayObject([DictionaryObject({NameObject("/Type"): NameObject("/Filespec"), NameObject("/F"): TextStringObject("x.txt"), NameObject("/EF"): DictionaryObject()})])}),
}

for label, mutate in bad_cases.items():
    try:
        inspect_reader(make_pdf(mutator=mutate))
    except ValueError:
        continue
    raise AssertionError(f"inspector accepted prohibited fixture: {label}")

for label, annotation in [
    ("unsafe URI", link_annotation("https://example.test.evil/path")),
    ("chained JavaScript", link_annotation(SAFE, action("/JavaScript", **{"/JS": TextStringObject("alert(1)")}))),
    ("array action chain", {"/Type": "/Annot", "/Subtype": "/Link", "/Rect": RectangleObject([0, 0, 20, 20]), "/A": ArrayObject([action("/URI", **{"/URI": TextStringObject(SAFE)}), action("/URI", **{"/URI": TextStringObject(SAFE)})])}),
    ("file attachment", {"/Type": "/Annot", "/Subtype": "/FileAttachment", "/Rect": RectangleObject([0, 0, 20, 20]), "/FS": DictionaryObject({NameObject("/Type"): NameObject("/Filespec")})}),
]:
    try:
        inspect_reader(make_pdf(annotation=annotation), [SAFE])
    except ValueError:
        continue
    raise AssertionError(f"inspector accepted prohibited fixture: {label}")

print("PDF action inspector adversarial fixtures rejected")
