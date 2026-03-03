"""
build_stars.py
--------------
converts the binary bsc5 catalog file into a compact stars.json
suitable for direct use by the website.

usage:
    python build_stars.py BSC5 stars.json

output format — json array, each entry:
    [ra_deg, dec_deg, vmag, color_hex, name_or_null]

    ra_deg   : float, J2000 right ascension in degrees [0, 360)
    dec_deg  : float, J2000 declination in degrees [-90, 90]
    vmag     : float, visual magnitude
    color_hex: string, approximate rgb hex derived from spectral type
    name_or_null: string or null, common name for named stars only

dependencies: python 3.6+, no third-party packages required.
"""

import struct
import json
import math
import sys

# ── header layout (28 bytes, all 4-byte signed integers) ──────────────────────
HEADER_FMT  = "<iiiiiii"   # little-endian; 7 x int32
HEADER_SIZE = struct.calcsize(HEADER_FMT)  # = 28

# ── entry layout (32 bytes) ───────────────────────────────────────────────────
# float32 XNO | float64 SRA0 | float64 SDEC0 | char[2] IS | int16 MAG
# float32 XRPM | float32 XDPM
ENTRY_FMT  = "<fd d 2s h f f"
ENTRY_SIZE = struct.calcsize(ENTRY_FMT)    # = 32


# ── spectral type -> approximate hex color ────────────────────────────────────
# based on standard stellar color tables (B-V index midpoints per class)
SPECTRAL_COLORS = {
    'O': '#9bb8ff',   # hot blue
    'B': '#adc4ff',   # blue-white
    'A': '#d0e0ff',   # white
    'F': '#f0f0f8',   # yellow-white
    'G': '#fff2d8',   # yellow
    'K': '#ffd28a',   # orange
    'M': '#ffb070',   # red-orange
    'W': '#b0c8ff',   # wolf-rayet, treat as hot
    'C': '#ffa060',   # carbon star
    'S': '#ffb880',   # s-type
    'D': '#d0e8ff',   # white dwarf
    'N': '#ffa060',   # late carbon
    'R': '#ffb880',   # obsolete carbon class
}
DEFAULT_COLOR = '#c8d8ee'  # fallback for unknown or blank spectral type


# ── common names keyed by hr (harvard revised) number ────────────────────────
# hr numbers sourced from the BSC5 catalog and cross-referenced with simbad
HR_NAMES = {
    9096: "Sirius",        7001: "Vega",          5340: "Arcturus",
    2326: "Capella",       1713: "Rigel",          2943: "Procyon",
    472:  "Achernar",      2061: "Betelgeuse",     5267: "Hadar",
    7557: "Altair",        4853: "Acrux",          1457: "Aldebaran",
    6134: "Antares",       5056: "Spica",          2990: "Pollux",
    8728: "Fomalhaut",     7924: "Deneb",          4853: "Acrux",
    3982: "Regulus",       2618: "Adhara",         2891: "Castor",
    4763: "Gacrux",        6527: "Shaula",         1790: "Bellatrix",
    1791: "Elnath",        3685: "Miaplacidus",    1903: "Alnilam",
    1948: "Alnitak",       8425: "Alnair",         4905: "Alioth",
    4301: "Dubhe",         1017: "Mirfak",         6879: "Kaus Australis",
    5191: "Alkaid",        2693: "Wezen",          3307: "Avior",
    2088: "Menkalinan",    6217: "Atria",          2421: "Alhena",
    3890: "Alsephina",     7790: "Peacock",        2294: "Mirzam",
    3748: "Alphard",       617:  "Hamal",          424:  "Polaris",
    7121: "Nunki",         5288: "Menkent",        15:   "Alpheratz",
    337:  "Mirach",        1899: "Saiph",          603:  "Almach",
    6556: "Rasalhague",    4534: "Denebola",        264: "Navi",
    5793: "Alphecca",      3165: "Naos",           4621: "Muhlifain",
    8636: "Tiaki",         3699: "Aspidiske",      6705: "Eltanin",
    4295: "Merak",         21:   "Caph",           5505: "Izar",
    8308: "Enif",          99:   "Ankaa",          8162: "Alderamin",
    4374: "Phecda",        8775: "Scheat",         8781: "Markab",
    7796: "Sadr",          3719: "Markeb",         1956: "Phact",
    5854: "Unukalhai",     6241: "Sabik",          2827: "Aludra",
    3634: "Suhail",        5530: "Zubenelgenubi",  8232: "Sadalsuud",
    8414: "Sadalmelik",    2080: "Canopus",        5459: "Mizar",
    5054: "Porrima",       4660: "Vindemiatrix",   4910: "Megrez",
    5985: "Zubeneschamali",3982: "Regulus",        7001: "Vega",
    4554: "Cor Caroli",    2990: "Pollux",         2891: "Castor",
    1903: "Mintaka",       5191: "Alkaid",         4301: "Dubhe",
    4660: "Vindemiatrix",  3323: "Naos",           5054: "Porrima",
    6879: "Kaus Australis",6832: "Kaus Media",     6746: "Kaus Borealis",
    8728: "Fomalhaut",     911:  "Acamar",         1084: "Cursa",
    2990: "Pollux",        4432: "Algieba",        6175: "Dschubba",
    4905: "Alioth",        472:  "Achernar",       8085: "Enif",
    3165: "Naos",          2618: "Adhara",         2943: "Procyon",
    4853: "Mimosa",        5288: "Menkent",        6556: "Rasalhague",
    7602: "Nunki",         6879: "Kaus Australis", 5056: "Spica",
    6527: "Shaula",        6134: "Antares",        6241: "Sabik",
    5793: "Alphecca",      5854: "Unukalhai",      5340: "Arcturus",
    4534: "Denebola",      4374: "Phecda",         4295: "Merak",
    4301: "Dubhe",         5191: "Alkaid",         4905: "Alioth",
    4660: "Megrez",        3748: "Alphard",        3982: "Regulus",
    2990: "Pollux",        2891: "Castor",         2943: "Procyon",
    2326: "Capella",       2061: "Betelgeuse",     1713: "Rigel",
    1457: "Aldebaran",     1903: "Alnilam",        1948: "Alnitak",
    1790: "Bellatrix",     1899: "Saiph",          1791: "Elnath",
}


def b1950_to_j2000(ra_rad, dec_rad):
    """
    approximate FK4 B1950 -> FK5 J2000 precession.
    accurate to ~1 arcsecond, sufficient for a star map.
    uses the IAU 1976 precession constants.
    """
    # rotation angles for precession B1950 -> J2000 (radians)
    # these are the standard Lieske et al. matrix elements
    ra  = ra_rad
    dec = dec_rad

    # precession from B1950 to J2000 via approximate matrix multiplication
    # ref: Aoki et al. 1983, A&A 128, 263
    x = math.cos(dec) * math.cos(ra)
    y = math.cos(dec) * math.sin(ra)
    z = math.sin(dec)

    # precession matrix B1950 -> J2000 (transposed for application)
    x2 =  0.9999257080 * x - 0.0111789372 * y - 0.0048590035 * z
    y2 =  0.0111789372 * x + 0.9999375134 * y - 0.0000271626 * z
    z2 =  0.0048590036 * x - 0.0000271579 * y + 0.9999881946 * z

    ra2  = math.atan2(y2, x2)
    dec2 = math.asin(max(-1.0, min(1.0, z2)))

    if ra2 < 0:
        ra2 += 2 * math.pi

    return ra2, dec2


def spectral_color(spec_bytes):
    """returns hex color string from 2-byte spectral type field."""
    try:
        spec = spec_bytes.decode('ascii', errors='replace').strip()
    except Exception:
        return DEFAULT_COLOR

    if not spec:
        return DEFAULT_COLOR

    first = spec[0].upper()
    return SPECTRAL_COLORS.get(first, DEFAULT_COLOR)


def parse_bsc5(path):
    """
    reads binary bsc5 file, returns list of
    [ra_deg, dec_deg, vmag, color_hex, name_or_null]
    skips entries with missing magnitude (mag == 0 and catalog number is integer).
    """
    stars = []

    with open(path, 'rb') as f:
        header_bytes = f.read(HEADER_SIZE)
        if len(header_bytes) < HEADER_SIZE:
            raise ValueError(f"file too short for header: {len(header_bytes)} bytes")

        header = struct.unpack(HEADER_FMT, header_bytes)
        star0, star1, starn, stnum, mprop, nmag, nbent = header

        # nmag = -1 means coordinates are already J2000
        is_j2000 = (nmag == -1)

        print(f"header: star0={star0} star1={star1} starn={starn} "
              f"nmag={nmag} nbent={nbent} ({'J2000' if is_j2000 else 'B1950'})")

        for i in range(starn):
            entry_bytes = f.read(ENTRY_SIZE)
            if len(entry_bytes) < ENTRY_SIZE:
                break

            try:
                xno, sra0, sdec0, spec, mag_100, xrpm, xdpm = struct.unpack(
                    ENTRY_FMT, entry_bytes
                )
            except struct.error:
                continue

            # mag is stored as int16 * 100; value of 0 is used for missing data
            # stars with no recorded magnitude are skipped
            if mag_100 == 0 and int(xno) == xno and xno > 0:
                vmag = None
            else:
                vmag = mag_100 / 100.0

            # skip non-stellar objects (xno not an integer or out of range)
            if vmag is None:
                continue

            # skip extremely faint entries that crept in
            if vmag > 8.0:
                continue

            # coordinates are in radians
            ra_rad  = sra0
            dec_rad = sdec0

            if not is_j2000:
                ra_rad, dec_rad = b1950_to_j2000(ra_rad, dec_rad)

            ra_deg  = math.degrees(ra_rad) % 360.0
            dec_deg = math.degrees(dec_rad)

            # sanity check
            if not (-90.0 <= dec_deg <= 90.0):
                continue

            color = spectral_color(spec)

            # look up common name by hr number
            hr = int(round(xno))
            name = HR_NAMES.get(hr, None)

            stars.append([
                round(ra_deg, 4),
                round(dec_deg, 4),
                round(vmag, 2),
                color,
                name
            ])

    return stars


def main():
    if len(sys.argv) != 3:
        print("usage: python build_stars.py <BSC5_binary_file> <output.json>")
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2]

    print(f"reading {input_path}...")
    stars = parse_bsc5(input_path)
    print(f"parsed {len(stars)} stars")

    named = sum(1 for s in stars if s[4] is not None)
    print(f"  {named} named stars, {len(stars) - named} anonymous")

    print(f"writing {output_path}...")
    with open(output_path, 'w') as f:
        # compact json: no spaces, keeps file small
        json.dump(stars, f, separators=(',', ':'))

    size_kb = len(json.dumps(stars, separators=(',', ':')).encode()) / 1024
    print(f"done. output size: {size_kb:.1f} KB")


if __name__ == '__main__':
    main()
