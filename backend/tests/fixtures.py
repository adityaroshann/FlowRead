"""Synthetic fixture documents, generated at test time (no copyrighted material)."""

from __future__ import annotations

import io

PAGE_W, PAGE_H = 612, 792
HEADER = "BIOL 1001 – Week 3"


def make_png(width: int = 320, height: int = 200) -> bytes:
    """Draw a simple synthetic 'cell diagram' with Pillow."""
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (width, height), (245, 248, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((20, 20, width - 20, height - 20), outline=(30, 90, 160), width=6, fill=(200, 225, 250))
    cx, cy = width // 2, height // 2
    d.ellipse((cx - 40, cy - 30, cx + 40, cy + 30), outline=(120, 40, 120), width=4, fill=(230, 200, 235))
    d.ellipse((cx - 12, cy - 10, cx + 12, cy + 10), fill=(90, 20, 90))
    for i in range(5):
        x = 60 + i * 45
        d.rectangle((x, height - 60, x + 18, height - 48), fill=(40, 160, 80))
    d.text((cx - 30, 28), "Cell", fill=(0, 0, 0))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def make_tiny_png() -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (16, 16), (255, 0, 0)).save(out, "PNG")
    return out.getvalue()


class _Writer:
    def __init__(self, page):
        import fitz

        self.fitz = fitz
        self.page = page
        self.tw = fitz.TextWriter(page.rect)
        self.reg = fitz.Font("helv")
        self.bold = fitz.Font("hebo")

    def text(self, x, y, s, size=11, bold=False):
        self.tw.append((x, y), s, font=self.bold if bold else self.reg, fontsize=size)

    def done(self):
        self.tw.write_text(self.page)


def _chrome(w: _Writer, page_no: int):
    w.text(72, 36, HEADER, size=9)
    w.text(PAGE_W / 2 - 4, PAGE_H - 30, str(page_no), size=9)


def make_course_pdf(with_image: bool = True, metadata_title: str | None = None) -> bytes:
    """A 3-page 'course notes' PDF.

    Page 1: title (24pt bold), H2 "Introduction" (16pt bold), two paragraphs
            (one with a hyphenated line break), H3 "Key terms" (13pt bold),
            a bulleted list, a maths line.
    Page 2: H2 "Cell structures", a table with a bold header row and
            a "Table 1" caption, an embedded PNG with a "Figure 1" caption,
            a tiny 16px icon (must be skipped), a numbered list.
    Page 3: H2 "Discussion" across the page, then two text columns.
    Every page: running header "BIOL 1001 – Week 3" and a bare page number.
    """
    import fitz

    doc = fitz.open()

    # ---------------- page 1 ----------------
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _chrome(w, 1)
    w.text(72, 100, "Week 3: Cell Biology", size=24, bold=True)
    w.text(72, 150, "Introduction", size=16, bold=True)
    y = 175
    for line in [
        "Cells are the basic units of life. Every living organism is made of one",
        "or more cells, and each cell carries out the processes that keep the",
        "organism alive.",
    ]:
        w.text(72, y, line)
        y += 14
    y += 12
    for line in [
        "The plasma membrane controls what enters and leaves the cell. It is a selec-",
        "tively permeable barrier made of a phospholipid bilayer.",
    ]:
        w.text(72, y, line)
        y += 14
    y += 18
    w.text(72, y, "Key terms", size=13, bold=True)
    y += 22
    for item in [
        "• Nucleus: stores the genetic material of the cell.",
        "• Mitochondria: produce energy for the cell through",
        "• Ribosomes: build proteins from amino acids.",
    ]:
        w.text(72, y, item)
        y += 14
        if item.endswith("through"):
            w.text(82, y, "cellular respiration.")
            y += 14
    y += 14
    w.text(72, y, "Magnification = image size ÷ actual size")
    y += 22
    w.text(72, y, "Surface area to volume ratio matters for every cell type we study.")
    w.done()

    # ---------------- page 2 ----------------
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _chrome(w, 2)
    w.text(72, 90, "Cell structures", size=16, bold=True)
    w.text(72, 115, "The table below compares three organelles found in animal cells.")
    w.text(72, 140, "Table 1: Organelles and their functions")
    rows = [
        ("Organelle", "Function", "Count per cell"),
        ("Nucleus", "Stores DNA", "1"),
        ("Mitochondrion", "Makes ATP", "1000"),
        ("Ribosome", "Builds proteins", "10000"),
    ]
    ty = 150
    col_w = [150, 170, 110]
    for r, row in enumerate(rows):
        x = 72
        for c, cell in enumerate(row):
            p.draw_rect(fitz.Rect(x, ty + r * 22, x + col_w[c], ty + r * 22 + 22), color=(0, 0, 0), width=0.8)
            w.text(x + 5, ty + r * 22 + 15, cell, size=10, bold=(r == 0))
            x += col_w[c]
    y = ty + len(rows) * 22 + 30
    w.text(72, y, "The diagram shows a simplified animal cell with its nucleus at the centre.")
    y += 15
    if with_image:
        rect = fitz.Rect(72, y, 72 + 240, y + 150)
        p.insert_image(rect, stream=make_png())
        y = rect.y1 + 16
        w.text(72, y, "Figure 1: A simplified animal cell")
        y += 14
        p.insert_image(fitz.Rect(500, 100, 512, 112), stream=make_tiny_png())
    y += 20
    w.text(72, y, "Steps in the lab", size=13, bold=True)
    y += 20
    for item in ["1. Prepare the microscope slide.", "2. Add one drop of stain.", "3. Focus at low power first."]:
        w.text(72, y, item)
        y += 14
    w.done()

    # ---------------- page 3: two columns ----------------
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _chrome(w, 3)
    w.text(72, 90, "Discussion", size=16, bold=True)
    left = [
        "ALPHA Left column starts here and",
        "talks about prokaryotic cells which",
        "lack a nucleus.",
        "",
        "BETA The left column continues with",
        "a second paragraph about bacteria.",
    ]
    right = [
        "GAMMA Right column begins with",
        "eukaryotic cells which have a",
        "membrane-bound nucleus.",
        "",
        "DELTA The right column ends with a",
        "note about plant and animal cells.",
    ]
    for col_x, lines in ((72, left), (326, right)):
        y = 120
        for line in lines:
            if line:
                w.text(col_x, y, line)
                y += 14
            else:
                y += 12
    w.done()

    doc.set_metadata({"title": metadata_title or "", "author": "FlowRead test suite"})
    data = doc.tobytes()
    doc.close()
    return data


def make_course_docx(with_image: bool = True) -> bytes:
    from docx import Document
    from docx.shared import Inches

    d = Document()
    d.add_paragraph("Week 4: Genetics", style="Title")
    d.add_paragraph("Introduction", style="Heading 1")
    d.add_paragraph("Genes are segments of DNA that code for proteins.")
    d.add_paragraph("Inheritance patterns", style="Heading 2")
    d.add_paragraph("Dominant alleles mask recessive alleles.", style="List Bullet")
    d.add_paragraph("Recessive traits appear only when both alleles are recessive.", style="List Bullet")
    d.add_paragraph("Cross two pea plants.", style="List Number")
    d.add_paragraph("Count the offspring.", style="List Number")
    t = d.add_table(rows=3, cols=2)
    cells = [("Genotype", "Phenotype"), ("AA", "Dominant"), ("aa", "Recessive")]
    for r, row in enumerate(cells):
        for c, val in enumerate(row):
            cell = t.cell(r, c)
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            run.bold = r == 0
    d.add_paragraph("Punnett squares", style="Heading 1")
    d.add_paragraph("A Punnett square predicts offspring ratios.")
    if with_image:
        d.add_picture(io.BytesIO(make_png()), width=Inches(3))
        d.add_paragraph("Figure 1: A Punnett square", style="Caption")
    d.add_paragraph("P(aa) = 1/4 × 100%")
    out = io.BytesIO()
    d.save(out)
    return out.getvalue()
