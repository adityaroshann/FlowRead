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


# ---------------------------------------------------------------------------
# v2 conversion fixtures (each exercises one engine rule)
# ---------------------------------------------------------------------------


def _png_bytes(width: int, height: int, color=(230, 240, 250), noise: bool = False) -> bytes:
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (width, height), color)
    if noise:
        d = ImageDraw.Draw(im)
        for i in range(0, width, 40):
            d.line((i, 0, width - i, height), fill=(200, 210, 230), width=3)
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def _lines(w: "_Writer", x: float, y: float, lines: list[str], step: float = 14, **kw) -> float:
    for line in lines:
        w.text(x, y, line, **kw)
        y += step
    return y


def make_background_pdf() -> bytes:
    """A slide-style page: a full-page background picture with text drawn on top."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    p.insert_image(p.rect, stream=_png_bytes(800, 1035, noise=True))
    w = _Writer(p)
    w.text(72, 100, "Photosynthesis Basics", size=24, bold=True)
    w.text(72, 150, "Light reactions", size=16, bold=True)
    _lines(w, 72, 175, [
        "Plants capture light energy in the thylakoid membranes of the",
        "chloroplast and store it as chemical energy.",
    ])
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def make_crosspage_pdf() -> bytes:
    """Page 1 ends mid-sentence; page 2 continues it. Then a clean page break that must not merge."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    w.text(72, 100, "Membranes", size=16, bold=True)
    _lines(w, 72, 130, [
        "The plasma membrane is a thin layer that surrounds the cell. It is",
        "built from a double layer of phospholipids, and the proteins that sit",
    ])
    w.done()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _lines(w, 72, 80, ["inside it move substances across the membrane in both directions."])
    _lines(w, 72, 110, ["This second paragraph ends the page cleanly."])
    w.done()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _lines(w, 72, 80, ["Transport proteins come in two broad kinds."])
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def make_bold_heading_pdf() -> bytes:
    """Bold lines that are and are not headings."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    _lines(w, 72, 80, [
        "Osmosis is the movement of water across a partially permeable membrane",
        "from a dilute solution to a concentrated one, and",
    ])
    # A bold short line inside the paragraph flow (no whitespace above or below).
    w.text(72, 108, "water potential matters here", bold=True)
    _lines(w, 72, 122, ["because it predicts the direction in which water will move overall."])
    # An isolated bold line: a real heading.
    w.text(72, 170, "Worked example", bold=True)
    _lines(w, 72, 200, ["A potato cylinder placed in pure water gains mass as water enters it."])
    # Numbered heading at body size, not bold.
    w.text(72, 250, "2.1 Active transport")
    _lines(w, 72, 280, ["Active transport moves substances against a concentration gradient."])
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def make_vector_pdf() -> bytes:
    """A vector diagram (shapes + short labels), an underline and a rule that must be ignored."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    w.text(72, 80, "The cycle below has four stages that repeat in order every time.")
    # Underline beneath a word, and a horizontal rule: not diagrams.
    p.draw_line(fitz.Point(72, 83), fitz.Point(110, 83), color=(0, 0, 0), width=0.6)
    p.draw_line(fitz.Point(72, 100), fitz.Point(540, 100), color=(0.5, 0.5, 0.5), width=0.8)
    cx, cy = 300, 260
    for dx, dy in ((0, -90), (110, 0), (0, 90), (-110, 0)):
        p.draw_circle(fitz.Point(cx + dx, cy + dy), 28, color=(0.1, 0.3, 0.7), fill=(0.8, 0.9, 1), width=1.5)
    for a, b in (((300, 198), (382, 245)), ((382, 275), (300, 322)), ((300, 322), (218, 275)), ((218, 245), (300, 198))):
        p.draw_line(fitz.Point(*a), fitz.Point(*b), color=(0, 0, 0), width=1.2)
    for (x, y), label in (((290, 174), "G1"), ((403, 264), "S"), ((290, 354), "G2"), ((184, 264), "M")):
        w.text(x, y, label, size=10)
    _lines(w, 72, 420, ["Each stage prepares the cell for the next one, ending in division."])
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def make_borderless_table_pdf() -> bytes:
    """Page 1: a table drawn with aligned text only. Page 2: ordinary prose (no table)."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    w.text(72, 80, "Enzymes and their optimum conditions are listed below.")
    rows = [
        ("Enzyme", "Optimum pH", "Site"),
        ("Pepsin", "2", "Stomach"),
        ("Amylase", "7", "Mouth"),
        ("Trypsin", "8", "Small intestine"),
        ("Lipase", "8", "Pancreas"),
    ]
    y = 120
    for r, row in enumerate(rows):
        for x, cell in zip((72, 240, 380), row):
            w.text(x, y, cell, bold=(r == 0))
        y += 18
    w.text(72, y + 30, "Each enzyme works best within a narrow range of conditions.")
    w.done()

    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    prose = [
        "Enzymes are biological catalysts that speed up chemical reactions in",
        "living cells. They are proteins with a specific three dimensional shape,",
        "and the active site binds to a substrate that fits it closely. When the",
        "temperature rises too far the shape changes and the enzyme stops working,",
        "which is called denaturation. Most human enzymes work best at around body",
        "temperature, and each one also has an optimum pH at which it is fastest.",
    ]
    _lines(w, 72, 80, prose)
    _lines(w, 72, 200, prose[::-1])
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def make_marks_pdf() -> bytes:
    """A paragraph with a bold phrase, an italic phrase and a link."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    tw = fitz.TextWriter(p.rect)
    reg, bold, ital = fitz.Font("helv"), fitz.Font("hebo"), fitz.Font("heit")
    x, y = 72, 100
    for text, font in (
        ("Read the ", reg),
        ("safety rules", bold),
        (" before the lab and see ", reg),
        ("Lab Manual", ital),
        (" online.", reg),
    ):
        _, end = tw.append((x, y), text, font=font, fontsize=11)
        x = end.x
    tw.write_text(p)
    hits = p.search_for("Lab Manual")
    p.insert_link({"kind": fitz.LINK_URI, "from": hits[0], "uri": "https://example.org/manual"})
    data = doc.tobytes()
    doc.close()
    return data


def make_scanned_pdf(pages: int = 2) -> bytes:
    """Pages that are only a picture of text (no text layer)."""
    import fitz
    from PIL import Image, ImageDraw

    doc = fitz.open()
    for _ in range(pages):
        im = Image.new("RGB", (850, 1100), (250, 250, 245))
        d = ImageDraw.Draw(im)
        for row in range(12):
            d.rectangle((80, 120 + row * 60, 760, 140 + row * 60), fill=(60, 60, 60))
        buf = io.BytesIO()
        im.save(buf, "PNG")
        p = doc.new_page(width=PAGE_W, height=PAGE_H)
        p.insert_image(p.rect, stream=buf.getvalue())
    data = doc.tobytes()
    doc.close()
    return data


MATH_LINES = ["∑ xᵢ ≤ ∫ f(x) dx ± Δ", "α + β ≥ γ ⇒ θ ≠ λ", "∂u/∂t = ∇²u − μ"]


def make_math_pdf() -> bytes:
    """A maths-heavy page (many operator and Greek glyphs)."""
    import fitz

    doc = fitz.open()
    p = doc.new_page(width=PAGE_W, height=PAGE_H)
    w = _Writer(p)
    w.text(72, 80, "Kinematics", size=16, bold=True)
    font = fitz.Font("cjk")  # wide glyph coverage for maths symbols
    y = 120
    for line in MATH_LINES:
        w.tw.append((72, y), line, font=font, fontsize=12)
        y += 30
    w.done()
    data = doc.tobytes()
    doc.close()
    return data


def _add_hyperlink(paragraph, text: str, url: str):
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    r_id = paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), r_id)
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = text
    r.append(t)
    h.append(r)
    paragraph._p.append(h)


def _xml(fragment: str):
    from docx.oxml import parse_xml

    ns = (
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
        'xmlns:v="urn:schemas-microsoft-com:vml"'
    )
    return parse_xml(fragment.replace(">", f" {ns}>", 1))


def make_rich_docx() -> bytes:
    """Nested lists, custom heading style, marks + link, text box, content control,
    table with a header row and a picture in a cell, a page break and an OMML equation."""
    from docx import Document
    from docx.enum.style import WD_STYLE_TYPE
    from docx.shared import Inches

    d = Document()
    d.core_properties.title = "Unit 2: Ecology"
    custom = d.styles.add_style("Chapter Heading", WD_STYLE_TYPE.PARAGRAPH)
    custom.base_style = d.styles["Heading 1"]
    d.add_paragraph("Food webs", style="Chapter Heading")

    p = d.add_paragraph("Energy flows from ")
    p.add_run("producers").bold = True
    p.add_run(" to ")
    p.add_run("consumers").italic = True
    p.add_run(". See ")
    _add_hyperlink(p, "the field guide", "https://example.org/guide")
    p.add_run(".")

    # A two-level bullet definition (the default template's are single-level).
    numbering = d.part.numbering_part.element
    lvls = "".join(
        f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/>'
        f'<w:pPr><w:ind w:left="{720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>'
        for i in range(2)
    )
    first_num = numbering.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}num")
    first_num.addprevious(_xml(f'<w:abstractNum w:abstractNumId="90">{lvls}</w:abstractNum>'))
    numbering.append(_xml('<w:num w:numId="90"><w:abstractNumId w:val="90"/></w:num>'))
    for name, lvl in (("Producers", 0), ("Plants", 1), ("Algae", 1), ("Consumers", 0)):
        item = d.add_paragraph(name)
        item._p.get_or_add_pPr().append(
            _xml(f'<w:numPr><w:ilvl w:val="{lvl}"/><w:numId w:val="90"/></w:numPr>')
        )

    body = d.element.body
    sect = body[-1]  # sectPr stays last
    sdt = _xml(
        "<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Text inside a content control.</w:t></w:r></w:p>"
        "</w:sdtContent></w:sdt>"
    )
    sect.addprevious(sdt)
    box = _xml(
        "<w:p><w:r><w:t>Before the box.</w:t></w:r><w:r><w:pict><v:shape><v:textbox><w:txbxContent>"
        "<w:p><w:r><w:t>Text inside a text box.</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>"
    )
    sect.addprevious(box)

    t = d.add_table(rows=3, cols=2)
    vals = [("Organism", "Role"), ("Oak", "Producer"), ("Fox", "Consumer")]
    for r, row in enumerate(vals):
        for c, v in enumerate(row):
            cell = t.cell(r, c)
            cell.text = ""
            cell.paragraphs[0].add_run(v).bold = r == 0
    t.cell(2, 1).add_paragraph().add_run().add_picture(io.BytesIO(make_png()), width=Inches(1))

    d.add_page_break()
    d.add_paragraph("Energy pyramids", style="Heading 2")
    eq = _xml(
        "<w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc</m:t></m:r><m:sSup><m:e><m:r><m:t></m:t></m:r></m:e>"
        "<m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath></m:oMathPara></w:p>"
    )
    sect.addprevious(eq)
    d.add_paragraph("Only about ten percent of energy passes to the next level.")
    out = io.BytesIO()
    d.save(out)
    return out.getvalue()


def make_course_pptx() -> bytes:
    """Four slides: title slide, bullets with a sub-level + notes, a table + picture, and an untitled slide."""
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[0])
    s1.shapes.title.text = "Climate Systems"
    s1.placeholders[1].text = "Lecture 5 overview"

    s2 = prs.slides.add_slide(prs.slide_layouts[1])
    s2.shapes.title.text = "The greenhouse effect"
    tf = s2.placeholders[1].text_frame
    tf.text = "Sunlight warms the surface"
    for text, level in (("Infrared leaves the surface", 0), ("Some is absorbed by gases", 1),
                        ("Carbon dioxide", 1), ("The air warms", 0)):
        p = tf.add_paragraph()
        p.text = text
        p.level = level
    s2.notes_slide.notes_text_frame.text = "Ask the class which gases they already know."

    s3 = prs.slides.add_slide(prs.slide_layouts[5])
    s3.shapes.title.text = "Gas concentrations"
    rows = [("Gas", "Share"), ("Nitrogen", "78%"), ("Oxygen", "21%")]
    shape = s3.shapes.add_table(3, 2, Inches(0.5), Inches(1.5), Inches(4), Inches(1.5))
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            shape.table.cell(r, c).text = v
    s3.shapes.add_picture(io.BytesIO(make_png()), Inches(5), Inches(3.5), width=Inches(3))
    box = s3.shapes.add_textbox(Inches(0.5), Inches(5.5), Inches(6), Inches(1))
    para = box.text_frame.paragraphs[0]
    run = para.add_run()
    run.text = "Source: synthetic data"
    run.font.italic = True
    run.font.size = Pt(14)

    s4 = prs.slides.add_slide(prs.slide_layouts[6])  # blank: no title placeholder
    tb = s4.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1))
    tb.text_frame.text = "Questions?"
    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()
