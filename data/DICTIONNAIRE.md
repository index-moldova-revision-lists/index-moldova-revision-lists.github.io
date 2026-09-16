# Field dictionary

Three views of the same index, generated from the same source as the search
page. Same content, different shapes: pick `index.jsonl` to read a whole
record at once, `lignes.csv` to grep for a village, `dossiers.csv` for an
overview of the archival files.

Source: National Archives of the Republic of Moldova (ANRM), **fond 134,
opis 2** -- the poll tax censuses (*catagrafii*, Russian *ревизские
сказки*) of Bessarabia. Microfilmed by FamilySearch as
*Moldova, Poll Tax Census (Revision Lists) and Census Lists, 1796-1917*.

Licence: CC0 (public domain). No attribution required.
Generated: 812 archival files, 9725 inventory lines, 2226 village
spellings, 1824-1886.

## The one thing to know before using this

**A folio is not an image.** The inventory locates a village by *folio*
(`filele`, the number written in pencil on the top right corner of the
page). The FamilySearch viewer counts *images*. Pages were filmed twice or
three times, irregularly, so there is no formula from one to the other: the
ratio runs from 1.2 to 3.2 images per folio inside a single volume.

That is why `image_range` is usually given **for the whole archival file**
and not for the village: it is the range we verified. To find the village
inside it, open the file and read the folio numbers, then jump forward or
back. The `folios` field tells you which folio to stop at, and the
neighbouring villages in the same file tell you which way to go.

1395 inventory lines out of 9725 do have their own verified
`image` and a direct `familysearch_url`. The rest deliberately have none: an
estimate was measured to be off by 260 images once in ten, which is worse
than useless.

## dossiers.csv -- one archival file per row

| field | meaning |
|---|---|
| `dosar` | file number inside fond 134 opis 2. Cite as `ANRM F.134 inv.2 d.247` |
| `year_from`, `year_to` | years the file covers, empty when the inventory gives none (3 files) |
| `title_ro` | the inventory title, **verbatim**, in Romanian, with the county names of the period |
| `title_en`, `title_fr`, `title_ru` | machine translation of that title, for readers |
| `county` | *ținut* / county, when the inventory states one |
| `villages` | how many inventory lines (villages) this file contains |
| `microfilm` | FamilySearch DGS number(s), separated by ` · `. A file may span two reels |
| `image_range` | image numbers of the file inside the reel, one range per reel |
| `image_count` | number of images in the file |
| `confidence` | how the range was established: see below |
| `familysearch_url` | direct link to the file in the FamilySearch viewer (730 of 812) |
| `inventory_page` | page of the ANRM inventory PDF where this line is printed: https://doc.arhiva.gov.md/inventare/Fondul%20134/F.%20134%20inv.%202%20p.%20I%20%C8%99i%20II.pdf |

## lignes.csv -- one inventory line (one village) per row

| field | meaning |
|---|---|
| `dosar` | the file this line belongs to |
| `volume` | internal volume of the file (I, II, III...), when the file has several |
| `prefix` | what the inventory writes before the name: `col.` (colony), `s.` (village), `tîrgul` (market town), `oraşul` (town), `cătunul` (hamlet) |
| `village` | the name **as the inventory spells it**. Never normalised, never merged |
| `village_ru` | the same name in Russian, for searching the images |
| `county` | county written on this line, when there is one |
| `folios` | folio range as printed, `1-64v` (`v` = verso) |
| `folio_from`, `folio_to` | the same, as numbers, for sorting |
| `microfilm`, `image_range`, `image_count`, `confidence` | filled only when this village has its own verified range |
| `image` | image number of the first page of this village, inside the volume. This is the number to type into the FamilySearch viewer, which counts within the volume and not within the reel |
| `familysearch_url` | link to that exact view, when we hold the image ark |

Two lines with the same name are **not** merged: `Tomai (Cahul, 1850)` and
`Tomai (Iași, 1857)` are two places. A line is identified by file + volume +
spelling + folios. Use the neighbouring villages in the same file to tell
homonyms apart.

## index.jsonl -- one JSON object per line, one line per archival file

Same fields, with the villages nested under `villages`. Empty fields are
omitted rather than left blank.

## confidence

How the image range was established. The values actually present, with the
number of archival files carrying each:

| value | files |
|---|---|
| `sur` | 589 |
| `probable` | 108 |
| `estime` | 54 |
| `deduit` | 31 |
| `volum` | 28 |
| `incertain` | 2 |

`exacte` and `sur` are anchored on a separation card or a read folio;
`probable` and `deduit` are inferred from the neighbouring files on the same
reel; `estime` is interpolated; `volum` means the reel is identified but the
range inside it is not. The field is kept for our own sorting and the public
page does not display it. Do not present it to a reader as a probability.

## What this index does NOT do

- It does not index **people**. There is no name of an inhabitant here, only
  place names from the inventory. The names are on the images.
- It does not cover the **parish registers** (births, marriages, deaths),
  which are fond 211 at the same archive.
- It does not host any image. Every link points to FamilySearch, where
  viewing usually requires a free account, and where access to some images
  is restricted by contract.
- It is not complete: 82 files have no FamilySearch link yet.
