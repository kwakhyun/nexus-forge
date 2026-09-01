#!/usr/bin/env python3
"""Build the submission PDF from README.md and benchmark evidence.

The README remains the source of truth. Relative links are rewritten to the
public GitHub repository so they remain useful after the PDF is uploaded.
"""

from __future__ import annotations

import html
import json
import os
import re
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

from PIL import Image as PILImage
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "README.md"
OUTPUT = ROOT / "output" / "pdf" / "곽현_NEXUS-Forge_Frontend-Portfolio.pdf"
CHART_BENCHMARK = ROOT / "docs" / "benchmarks" / "performance-stress-2026-09-01.json"
APPLICATION_BENCHMARK = ROOT / "docs" / "benchmarks" / "application-stress-2026-09-01.json"
REPOSITORY = "https://github.com/kwakhyun/nexus-forge"
FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"

INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5E6878")
LIGHT_TEXT = colors.HexColor("#8791A2")
BLUE = colors.HexColor("#315EEB")
BLUE_DARK = colors.HexColor("#2146BB")
BLUE_PALE = colors.HexColor("#EEF3FF")
GREEN = colors.HexColor("#168A59")
GREEN_PALE = colors.HexColor("#EAF8F1")
AMBER_PALE = colors.HexColor("#FFF7E5")
LINE_COLOR = colors.HexColor("#D8DEE8")
SURFACE = colors.HexColor("#F7F9FC")
WHITE = colors.white


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Portfolio", FONT_PATH))
    pdfmetrics.registerFont(TTFont("PortfolioBold", FONT_PATH))
    pdfmetrics.registerFontFamily(
        "Portfolio", normal="Portfolio", bold="PortfolioBold",
        italic="Portfolio", boldItalic="PortfolioBold",
    )


def link_target(target: str) -> str:
    target = html.unescape(target.strip())
    if target.startswith(("http://", "https://", "mailto:")):
        return target
    if target.startswith("#"):
        return f"{REPOSITORY}#user-content-{target[1:]}"
    path, separator, anchor = target.partition("#")
    clean_path = str((ROOT / path).resolve().relative_to(ROOT)).replace(os.sep, "/")
    url = f"{REPOSITORY}/blob/main/{quote(clean_path, safe='/')}"
    if separator:
        url += f"#user-content-{quote(anchor, safe='-')}"
    return url


def inline_markup(text: str) -> str:
    placeholders: list[str] = []

    def hold(value: str) -> str:
        placeholders.append(value)
        return f"\x00{len(placeholders) - 1}\x00"

    def link_repl(match: re.Match[str]) -> str:
        label, target = match.group(1), match.group(2)
        return hold(
            f'<a href="{html.escape(link_target(target), quote=True)}" '
            f'color="{BLUE.hexval()}"><u>{html.escape(label)}</u></a>'
        )

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, text)
    text = html.escape(text)
    def code_repl(match: re.Match[str]) -> str:
        value = match.group(1)
        font = "PortfolioBold" if re.search(r"[가-힣]", value) else "Courier"
        return hold(f'<font name="{font}">{html.escape(value)}</font>')

    text = re.sub(r"`([^`]+)`", code_repl, text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    for index, value in enumerate(placeholders):
        text = text.replace(html.escape(f"\x00{index}\x00"), value)
    return text


def plain_inline(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"[*`]", "", text)
    return html.unescape(text)


def load_benchmark_evidence() -> tuple[dict, dict]:
    chart = json.loads(CHART_BENCHMARK.read_text(encoding="utf-8"))
    application = json.loads(APPLICATION_BENCHMARK.read_text(encoding="utf-8"))
    if chart.get("environment", {}).get("cpuThrottleRate") != 4:
        raise ValueError("Expected the 4x CPU chart benchmark")
    if application.get("schemaVersion") != 2:
        raise ValueError("Expected application benchmark schemaVersion 2")
    protocol = application.get("protocol", {})
    if protocol.get("historyPoints") != 100_000 or protocol.get("soakSeconds") != 3_600:
        raise ValueError("Expected 100,000-point, 60-minute application evidence")
    return chart, application


def milliseconds(value: float) -> str:
    return f"{value:,.1f}ms"


def decimal_kilobytes(value: int) -> str:
    return f"{value / 1_000:,.1f}KB"


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="PortfolioBold", fontSize=27,
            leading=34, textColor=INK, spaceAfter=5 * mm, alignment=TA_LEFT,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=base["Normal"], fontName="PortfolioBold", fontSize=14,
            leading=21, textColor=BLUE_DARK, leftIndent=5 * mm, borderColor=BLUE,
            borderWidth=0, borderPadding=(0, 0, 0, 0), spaceAfter=4 * mm,
        ),
        "identity": ParagraphStyle(
            "Identity", parent=base["Normal"], fontName="PortfolioBold", fontSize=10.5,
            leading=15, textColor=MUTED, spaceAfter=3 * mm,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Portfolio", fontSize=9.4,
            leading=15.1, textColor=INK, wordWrap="CJK", spaceAfter=2.8 * mm,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="Portfolio", fontSize=7.8,
            leading=11.8, textColor=MUTED, wordWrap="CJK",
        ),
        "caption": ParagraphStyle(
            "Caption", parent=base["BodyText"], fontName="Portfolio", fontSize=7.5,
            leading=11, textColor=MUTED, alignment=TA_CENTER, wordWrap="CJK",
            spaceAfter=3 * mm,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="PortfolioBold", fontSize=17,
            leading=23, textColor=INK, spaceBefore=7 * mm, spaceAfter=3.5 * mm,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "H3", parent=base["Heading3"], fontName="PortfolioBold", fontSize=12.2,
            leading=17, textColor=BLUE_DARK, spaceBefore=4.5 * mm, spaceAfter=2.2 * mm,
            keepWithNext=True,
        ),
        "summary": ParagraphStyle(
            "Summary", parent=base["Heading3"], fontName="PortfolioBold", fontSize=10.2,
            leading=15, textColor=INK, backColor=BLUE_PALE, borderColor=colors.HexColor("#CDDAFF"),
            borderWidth=0.6, borderPadding=(6, 8, 6, 8), spaceBefore=3 * mm, spaceAfter=3 * mm,
            keepWithNext=True,
        ),
        "code": ParagraphStyle(
            "Code", parent=base["Code"], fontName="Courier", fontSize=7.2,
            leading=11, textColor=colors.HexColor("#D9E2F3"), backColor=colors.HexColor("#111827"),
            borderPadding=(8, 8, 8, 8), leftIndent=0, rightIndent=0, spaceAfter=3.5 * mm,
        ),
        "table": ParagraphStyle(
            "Table", parent=base["BodyText"], fontName="Portfolio", fontSize=7.8,
            leading=11.2, textColor=INK, wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "TableHead", parent=base["BodyText"], fontName="PortfolioBold", fontSize=7.8,
            leading=11.2, textColor=WHITE, wordWrap="CJK",
        ),
        "list": ParagraphStyle(
            "List", parent=base["BodyText"], fontName="Portfolio", fontSize=9.2,
            leading=14.8, textColor=INK, wordWrap="CJK", leftIndent=0,
        ),
        "linkbar": ParagraphStyle(
            "LinkBar", parent=base["BodyText"], fontName="PortfolioBold", fontSize=8.6,
            leading=14, textColor=BLUE_DARK, backColor=BLUE_PALE,
            borderColor=colors.HexColor("#CDDAFF"), borderWidth=0.6,
            borderPadding=(7, 9, 7, 9), spaceAfter=4 * mm,
        ),
        "callout": ParagraphStyle(
            "Callout", parent=base["BodyText"], fontName="Portfolio", fontSize=9,
            leading=14.5, textColor=INK, backColor=AMBER_PALE,
            borderColor=colors.HexColor("#F2D28E"), borderWidth=0.6,
            borderPadding=(7, 9, 7, 9), spaceAfter=4 * mm,
        ),
        "closing": ParagraphStyle(
            "Closing", parent=base["BodyText"], fontName="Portfolio", fontSize=9.2,
            leading=14.5, textColor=INK, backColor=BLUE_PALE,
            borderColor=colors.HexColor("#CDDAFF"), borderWidth=0.6,
            borderPadding=(8, 10, 8, 10), spaceBefore=3 * mm,
        ),
    }


def draw_arrow(drawing: Drawing, x1: float, y1: float, x2: float, y2: float) -> None:
    drawing.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=1.2))
    drawing.add(Polygon([x2, y2, x2 - 5, y2 + 3, x2 - 5, y2 - 3], fillColor=colors.HexColor("#94A3B8"), strokeColor=None))


def architecture_diagram() -> Drawing:
    width, height = 475, 188
    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, rx=8, ry=8, fillColor=SURFACE, strokeColor=LINE_COLOR, strokeWidth=0.8))

    def node(x: float, y: float, w: float, label: str, accent: bool = False) -> None:
        fill = BLUE if accent else WHITE
        stroke = BLUE if accent else colors.HexColor("#C7D0DE")
        color = WHITE if accent else INK
        drawing.add(Rect(x, y, w, 28, rx=5, ry=5, fillColor=fill, strokeColor=stroke, strokeWidth=0.9))
        drawing.add(String(x + w / 2, y + 9.5, label, fontName="PortfolioBold", fontSize=7.2, fillColor=color, textAnchor="middle"))

    node(16, 134, 72, "REST 조회")
    node(128, 134, 92, "TanStack Query")
    node(262, 134, 64, "React UI", True)
    draw_arrow(drawing, 88, 148, 128, 148)
    draw_arrow(drawing, 220, 148, 262, 148)

    node(16, 76, 72, "WebSocket")
    node(108, 76, 76, "500ms 배치")
    node(204, 76, 88, "최근 30분 버퍼")
    node(312, 76, 88, "공통 극값 요약")
    node(420, 76, 42, "Canvas", True)
    draw_arrow(drawing, 88, 90, 108, 90)
    draw_arrow(drawing, 184, 90, 204, 90)
    draw_arrow(drawing, 292, 90, 312, 90)
    draw_arrow(drawing, 400, 90, 420, 90)

    node(72, 20, 82, "업무 명령")
    node(184, 20, 82, "IndexedDB")
    node(296, 20, 92, "Zustand 읽기 모델")
    draw_arrow(drawing, 294, 134, 154, 48)
    draw_arrow(drawing, 154, 34, 184, 34)
    draw_arrow(drawing, 266, 34, 296, 34)
    draw_arrow(drawing, 388, 34, 294, 134)
    return drawing


def image_flow(path_text: str, alt: str, max_width: float, max_height: float) -> list:
    image_path = (ROOT / path_text).resolve()
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    item = Image(str(image_path))
    scale = min(max_width / item.imageWidth, max_height / item.imageHeight, 1)
    item.drawWidth = item.imageWidth * scale
    item.drawHeight = item.imageHeight * scale
    caption = Paragraph(html.escape(alt), STYLES["caption"])
    return [item, caption]


def cropped_image_flow(
    path_text: str,
    alt: str,
    crop_box: tuple[int, int, int, int],
    max_width: float,
    max_height: float,
) -> list:
    image_path = (ROOT / path_text).resolve()
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    with PILImage.open(image_path) as source:
        cropped = source.crop(crop_box).convert("RGB")
        buffer = BytesIO()
        cropped.save(buffer, format="JPEG", quality=92, optimize=True)
    buffer.seek(0)
    item = Image(buffer)
    scale = min(max_width / item.imageWidth, max_height / item.imageHeight, 1)
    item.drawWidth = item.imageWidth * scale
    item.drawHeight = item.imageHeight * scale
    caption = Paragraph(html.escape(alt), STYLES["caption"])
    return [item, caption]


def table_flow(rows: list[list[str]], available_width: float) -> Table:
    column_count = len(rows[0])
    if column_count == 2:
        widths = [available_width * 0.22, available_width * 0.78]
    elif column_count == 3:
        widths = [available_width * 0.28, available_width * 0.51, available_width * 0.21]
    elif column_count == 4:
        widths = [available_width * 0.40, available_width * 0.20, available_width * 0.20, available_width * 0.20]
    else:
        widths = [available_width / column_count] * column_count
    data = []
    for row_index, row in enumerate(rows):
        style = STYLES["table_head"] if row_index == 0 else STYLES["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, SURFACE]),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def parse_table(lines: list[str], start: int) -> tuple[Table, int]:
    raw_rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        raw_rows.append(cells)
        index += 1
    if len(raw_rows) > 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in raw_rows[1]):
        raw_rows.pop(1)
    return table_flow(raw_rows, 171 * mm), index


def parse_list(lines: list[str], start: int, ordered: bool) -> tuple[ListFlowable, int]:
    items = []
    index = start
    pattern = r"^\d+\.\s+(.+)$" if ordered else r"^-\s+(.+)$"
    while index < len(lines):
        match = re.match(pattern, lines[index].strip())
        if not match:
            break
        items.append(ListItem(Paragraph(inline_markup(match.group(1)), STYLES["list"]), leftIndent=4 * mm))
        index += 1
    options = {
        "bulletType": "1" if ordered else "bullet",
        "leftIndent": 6 * mm,
        "bulletFontName": "PortfolioBold",
        "bulletFontSize": 8.5,
        "bulletColor": BLUE_DARK,
        "spaceAfter": 3 * mm,
    }
    if ordered:
        options["start"] = "1"
    else:
        options["bulletChar"] = "•"
    return ListFlowable(items, **options), index


def parse_mobile_pair(lines: list[str], start: int) -> tuple[Table, int]:
    index = start + 1
    cells = []
    while index < len(lines) and "</p>" not in lines[index]:
        match = re.search(r'<img src="([^"]+)"[^>]*alt="([^"]+)"', lines[index])
        if match:
            path_text, alt = match.group(1), html.unescape(match.group(2))
            image_items = image_flow(path_text, alt, 73 * mm, 133 * mm)
            cells.append(image_items)
        index += 1
    if len(cells) != 2:
        raise ValueError("Expected the README mobile screenshot pair")
    table = Table([cells], colWidths=[83 * mm, 83 * mm], hAlign="CENTER")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table, index + 1


def build_story() -> list:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story: list = []
    index = 0
    first_paragraph = True
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("```"):
            language = line[3:].strip()
            code = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            if language == "mermaid":
                story.extend([architecture_diagram(), Spacer(1, 3 * mm)])
            else:
                escaped = "<br/>".join(html.escape(item) if item else " " for item in code)
                story.append(Paragraph(escaped, STYLES["code"]))
            continue
        if line.startswith("# "):
            story.extend([
                Spacer(1, 7 * mm),
                Paragraph(html.escape(line[2:]), STYLES["title"]),
                HRFlowable(width="100%", thickness=2.2, color=BLUE, spaceAfter=5 * mm),
            ])
            index += 1
            continue
        if line.startswith("## "):
            if line[3:] == "문서와 화면 기록":
                story.append(PageBreak())
            story.append(Paragraph(html.escape(line[3:]), STYLES["h2"]))
            index += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(html.escape(line[4:]), STYLES["h3"]))
            index += 1
            continue
        if line.startswith("> "):
            story.append(Paragraph(html.escape(line[2:]), STYLES["subtitle"]))
            index += 1
            continue
        if line.startswith("<summary>"):
            summary = re.sub(r"</?summary>", "", line)
            story.append(Paragraph(f"추가 화면  |  {html.escape(summary)}", STYLES["summary"]))
            index += 1
            continue
        if line in {"<details>", "</details>"}:
            index += 1
            continue
        if line == "<p>":
            pair, index = parse_mobile_pair(lines, index)
            story.append(pair)
            continue
        badge_match = re.match(r"^\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)$", line)
        if badge_match:
            label, _, target = badge_match.groups()
            story.append(Paragraph(
                f'<a href="{html.escape(target, quote=True)}" color="{GREEN.hexval()}">'
                f'<b>{html.escape(label)} 상태 - GitHub Actions에서 확인</b></a>',
                STYLES["small"],
            ))
            story.append(Spacer(1, 2 * mm))
            index += 1
            continue
        image_match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
        if image_match:
            alt, path_text = image_match.group(1), image_match.group(2)
            if path_text.startswith("https://"):
                story.append(Paragraph(
                    f'<a href="{html.escape(path_text, quote=True)}" color="{GREEN.hexval()}"><b>CI 상태 배지 - GitHub Actions에서 확인</b></a>',
                    STYLES["small"],
                ))
                story.append(Spacer(1, 2 * mm))
            else:
                story.extend(image_flow(path_text, alt, 171 * mm, 168 * mm))
            index += 1
            continue
        if line.startswith("|"):
            table, index = parse_table(lines, index)
            story.extend([table, Spacer(1, 3 * mm)])
            continue
        if re.match(r"^\d+\.\s+", line):
            listing, index = parse_list(lines, index, True)
            story.append(listing)
            continue
        if line.startswith("- "):
            listing, index = parse_list(lines, index, False)
            story.append(listing)
            continue

        paragraph_lines = [line]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                break
            if re.match(r"^(#{1,3}\s|>|```|\||\d+\.\s|-\s|!\[|<details>|</details>|<summary>|<p>)", candidate):
                break
            paragraph_lines.append(candidate)
            index += 1
        paragraph_text = " ".join(paragraph_lines)
        if first_paragraph:
            story.append(Paragraph(inline_markup(paragraph_text), STYLES["body"]))
            first_paragraph = False
        elif " | " in paragraph_text and paragraph_text.count("[") >= 2:
            story.append(Paragraph(inline_markup(paragraph_text), STYLES["linkbar"]))
        elif paragraph_text.startswith("**공개 데모:"):
            story.append(Paragraph(inline_markup(paragraph_text), STYLES["callout"]))
        else:
            story.append(Paragraph(inline_markup(paragraph_text), STYLES["body"]))
    return story


def submission_story() -> list:
    """Build a concise hiring submission while README stays long-form."""
    source = SOURCE.read_text(encoding="utf-8")
    required_claims = [
        "웹 108개, 서버 17개 통과",
        "Chromium E2E 58개 통과",
        "Canvas 동기 렌더 중앙값",
        "2026년 8월 30일 시작한 개인 프로젝트",
        "AI 개발 도구를 활용했습니다",
        "실제 PLC, MES, SCADA, OPC-UA, MQTT 연동이나 AI 추론 엔진이 없습니다",
    ]
    missing = [claim for claim in required_claims if claim not in source]
    if missing:
        raise ValueError(f"README evidence changed; review these PDF claims: {missing}")

    chart_benchmark, application_benchmark = load_benchmark_evidence()
    chart_render = chart_benchmark["synchronizedChartRender"]
    chart_total = chart_benchmark["chartPreparationAndDraw"]
    chart_bundle = chart_benchmark["echartsImportBundle"]
    chart_environment = chart_benchmark["environment"]
    chart_sampling = chart_benchmark["chartPreparation"]["samplingOnly"]

    coater_all = application_benchmark["aggregated"]["COATER-02"]["all"]
    coater_steady = application_benchmark["aggregated"]["COATER-02"]["steady"]
    dryer_all = application_benchmark["aggregated"]["DRYER-02"]["all"]
    dryer_steady = application_benchmark["aggregated"]["DRYER-02"]["steady"]
    application_environment = application_benchmark["environment"]
    protocol = application_benchmark["protocol"]
    soak_run = next(run for run in application_benchmark["runs"] if run["kind"] == "soak")
    soak_steady = soak_run["steadySummary"]
    retained_counts = [item["rawPoints"] for item in soak_run["observations"]]
    displayed_counts = [item["displayedPoints"] for item in soak_run["observations"]]
    long_task_max = max(item["durationMs"] for item in soak_run["raw"]["longTasks"])
    if soak_run["errors"] or soak_run["network"]["failed"] or soak_run["network"]["httpErrors"]:
        raise ValueError("The submission PDF only accepts an error-free stress artifact")

    def p(text: str, style: str = "body") -> Paragraph:
        return Paragraph(inline_markup(text), STYLES[style])

    def h(text: str, level: int = 2) -> Paragraph:
        return Paragraph(html.escape(text), STYLES["h2" if level == 2 else "h3"])

    def bullets(items: list[str]) -> ListFlowable:
        return ListFlowable(
            [ListItem(p(item, "list"), leftIndent=4 * mm) for item in items],
            bulletType="bullet", bulletChar="•", leftIndent=6 * mm,
            bulletFontName="PortfolioBold", bulletFontSize=8.5,
            bulletColor=BLUE_DARK, spaceAfter=3 * mm,
        )

    mobile_cells = [
        cropped_image_flow(
            "docs/design/review-2026-08-31/40-coater-issued-mobile.jpg",
            "작업 지시 발행 확대: 번호, 담당자와 기한 확인",
            (10, 0, 380, 680), 70 * mm, 104 * mm,
        ),
        cropped_image_flow(
            "docs/design/review-2026-08-31/43-coater-resolved-mobile.jpg",
            "이상 종결 확대: 점검 완료와 별도의 처리 이력",
            (10, 175, 380, 835), 70 * mm, 104 * mm,
        ),
    ]
    mobile_pair = Table([mobile_cells], colWidths=[83 * mm, 83 * mm], hAlign="CENTER")
    mobile_pair.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    story: list = [
        Spacer(1, 7 * mm),
        Paragraph("NEXUS Forge", STYLES["title"]),
        Paragraph("곽현, Frontend Engineer", STYLES["identity"]),
        HRFlowable(width="100%", thickness=2.2, color=BLUE, spaceAfter=4 * mm),
        Paragraph("제조 이상 진단과 점검 결과 처리를 구현한 실시간 프론트엔드 공개 데모", STYLES["subtitle"]),
        p("배터리 코팅 라인의 이상을 찾고, 센서 신호를 비교해 작업 지시를 발행한 뒤 점검 결과와 이상 종결 사유를 기록합니다. React와 TypeScript로 실시간 시각화, 장애 복구와 업무 상태 전이를 구현했습니다."),
        p("**공개 데모:** 결정론적 합성 데이터를 사용합니다. 실제 설비 제어, AI 추론 결과나 고객사 운영 실적을 제공하지 않습니다.", "callout"),
        p("[공개 데모](https://nexus-forge-ten.vercel.app/overview) | [GitHub](https://github.com/kwakhyun/nexus-forge) | [기술 판단 사례](./docs/ENGINEERING_CASE_STUDIES.md) | [성능 측정](./docs/PERFORMANCE.md)", "linkbar"),
        p("**검증:** 현재 소스는 로컬에서 웹 108개, 서버 17개와 Chromium E2E 58개를 통과했습니다. 공개 데모는 `main`의 CI를 통과한 뒤 배포하며 `/api/health`에서 배포 SHA를 확인합니다.", "summary"),
        h("먼저 볼 네 가지 구현"),
        table_flow([
            ["문제", "해결 방식", "근거"],
            ["센서 피크가 사라지는 시계열 요약", "구간 경계와 센서별 최솟값·최댓값 시점을 합치고 ECharts 추가 샘플링 비활성화", "90N 피크 회귀"],
            ["소켓 연결 중 센서 데이터만 멈춤", "신선도와 하트비트를 따로 감시하고 근거가 유효하지 않으면 작업 지시 발행 보류", "장애 복구 E2E"],
            ["설비마다 다시 만드는 진단 화면", "두 설비의 패널·기준값·안전 조건을 공통 구현에 연결하고 데이터 혼입 차단", "두 설비 재사용"],
            ["화면 이동과 다른 탭 저장에 따른 입력 유실", "IndexedDB 트랜잭션, 필드별 충돌 검사, 탭 전용 초안과 명시적 취소 분리", "다중 탭 회귀"],
        ], 171 * mm),
        Spacer(1, 2 * mm),
        h("핵심 업무 흐름"),
        bullets([
            "공정 개요에서 `COATER-02` 이상을 선택하고 동기화된 센서와 이상 발생 시점 참고값을 확인합니다.",
            "안전 조건을 확인한 뒤 작업 지시를 발행하고, 정비 관리에서 점검 결과를 기록해 완료합니다.",
            "연결 작업이 모두 끝난 뒤 잔여 위험과 사유를 남겨 이상을 별도로 종결합니다.",
            "`DRYER-02`로 전환해도 데이터와 작업 지시 발행 결과가 섞이지 않으며 새로고침 뒤 업무 이력을 복원합니다.",
        ]),
        PageBreak(),
        h("핵심 화면"),
        p("실제 실행 화면의 센서값과 생산 실적은 합성 데이터이며, 작업 기록은 데모에서 입력한 내용입니다."),
        h("공정 개요 - 이상 설비에서 진단으로", 3),
        p("두 라인의 12대 설비를 공정 순서로 보여주고, 선택한 이상의 위치와 권장 조치를 진단 화면으로 연결합니다."),
        *image_flow("docs/design/review-2026-08-31/01-overview-desktop.jpg", "공정 개요: 12대 설비 상태와 코팅 2호 라인의 이상", 145 * mm, 82 * mm),
        h("신호 진단 - 같은 시간축에서 센서와 근거 비교", 3),
        p("장력, 온도, 속도와 검사 결함률을 비교하고 이상 발생 시점 참고값, 이벤트와 합성 시나리오에서 설정한 원인 후보와 근거를 함께 표시합니다."),
        *cropped_image_flow(
            "docs/design/review-2026-08-31/64-coater-reference-cards-recovered.jpg",
            "COATER-02 확대: 동기화된 네 개 차트, 이상 발생 시점 참고값과 원인 후보의 근거",
            (230, 90, 1430, 790), 145 * mm, 82 * mm,
        ),
        PageBreak(),
        h("두 번째 설비 재사용과 후속 처리"),
        p("두 설비는 진단 페이지와 차트 렌더러, 작업 지시 발행과 상태 전이 로직을 공유합니다. DRYER-02는 장력 패널 없이 온도, 속도와 후단 검사 신호를 표시하고 165°C 설정값과 별도의 안전 조건을 적용합니다."),
        *image_flow("docs/design/review-2026-08-31/06-dryer-desktop.jpg", "DRYER-02: 세 개 신호 패널과 설비별 원인 후보와 근거", 120 * mm, 75 * mm),
        h("작업 지시 발행 → 점검 완료 → 이상 종결", 3),
        p("작업 번호, 담당자와 기한을 확인해 작업 지시를 발행한 뒤 점검 결과를 기록하고, 이상은 별도로 종결합니다. 작업을 완료해도 합성 수율이나 센서값은 바꾸지 않습니다."),
        mobile_pair,
        p("두 설비의 처리 결과는 생산 분석에 미종결 이상 0건, 점검 완료와 이상 종결 각 2건으로 표시하며 합성 생산 실적과 구분합니다.", "small"),
        PageBreak(),
        h("프론트엔드 구조와 시계열 처리"),
        table_flow([
            ["영역", "구현"],
            ["프론트엔드", "React 19, TypeScript, Vite, TanStack Query, Zustand, ECharts Canvas"],
            ["실시간 데이터", "Node.js REST/WebSocket, 500ms 수신 배치, 최근 30분 링 버퍼"],
            ["업무 상태", "IndexedDB 트랜잭션, 탭 간 갱신, 입력 충돌 검사"],
            ["품질", "Turborepo, Vitest, Testing Library, Playwright, Storybook, GitHub Actions"],
        ], 171 * mm),
        Spacer(1, 3 * mm),
        p("TanStack Query는 조회·캐시를 관리하고 Zustand는 고빈도 센서 상태, 저빈도 업무 상태와 저장 전 입력을 분리합니다. IndexedDB 트랜잭션이 끝난 뒤에만 성공을 표시합니다."),
        architecture_diagram(),
        Spacer(1, 2 * mm),
        h("시계열 요약의 보장 범위", 3),
        p("공개 데모는 18,000개 시점을 받고, 성능 검증 API는 100,000개까지 허용합니다. 입력이 20,000개를 넘으면 전체 30분 구간을 최대 20,000개로 먼저 줄이고 차트에는 최대 1,800개의 공통 시점을 전달합니다. 구간 경계와 다섯 센서별 최솟값과 최댓값을 보존하지만, 모든 작은 피크의 반복 횟수와 지속 시간까지 보존하지는 않습니다."),
        h("10만 개 시점 차트 전후 비교", 3),
        table_flow([
            ["측정 항목", "원본/전체 import", "현재 요약/Core", "변화"],
            ["ECharts 번들, gzip", decimal_kilobytes(chart_bundle["baseline"]["gzipBytes"]), decimal_kilobytes(chart_bundle["optimized"]["gzipBytes"]), f'{chart_bundle["gzipReductionPercent"]:.1f}% 감소'],
            ["Canvas 렌더 중앙값", milliseconds(chart_render["baseline"]["medianMs"]), milliseconds(chart_render["optimized"]["medianMs"]), f'{chart_render["medianReductionPercent"]:.1f}% 감소'],
            ["준비 + 렌더 중앙값", milliseconds(chart_total["baseline"]["medianMs"]), milliseconds(chart_total["optimized"]["medianMs"]), f'{(1 - chart_total["optimized"]["medianMs"] / chart_total["baseline"]["medianMs"]) * 100:.1f}% 감소'],
            ["Canvas 렌더 p95", milliseconds(chart_render["baseline"]["p95Ms"]), milliseconds(chart_render["optimized"]["p95Ms"]), f'{chart_environment["repetitions"]}회 표본'],
        ], 171 * mm),
        p(f'Apple M2, Chromium 151, 1200×700, DPR 1에서 CDP로 CPU 실행을 {chart_environment["cpuThrottleRate"]}배 느리게 제한했습니다. {chart_environment["warmupsPerScenario"]}회 예열 후 {chart_environment["repetitions"]}회 측정했으며 원본 {chart_render["baseline"]["points"]:,}개와 선택된 {chart_render["optimized"]["points"]:,}개 시점을 비교했습니다. 샘플링만의 중앙값은 {milliseconds(chart_sampling["medianMs"])}입니다. 물리 저사양 단말, 네트워크, React 갱신과 장시간 부하는 이 표에서 제외했습니다.', "small"),
        PageBreak(),
        h("실제 앱의 진단과 작업 지시 발행 흐름"),
        p(f'프로덕션 빌드와 REST/WebSocket 런타임에서 {protocol["historyPoints"]:,}개 시점 응답을 사용했습니다. 두 설비를 각각 {protocol["runsPerEquipment"]}회, {protocol["observationSeconds"]}초씩 측정한 뒤 COATER-02를 60분 관찰했습니다. Apple M2, Chromium headless, 1440×1024, DPR 1, CPU {application_environment["cpuThrottleRate"]}배 제한과 로컬 HTTP/WS 조건입니다. 공개 Vercel이나 물리 저사양 단말 결과는 아닙니다.'),
        table_flow([
            ["측정 구간", "통계 / 표본", "COATER-02", "DRYER-02"],
            ["설비 선택 → 첫 이력", f'중앙값 / {coater_all["equipment_click_to_history_frame_opportunity"]["samples"]}', milliseconds(coater_all["equipment_click_to_history_frame_opportunity"]["medianMs"]), milliseconds(dryer_all["equipment_click_to_history_frame_opportunity"]["medianMs"])],
            ["이력 요청 → 파싱·검증", f'중앙값 / {coater_all["history_fetch_parse_validate"]["samples"]}', milliseconds(coater_all["history_fetch_parse_validate"]["medianMs"]), milliseconds(dryer_all["history_fetch_parse_validate"]["medianMs"])],
            ["이력 요청 → 첫 반영", f'중앙값 / {coater_all["history_request_to_frame_opportunity"]["samples"]}', milliseconds(coater_all["history_request_to_frame_opportunity"]["medianMs"]), milliseconds(dryer_all["history_request_to_frame_opportunity"]["medianMs"])],
            ["최신 수신 → 차트", f'p95 / {coater_steady["stream_latest_receive_to_frame_opportunity"]["samples"]}', milliseconds(coater_steady["stream_latest_receive_to_frame_opportunity"]["p95Ms"]), milliseconds(dryer_steady["stream_latest_receive_to_frame_opportunity"]["p95Ms"])],
            ["배치 상태 → 차트", f'p95 / {coater_steady["batch_commit_to_frame_opportunity"]["samples"]}', milliseconds(coater_steady["batch_commit_to_frame_opportunity"]["p95Ms"]), milliseconds(dryer_steady["batch_commit_to_frame_opportunity"]["p95Ms"])],
            ["작업 지시 발행 → 결과", f'중앙값 / {coater_all["verification_submit_to_result_frame_opportunity"]["samples"]}', milliseconds(coater_all["verification_submit_to_result_frame_opportunity"]["medianMs"]), milliseconds(dryer_all["verification_submit_to_result_frame_opportunity"]["medianMs"])],
        ], 171 * mm),
        p(f'차트 반영 시간은 ECharts의 `finished` 이후 두 번의 렌더 프레임 기회까지이며 실제 픽셀 합성 완료 시각은 아닙니다. 60분 실행에서 최신 수신→차트 반영 {soak_steady["stream_latest_receive_to_frame_opportunity"]["samples"]:,}개 표본의 p95는 {milliseconds(soak_steady["stream_latest_receive_to_frame_opportunity"]["p95Ms"])}였고, 상태 반영→차트 반영 p95는 {milliseconds(soak_steady["batch_commit_to_frame_opportunity"]["p95Ms"])}였습니다. {len(soak_run["observations"]) - 2}개 체크포인트에서 보존 시점은 {min(retained_counts):,}–{max(retained_counts):,}개, 표시 시점은 {min(displayed_counts):,}–{max(displayed_counts):,}개였습니다.'),
        p(f'관찰 구간 Long Task는 {soak_run["longTasks"]["steady"]}건, 최댓값은 {long_task_max:.0f}ms, 50ms 초과 누적 차단은 {soak_run["longTasks"]["steadyBlockingMs"]:,}ms였습니다. 강제 GC 뒤 사용 힙은 {soak_run["heap"]["initialAfterGc"]["usedBytes"] / 1_000_000:.1f}MB에서 {soak_run["heap"]["endAfterGc"]["usedBytes"] / 1_000_000:.1f}MB로 {soak_run["heap"]["retainedGrowthBytes"] / 1_000_000:.1f}MB 증가했습니다. 오류와 실패 요청은 0건이지만 제한된 1시간 관찰은 메모리 누수 부재나 8시간 교대 안정성을 증명하지 않습니다.', "small"),
        h("기여 범위", 3),
        p("2026년 8월 30일 시작한 개인 프로젝트입니다. 지원 포지션과 개발 범위, 개선 우선순위, 공개 데모 표시 기준을 정했습니다. 실제 화면에서 발견한 결함의 재현 조건과 완료 기준을 기록하고, 수정 후 테스트와 배포 결과를 확인했습니다. GitHub 저장소 생성과 Vercel 연결도 직접 진행했습니다."),
        p("제품 방향과 디자인 대안을 탐색하고 구현, 테스트, 문서를 작성하는 과정에서 AI 개발 도구를 활용했습니다. 작성자는 요구사항 충족 여부, 검증 결과와 공개 범위를 최종 확인했습니다. 이 프로젝트를 실제 제조 고객사 운영 경험이나 모든 코드를 수작업으로 작성한 사례로 제시하지 않습니다. [기술 판단 사례](./docs/ENGINEERING_CASE_STUDIES.md)에 선택한 대안과 검증 비용을 공개합니다."),
        h("검증과 공개 범위"),
        table_flow([
            ["검증", "결과와 범위"],
            ["현재 소스 로컬", "웹 108개, 서버 17개, lint와 TypeScript 검사, 전체 빌드 통과"],
            ["업무 흐름", "현재 소스의 Chromium E2E 58개 통과. 실패·생략·재시도 0개"],
            ["화면 검수", "일곱 화면과 두 설비의 작업 지시 발행 → 점검 완료 → 이상 종결 → 새로고침 복원 확인. 모바일 16조건과 키보드 조작 확인"],
            ["빌드와 배포", "전체 빌드, Storybook과 Sites 호환성 검사 통과. Vercel 자동 배포와 SHA 일치 확인"],
        ], 171 * mm),
        h("공개 배포", 3),
        p("`main`의 GitHub Actions 검증 성공 후에만 배포합니다. E2E가 재시도 후에야 통과한 경우에도 배포를 차단합니다. 배포 뒤에는 `/api/health` SHA와 커밋을 대조하고, 8개 화면 경로와 두 설비의 REST 이력 조회 및 WebSocket 수신을 확인합니다."),
        h("운영 한계", 3),
        bullets([
            "실제 PLC, MES, SCADA, OPC-UA, MQTT 연결이나 AI 추론 엔진이 없습니다. 합성 시나리오는 실제 라인의 물리적 인과 모델이 아닙니다.",
            "업무 기록은 브라우저 IndexedDB에만 저장하며 기기 간 동기화, 서버 백업, 인증·권한·승인·불변 감사 로그를 지원하지 않습니다.",
            "서버가 반환한 작업 지시 발행 결과는 인스턴스 메모리에 최대 100건만 남습니다. 물리 저사양 단말, 실제 제조 네트워크, 다중 사용자와 8시간 교대 규모는 검증하지 않았습니다.",
        ]),
        h("검증 근거와 재현", 3),
        table_flow([
            ["근거", "확인 범위"],
            ["차트 스트레스", "10만 개 시점, CPU 4배 제한, 20회 표본의 Canvas 렌더와 번들 비교"],
            ["실제 앱 스트레스", "두 설비의 3회 흐름과 COATER-02 60분 수신, 힙·Long Task·오류·소스 해시"],
            ["업무 회귀", "두 설비의 진단, 작업 지시 발행, 복구, 모바일과 접근성 조건을 포함한 E2E 58개"],
        ], 171 * mm),
        p("[차트 원본](./docs/benchmarks/performance-stress-2026-09-01.json) | [60분 앱 원본](./docs/benchmarks/application-stress-2026-09-01.json) | [성능 측정 방법](./docs/PERFORMANCE.md)", "linkbar"),
        h("설계 배경과 다음 검증", 3),
        p("[공개 산업 R&D 정보](https://itech.keit.re.kr/ntcinfo/infoSrch/retrieveKeyWrdSrchList.do)와 제조 운영 소프트웨어 관련 공개 자료를 참고해 독립적인 제조 운영 데모를 설계했습니다. 특정 상용 제품의 비공개 화면을 복제하지 않았으며, 기업이나 고객사의 내부 정보도 사용하지 않았습니다. 실제 커넥터, Ontology 탐색, 인증과 2D/3D 공장 시각화는 미구현 확장 범위입니다."),
        p("[공개 데모](https://nexus-forge-ten.vercel.app/overview) | [GitHub 저장소](https://github.com/kwakhyun/nexus-forge) | [최종 검증 기록](./docs/FINAL_VERIFICATION_2026-08-31.md) | [두 설비 재사용](./docs/EQUIPMENT_REUSE.md)", "linkbar"),
        Paragraph(
            f'<b>곽현</b>, Frontend Engineer<br/>'
            f'<a href="https://github.com/kwakhyun" color="{BLUE.hexval()}"><u>GitHub: kwakhyun</u></a>',
            STYLES["closing"],
        ),
    ]
    return story


def decorate_page(canvas, document) -> None:
    canvas.saveState()
    page_number = canvas.getPageNumber()
    width, height = A4
    if page_number > 1:
        canvas.setStrokeColor(LINE_COLOR)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, height - 13 * mm, width - 20 * mm, height - 13 * mm)
        canvas.setFont("PortfolioBold", 7.4)
        canvas.setFillColor(INK)
        canvas.drawString(20 * mm, height - 10 * mm, "NEXUS Forge")
        canvas.setFont("Portfolio", 7.1)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(width - 20 * mm, height - 10 * mm, "곽현, Frontend Engineer")
    canvas.setStrokeColor(LINE_COLOR)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, 12 * mm, width - 20 * mm, 12 * mm)
    canvas.setFont("Portfolio", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 8 * mm, "공개 데모, 합성 데이터, 실제 설비 제어 없음")
    canvas.drawRightString(width - 20 * mm, 8 * mm, f"{page_number}")
    canvas.restoreState()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=17 * mm,
        title="NEXUS Forge - 곽현 Frontend Engineer Portfolio",
        author="곽현",
        subject="제조 운영 프론트엔드 공개 데모 채용 포트폴리오",
        creator="README.md evidence + ReportLab",
    )
    document.build(submission_story(), onFirstPage=decorate_page, onLaterPages=decorate_page)
    print(OUTPUT)


STYLES: dict[str, ParagraphStyle]

if __name__ == "__main__":
    register_fonts()
    STYLES = make_styles()
    main()
