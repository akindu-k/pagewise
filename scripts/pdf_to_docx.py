"""Converts a PDF to an editable .docx with pdf2docx.

Usage: python pdf_to_docx.py <input.pdf> <output.docx>

Exits 0 on success, 1 on failure (details on stderr).
"""
import logging
import os
import re
import sys
import tempfile
import zipfile

import pymupdf
from pdf2docx import Converter

# pdf2docx stores every image as PNG, which turns photos into huge files
# (a 10 MB PDF of photos became a 42 MB .docx). Opaque PNGs bigger than this
# are re-encoded as JPEG.
JPEG_MIN_BYTES = 100 * 1024
JPEG_QUALITY = 85


def shrink_images(docx_path):
    """Re-encodes large opaque PNGs in a .docx as JPEG, in place."""
    with zipfile.ZipFile(docx_path) as src:
        entries = [(info, src.read(info.filename)) for info in src.infolist()]

    renamed = {}  # "media/image1.png" -> "media/image1.jpeg"
    out = []
    for info, data in entries:
        name = info.filename
        if name.startswith("word/media/") and name.endswith(".png") and len(data) > JPEG_MIN_BYTES:
            pix = pymupdf.Pixmap(data)
            if not pix.alpha:
                jpeg = pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY)
                if len(jpeg) < len(data):
                    new_name = name[:-4] + ".jpeg"
                    renamed[name[len("word/"):]] = new_name[len("word/"):]
                    name, data = new_name, jpeg
        out.append((info, name, data))

    if not renamed:
        return

    for i, (info, name, data) in enumerate(out):
        if name.endswith(".rels"):
            text = data.decode("utf-8")
            for old, new in renamed.items():
                text = text.replace(f'Target="{old}"', f'Target="{new}"')
            out[i] = (info, name, text.encode("utf-8"))
        elif name == "[Content_Types].xml":
            text = data.decode("utf-8")
            if not re.search(r'Extension="jpeg"', text, re.IGNORECASE):
                text = text.replace(
                    "<Default ",
                    '<Default Extension="jpeg" ContentType="image/jpeg"/><Default ',
                    1,
                )
            out[i] = (info, name, text.encode("utf-8"))

    fd, tmp = tempfile.mkstemp(suffix=".docx", dir=os.path.dirname(docx_path))
    os.close(fd)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for info, name, data in out:
            # Images are already compressed; store them as-is.
            kind = zipfile.ZIP_STORED if name.startswith("word/media/") else zipfile.ZIP_DEFLATED
            dst.writestr(zipfile.ZipInfo(name, info.date_time), data, compress_type=kind)
    os.replace(tmp, docx_path)


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 1
    source, target = sys.argv[1], sys.argv[2]

    # pdf2docx logs progress for every page at INFO; keep stderr for errors.
    logging.disable(logging.INFO)

    converter = Converter(source)
    try:
        # Only rebuild tables that have drawn borders. Guessing borderless
        # ("stream") tables turns ordinary bullet lists into tables.
        converter.convert(target, parse_stream_table=False)
    finally:
        converter.close()
    shrink_images(target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
