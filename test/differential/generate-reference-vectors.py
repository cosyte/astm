#!/usr/bin/env python3
# Generate the differential reference vectors from python-astm — firsthand, not by hand.
#
# python-astm is the BSD-licensed reference ASTM/CLSI-LIS02 codec by Alexander Shorin
# (https://github.com/kxepal/python-astm). This script imports it and captures its output for a
# fixed synthetic corpus, writing `reference-vectors.json`. The TypeScript differential test
# (`differential.test.ts`) then asserts `@cosyte/astm` agrees with those captured vectors on the
# paths both implementations share, and documents where we are deliberately stricter.
#
# We do NOT vendor python-astm into this repo — we capture its outputs once, firsthand, and pin the
# reference commit below so the vectors are reproducible. Regenerate with:
#
#     git clone https://github.com/kxepal/python-astm && cd python-astm
#     git checkout 4170ce0c56567298e55b797d22357d9437087f94
#     PYTHONPATH=. python3 /path/to/generate-reference-vectors.py > /path/to/reference-vectors.json
#
# Reference commit: 4170ce0c56567298e55b797d22357d9437087f94 (2024-04-11).
# License: BSD-3-Clause (see python-astm COPYING). Only OUTPUTS are captured here; no code is copied.

import json
import sys

from astm import codec

ENC = "latin-1"
REF_COMMIT = "4170ce0c56567298e55b797d22357d9437087f94"


def normalize_field(field):
    """python-astm decode_record -> a canonical repeats[components[str]] shape.

    python represents an empty field/component as None, a scalar as a str, a componentized field as
    a list of (str|None), and a repeated field as a list of lists. We fold all four into the same
    repeats-of-components shape @cosyte/astm's tokenizer produces, with '' for an empty leaf, so the
    two can be compared structurally.
    """
    if field is None:
        return [[""]]
    if isinstance(field, str):
        return [[field]]
    # list: repeats (list-of-list) or components (list of str|None)
    if any(isinstance(x, list) for x in field):
        return [[(c if c is not None else "") for c in rep] for rep in field]
    return [[(c if c is not None else "") for c in field]]


# --- Corpus 1: modulo-256 checksum over frame-span byte strings ------------------------------------
# The span python-astm sums is exactly the bytes after STX up to and including the ETB/ETX terminator
# (see codec.split: make_checksum over  frame_number + text + ETB|ETX ). We capture the checksum for a
# set of spans and let the TS side recompute independently.
checksum_spans = [
    b"1H|\\^&\r\x03",
    b"1R|1|^^^687|28.6|U/L|10-40|H||F\r\x03",
    b"2P|1|PRAC|LAB|||Doe^John^Q||19700101|M\r\x03",
    b"1L|1|N\r\x03",
    b"7Q|1|^SPEC-7|^SPEC-7|ALL\r\x03",
    b"0\x17",  # frame number 0 + ETB, empty text (rollover edge)
    b"3C|1|I|instrument note|G\r\x03",
]
checksums = [
    {"spanHex": span.hex(), "checksum": codec.make_checksum(span).decode("ascii")}
    for span in checksum_spans
]

# --- Corpus 2: record field/component split on escape-free, non-header records ----------------------
# Both codecs split on |, \, ^. python-astm does NOT un-escape &F&/&S&/&R&/&E& (it has no escape
# decode at all), so we restrict the AGREEMENT corpus to records with no escape sequences. The header
# record is excluded because its `\^&` payload is a delimiter DECLARATION, not data — the two codecs
# model that boundary differently by design (a documented divergence, asserted separately in TS).
record_lines = [
    "P|1|PRAC|LAB|||Doe^John^Q||19700101|M",
    "R|1|^^^687|28.6|U/L|10-40|H||F",
    "R|1|^^^687|A^B|U/L",
    "R|1|a\\b\\c|x",
    "O|1|ACC||^^^687|R",
    "C|1|I|instrument note|G",
    "Q|1|^SPEC-7|^SPEC-7|ALL",
    "R|1||||||||",
]
records = [
    {
        "line": line,
        "fields": [normalize_field(f) for f in codec.decode_record(line.encode(ENC), ENC)],
    }
    for line in record_lines
]

# --- Corpus 3: 240-split (chunking) of a record into frames ----------------------------------------
# codec.split takes an already-framed message (STX + frame-number + text + terminator + CS + CRLF)
# and re-chunks its text at `size`, recomputing frame numbers and checksums. We capture the emitted
# chunk byte strings; the TS side asserts composeAstmFrames produces the same STX/FN/text/term/CS/CRLF.
def framed(text_bytes, fn=1):
    body = bytes([0x30 + fn]) + text_bytes + b"\x03"
    return b"\x02" + body + codec.make_checksum(body) + b"\r\n"


split_cases = []
for text, size in [
    (b"R|1|^^^687|28.6|U/L|10-40|H||F\r", 20),
    (b"R|1|^^^687|28.6|U/L|10-40|H||F\r", 12),
    (b"C|1|I|a longer instrument comment that must span several frames when chunked\r", 24),
]:
    chunks = [c.hex() for c in codec.split(framed(text), size)]
    split_cases.append({"textHex": text.hex(), "size": size, "chunksHex": chunks})

out = {
    "_provenance": {
        "reference": "kxepal/python-astm",
        "referenceCommit": REF_COMMIT,
        "license": "BSD-3-Clause",
        "encoding": ENC,
        "note": (
            "Outputs captured firsthand from python-astm; no reference code is vendored. "
            "The AGREEMENT corpora exclude the header declaration and any escape sequences, "
            "which the two codecs handle differently by design (see differential.test.ts)."
        ),
    },
    "checksums": checksums,
    "records": records,
    "splits": split_cases,
}

json.dump(out, sys.stdout, indent=2)
sys.stdout.write("\n")
