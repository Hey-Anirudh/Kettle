"""genpact_brand.py — drop-in Genpact-branded document & deck builders.

Single source of truth for Genpact styling used by every generated deliverable
(SDD, BRD, RA, Test Cases, Case Study, Report, PPT one-sliders). Encodes the
palette, Calibri typography, logo cover, branded header/footer, Document Control
block, table styling, and the AI COE one-slider layout.

Usage:
    import sys; sys.path.insert(0, f"{SKILL_DIR}/lib")
    from genpact_brand import GenpactDoc, GenpactDeck, GP

Requires: python-docx, python-pptx, pillow  (matplotlib optional, for diagrams).
"""
from __future__ import annotations
import os
from datetime import date

GP = dict(midnight="161916", fl01="444744", fl02="6D706B", fl03="ADB1AC",
          white="FFFFFF", cream="FFF2DF", gold="FFAD28", coral="FF555F")
# matplotlib diagram palette (with '#')
GP_DIAGRAM = dict(primary="#161916", secondary="#444744", actor="#FFAD28",
                  external="#FF555F", database="#6D706B", decision="#ADB1AC",
                  arrow="#161916", background="#FFFAF4", swimlane="#FFF2DF",
                  text_dark="#FFFFFF", text_light="#161916")
FONT = "Calibri"
DISCLAIMER = ("ACTION REQUIRED: Notice to all users. This document is produced by generative AI and "
              "results may not be accurate or contain errors. You are required to independently review, "
              "verify and modify (as necessary) any output before proceeding. In no circumstances should "
              "results be relied on, used, or shared without manual review and validation.")


def _logo_dir(skill_dir: str) -> str:
    return os.path.join(skill_dir, "assets", "genpact-logos")


# ─────────────────────────────────────────────────────────────────────────────
# WORD
# ─────────────────────────────────────────────────────────────────────────────
class GenpactDoc:
    def __init__(self, skill_dir: str):
        from docx import Document
        from docx.shared import Pt, Inches, RGBColor
        self._d = Document(); self._Pt = Pt; self._Inches = Inches; self._RGB = RGBColor
        self.logos = _logo_dir(skill_dir)
        for s in self._d.sections:
            s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = Inches(1)
        n = self._d.styles["Normal"]; n.font.name = FONT; n.font.size = Pt(11)
        n.font.color.rgb = RGBColor.from_string(GP["midnight"])
        self._header_footer()

    # -- low-level helpers --
    def _shd(self, cell, hexc):
        from docx.oxml import OxmlElement; from docx.oxml.ns import qn
        sh = OxmlElement("w:shd"); sh.set(qn("w:val"), "clear"); sh.set(qn("w:fill"), hexc)
        cell._tc.get_or_add_tcPr().append(sh)

    def _run(self, r, size=11, bold=False, color=GP["midnight"], italic=False):
        r.font.name = FONT; r.font.size = self._Pt(size); r.bold = bold; r.italic = italic
        r.font.color.rgb = self._RGB.from_string(color)

    def _p(self, text="", size=11, bold=False, color=GP["midnight"], italic=False, align=None, before=0, after=6):
        p = self._d.add_paragraph(); p.paragraph_format.space_before = self._Pt(before)
        p.paragraph_format.space_after = self._Pt(after)
        if align is not None: p.alignment = align
        if text: self._run(p.add_run(text), size, bold, color, italic)
        return p

    def _header_footer(self):
        from docx.shared import Inches; from docx.oxml import OxmlElement; from docx.oxml.ns import qn
        sec = self._d.sections[0]
        h = sec.header; h.is_linked_to_previous = False; hp = h.paragraphs[0]; hp.text = ""
        hp.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), 2)
        self._run(hp.add_run("Genpact"), 8, color=GP["fl02"]); hp.add_run("\t")
        blk = os.path.join(self.logos, "Genpact Logo Black.png")
        if os.path.exists(blk): hp.add_run().add_picture(blk, width=Inches(0.95))
        f = sec.footer; f.is_linked_to_previous = False; fp = f.paragraphs[0]; fp.text = ""
        pb = OxmlElement("w:pBdr"); top = OxmlElement("w:top")
        for k, v in [("w:val","single"),("w:sz","6"),("w:space","4"),("w:color",GP["gold"])]: top.set(qn(k), v)
        pb.append(top); fp.paragraph_format.element.get_or_add_pPr().append(pb)
        fp.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), 2)
        self._run(fp.add_run(f"© {date.today().year} Copyright Genpact. All Rights Reserved."), 8, color=GP["fl03"])
        fp.add_run("\t")
        fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE"); r = fp.add_run(); r._r.addprevious(fld)
        self._run(r, 8, color=GP["fl02"])

    # -- public API --
    def label(self, text): self._p(text, size=10, bold=True, color=GP["coral"], before=10, after=2)
    def h1(self, text): self._p(text, size=16, bold=True, color=GP["midnight"], before=4, after=6)
    def h2(self, text): self._p(text, size=14, bold=True, color=GP["fl01"], before=8, after=4)
    def h3(self, text): self._p(text, size=12, bold=True, color=GP["fl01"], before=6, after=3)
    def body(self, text, **kw): self._p(text, **kw)
    def caption(self, text):
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        self._p(text, size=9, italic=True, color=GP["fl02"], align=WD_ALIGN_PARAGRAPH.CENTER)

    def bullet(self, text, bold_prefix=None):
        p = self._d.add_paragraph(style="List Bullet"); p.paragraph_format.space_after = self._Pt(3)
        if bold_prefix: self._run(p.add_run(bold_prefix), 11, True); self._run(p.add_run(text))
        else: self._run(p.add_run(text))

    def page_break(self):
        from docx.oxml import OxmlElement; from docx.oxml.ns import qn
        p = self._d.add_paragraph(); r = p.add_run(); br = OxmlElement("w:br"); br.set(qn("w:type"), "page"); r._r.append(br)

    def table(self, headers, rows):
        from docx.enum.table import WD_TABLE_ALIGNMENT
        t = self._d.add_table(rows=1, cols=len(headers)); t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.style = "Table Grid"
        for i, hd in enumerate(headers):
            c = t.rows[0].cells[i]; self._shd(c, GP["midnight"]); c.paragraphs[0].paragraph_format.space_after = self._Pt(2)
            self._run(c.paragraphs[0].add_run(str(hd)), 10, True, GP["white"])
        for ri, row in enumerate(rows):
            cells = t.add_row().cells
            for ci, val in enumerate(row):
                self._shd(cells[ci], GP["white"] if ri % 2 == 0 else GP["cream"])
                cells[ci].paragraphs[0].paragraph_format.space_after = self._Pt(2)
                self._run(cells[ci].paragraphs[0].add_run(str(val)), 10)
        self._d.add_paragraph(); return t

    def cover(self, title, project, subtitle="", version="1.0", status="Draft"):
        from docx.shared import Inches, Pt; from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.oxml import OxmlElement; from docx.oxml.ns import qn
        tb = self._d.add_table(rows=1, cols=1); tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tb.rows[0].cells[0]; self._shd(cell, GP["midnight"]); tcPr = cell._tc.get_or_add_tcPr()
        mar = OxmlElement("w:tcMar")
        for tag, v in [("top","1200"),("bottom","1600"),("start","500"),("end","500")]:
            el = OxmlElement("w:"+tag); el.set(qn("w:w"), v); el.set(qn("w:type"), "dxa"); mar.append(el)
        tcPr.append(mar)
        wlogo = os.path.join(self.logos, "Genpact Logo White.png")
        onit = os.path.join(self.logos, "logo_ON_IT_horizontal_white_TMversion.png")
        if os.path.exists(wlogo): cell.paragraphs[0].add_run().add_picture(wlogo, width=Inches(1.5))
        if os.path.exists(onit):
            pr = cell.add_paragraph(); pr.paragraph_format.space_before = Pt(4)
            pr.add_run().add_picture(onit, width=Inches(1.15))
        t1 = cell.add_paragraph(); t1.paragraph_format.space_before = Pt(36); t1.paragraph_format.space_after = Pt(6)
        self._run(t1.add_run(title), 30, True, GP["white"])
        t2 = cell.add_paragraph(); self._run(t2.add_run(project.upper()), 13, True, GP["coral"])
        if subtitle:
            t3 = cell.add_paragraph(); self._run(t3.add_run(subtitle), 12, color=GP["fl03"])
        t4 = cell.add_paragraph(); t4.paragraph_format.space_before = Pt(24)
        self._run(t4.add_run(f"Date: {date.today().strftime('%d %B %Y')}   |   Version {version}   |   Status: {status}"), 10, color=GP["fl03"])
        self._d.add_paragraph()

    def disclaimer(self):
        self.label("DISCLAIMER"); self._p(DISCLAIMER, size=10, italic=True, color=GP["fl02"]); self.page_break()

    def document_control(self, project, account="", version="1.0", contributors="", customer="[To be defined]"):
        self.label("DOCUMENT CONTROL"); self.h1("Document Information")
        self.table(["Field", "Detail"], [
            ["Project Name", project], ["Account", account or "[To be defined]"],
            ["Current Version", version], ["List of Contributors", contributors or "[To be defined]"],
            ["Customer Contact Information", customer]])
        self.h2("Review & Approval")
        self.table(["Prepared by / Date", "Reviewed by / Date", "Approved by / Date"], [["", "", ""]])
        self.h2("Version History")
        self.table(["Version", "Date", "Description of Change", "Reason for Change", "Affected Sections"],
                   [[version, date.today().strftime('%d %b %Y'), "Initial version", "New document", "All"]])

    def toc(self, items):
        self.page_break(); self.label("CONTENTS"); self.h1("Table of Contents")
        for it in items: self.bullet(it)
        self.page_break()

    def embed(self, image_path, caption="", target=6.0):
        from PIL import Image; from docx.shared import Inches; from docx.enum.text import WD_ALIGN_PARAGRAPH
        with Image.open(image_path) as im: pw, ph = im.size
        aspect = ph / pw; width = min(target, 6.0)
        if aspect > 1.0: width = min(width, 7.5 / aspect)
        if width * aspect > 7.5: self.page_break()
        self._d.add_paragraph()
        ip = self._d.add_paragraph(); ip.alignment = WD_ALIGN_PARAGRAPH.CENTER
        ip.add_run().add_picture(image_path, width=Inches(width))
        if caption: self.caption(caption)
        self._d.add_paragraph()

    def save(self, path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True); self._d.save(path); return path


# ─────────────────────────────────────────────────────────────────────────────
# POWERPOINT — AI COE one-slider
# ─────────────────────────────────────────────────────────────────────────────
class GenpactDeck:
    def __init__(self, skill_dir: str):
        from pptx import Presentation; from pptx.util import Inches
        self.logos = _logo_dir(skill_dir); self._P = Presentation(); self._Inches = Inches
        self._P.slide_width = Inches(13.333); self._P.slide_height = Inches(7.5)

    def _tb(self, slide, x, y, w, h, text, size, bold=False, color=GP["midnight"], align=None, font=FONT):
        from pptx.util import Inches, Pt; from pptx.dml.color import RGBColor; from pptx.enum.text import PP_ALIGN
        tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame
        tf.word_wrap = True; p = tf.paragraphs[0]
        if align: p.alignment = align
        r = p.add_run(); r.text = text; r.font.size = Pt(size); r.font.bold = bold
        r.font.name = font; r.font.color.rgb = RGBColor.from_string(color)
        return tb

    def _band(self, slide, x, y, w, h, fill):
        from pptx.util import Inches; from pptx.dml.color import RGBColor; from pptx.enum.shapes import MSO_SHAPE
        sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor.from_string(fill); sh.line.fill.background()
        return sh

    def one_slider(self, title, tagline, challenge, challenge_metric, solution_steps, solution_metric,
                   human, impact_delta, impact_sub, impact_bullets, stats, pipeline, summary):
        from pptx.util import Inches, Pt; from pptx.enum.text import PP_ALIGN
        s = self._P.slides.add_slide(self._P.slide_layouts[6])  # blank
        # header band
        self._band(s, 0, 0, 13.333, 1.0, GP["midnight"])
        wlogo = os.path.join(self.logos, "Genpact Logo White.png")
        if os.path.exists(wlogo): s.shapes.add_picture(wlogo, Inches(0.35), Inches(0.28), height=Inches(0.42))
        self._tb(s, 2.0, 0.12, 9.5, 0.5, title, 22, True, GP["white"])
        self._tb(s, 2.0, 0.6, 11.0, 0.35, tagline, 11, False, GP["fl03"])
        col_w = 4.25; gap = 0.15; xs = [0.25, 0.25 + col_w + gap, 0.25 + 2 * (col_w + gap)]
        heads = ["THE CHALLENGE", "THE SOLUTION", "THE IMPACT"]
        for x, hd in zip(xs, heads):
            self._tb(s, x, 1.15, col_w, 0.35, hd, 13, True, GP["coral"])
        # challenge
        y = 1.6
        for tt, dd in challenge[:4]:
            self._tb(s, xs[0], y, col_w, 0.3, "• " + tt, 11, True, GP["midnight"])
            self._tb(s, xs[0] + 0.2, y + 0.3, col_w - 0.2, 0.3, dd, 9, False, GP["fl02"]); y += 0.72
        self._band(s, xs[0], 6.05, col_w, 0.95, GP["cream"])
        self._tb(s, xs[0], 6.1, col_w, 0.5, challenge_metric[0], 24, True, GP["coral"], PP_ALIGN.CENTER)
        self._tb(s, xs[0], 6.6, col_w, 0.35, challenge_metric[1], 9, False, GP["fl02"], PP_ALIGN.CENTER)
        # solution
        self._tb(s, xs[1], 1.55, col_w, 0.3, "AGENT automates the pipeline", 11, True, GP["midnight"])
        y = 1.9
        for tt, dd in solution_steps[:3]:
            self._tb(s, xs[1], y, col_w, 0.3, "▸ " + tt, 10, True, GP["fl01"])
            self._tb(s, xs[1] + 0.2, y + 0.28, col_w - 0.2, 0.3, dd, 9, False, GP["fl02"]); y += 0.66
        self._tb(s, xs[1], y + 0.05, col_w, 0.3, "HUMAN validates every stage", 10, True, GP["midnight"])
        self._tb(s, xs[1] + 0.2, y + 0.35, col_w - 0.2, 0.4, human, 9, False, GP["fl02"])
        self._band(s, xs[1], 6.05, col_w, 0.95, GP["midnight"])
        self._tb(s, xs[1], 6.1, col_w, 0.5, solution_metric[0], 24, True, GP["gold"], PP_ALIGN.CENTER)
        self._tb(s, xs[1], 6.6, col_w, 0.35, solution_metric[1], 9, False, GP["white"], PP_ALIGN.CENTER)
        # impact
        self._tb(s, xs[2], 1.55, col_w, 0.5, impact_delta, 22, True, GP["midnight"])
        self._tb(s, xs[2], 2.05, col_w, 0.3, impact_sub, 11, True, GP["coral"])
        y = 2.5
        for b in impact_bullets[:4]:
            self._tb(s, xs[2], y, col_w, 0.35, b, 9, False, GP["fl01"]); y += 0.4
        # stats row
        sx = xs[2]; sw = col_w / max(1, len(stats))
        for i, (num, lbl) in enumerate(stats[:4]):
            self._tb(s, sx + i * sw, 6.05, sw, 0.45, num, 18, True, GP["midnight"], PP_ALIGN.CENTER)
            self._tb(s, sx + i * sw, 6.5, sw, 0.45, lbl, 8, False, GP["fl02"], PP_ALIGN.CENTER)
        # footer
        self._band(s, 0, 7.05, 13.333, 0.02, GP["gold"])
        self._tb(s, 0.25, 7.12, 6.0, 0.3, f"© {date.today().year} Copyright Genpact. All Rights Reserved.", 8, False, GP["fl03"])
        self._tb(s, 6.5, 7.12, 6.6, 0.3, "  ›  ".join(pipeline), 9, True, GP["fl01"], PP_ALIGN.RIGHT)
        return s

    def save(self, path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True); self._P.save(path); return path
