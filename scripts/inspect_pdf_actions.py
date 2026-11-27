#!/usr/bin/env python3
"""Strict, PoC-scoped PDF action and attachment inspection using pypdf."""
import argparse
import json
from urllib.parse import urlsplit

from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

FORBIDDEN_KEYS = {"/AA", "/JS", "/JavaScript", "/EmbeddedFiles", "/EF", "/AF"}
FILE_TYPES = {"/EmbeddedFile", "/Filespec"}
FILE_ANNOTATIONS = {"/FileAttachment"}


def dereference(value):
    return value.get_object() if isinstance(value, IndirectObject) else value


def validate_uri(value, expected_uris):
    uri = str(value)
    parts = urlsplit(uri)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.username or parts.password:
        raise ValueError(f"unsafe URI action: {uri!r}")
    if uri not in expected_uris:
        raise ValueError(f"unexpected URI destination: {uri!r}")


def inspect_reader(reader, expected_uris=()):
    expected_uris = set(expected_uris)
    seen = set()
    permitted_uris = []

    def inspect_action(value):
        value = dereference(value)
        if isinstance(value, ArrayObject):
            raise ValueError("array action chains are not allowed")
        if not isinstance(value, DictionaryObject):
            raise ValueError("PDF action must be a dictionary")
        marker = id(value)
        if marker in seen:
            return
        seen.add(marker)
        for key in FORBIDDEN_KEYS:
            if key in value:
                raise ValueError(f"forbidden PDF action structure: {key}")
        if "/Next" in value:
            inspect_action(value["/Next"])
            raise ValueError("chained /Next actions are not allowed")
        action_type = str(value.get("/S", ""))
        if action_type != "/URI":
            raise ValueError(f"unexpected PDF action type: {action_type or '(missing)'}")
        validate_uri(value.get("/URI", ""), expected_uris)
        permitted_uris.append(str(value["/URI"]))
        for key, item in value.items():
            if str(key) not in {"/S", "/URI"}:
                inspect_object(item)

    def inspect_object(value):
        value = dereference(value)
        marker = id(value)
        if marker in seen:
            return
        seen.add(marker)
        if isinstance(value, DictionaryObject):
            for key in FORBIDDEN_KEYS:
                if key in value:
                    raise ValueError(f"forbidden PDF structure: {key}")
            object_type = str(value.get("/Type", ""))
            if object_type in FILE_TYPES:
                raise ValueError(f"file specification or embedded file found: {object_type}")
            if str(value.get("/Subtype", "")) in FILE_ANNOTATIONS:
                raise ValueError("file attachment annotation found")
            if str(value.get("/Subtype", "")) == "/Link" and "/Dest" in value:
                raise ValueError("internal link destinations are not supported in this PoC")
            if "/OpenAction" in value:
                raise ValueError("catalog or object /OpenAction found")
            for key, item in value.items():
                if str(key) == "/A":
                    inspect_action(item)
                elif str(key) == "/Next":
                    inspect_action(item)
                else:
                    inspect_object(item)
        elif isinstance(value, ArrayObject):
            for item in value:
                inspect_object(item)

    root = reader.trailer["/Root"]
    inspect_object(root)
    return {
        "permittedUriActions": permitted_uris,
        "attachments": False,
        "javascript": False,
        "additionalActions": False,
        "chainedActions": False,
        "openActions": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--allow-uri", action="append", default=[])
    args = parser.parse_args()
    result = inspect_reader(PdfReader(args.pdf), args.allow_uri)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
