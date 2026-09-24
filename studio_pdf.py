"""Generate a project-only direction PDF without script planning or media."""
from io import BytesIO
from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PAGE_SIZE = (13.333 * inch, 7.5 * inch)
FIELDS = (
    ('outline', '专场创意大纲'),
    ('description', '创意描述'),
    ('meaning', '创意寓意'),
    ('scene', '场景搭建参考'),
    ('art', '美术制景参考'),
    ('atmosphere', '整体影像氛围参考'),
    ('camera', '摄影调性参考'),
)
BG = HexColor('#14121A')
INK = HexColor('#F6F2E9')
MUTED = HexColor('#B7AE9F')
ACCENT = HexColor('#D7EF9B')
PANEL = HexColor('#20251E')
FONT = 'LanceCN'


def _clean(value, limit=8000):
    value = str(value or '').replace('\r', '').strip()
    return value[:limit] or '待确认'


def validate_project_overview(payload):
    if not isinstance(payload, dict):
        raise ValueError('专场汇报数据格式错误')
    fields = payload.get('fields')
    if not isinstance(fields, dict):
        raise ValueError('请先完成整体方向')
    missing = [label for key, label in FIELDS if not str(fields.get(key) or '').strip()]
    if not str(payload.get('title') or '').strip():
        missing.insert(0, '专场名称')
    if missing:
        raise ValueError('请先补充：' + '、'.join(missing))
    return {
        'title': _clean(payload.get('title'), 200),
        'date': _clean(payload.get('date'), 80),
        'idea': _clean(payload.get('idea')),
        'fields': {key: _clean(fields.get(key)) for key, _ in FIELDS},
        'report': {key: _clean(value) for key, value in (payload.get('report') or {}).items() if isinstance(key, str)},
    }


def _register_font():
    if FONT in pdfmetrics.getRegisteredFontNames():
        return
    candidates = (
        '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/System/Library/Fonts/Supplemental/Songti.ttc',
    )
    for path in candidates:
        if not Path(path).is_file():
            continue
        try:
            pdfmetrics.registerFont(TTFont(FONT, path, subfontIndex=0)); return
        except Exception:
            continue
    raise RuntimeError('系统缺少中文PDF字体，请安装 Noto Sans CJK')


def _wrap(text, size, width):
    lines = []
    for paragraph in _clean(text).split('\n'):
        current = ''
        for char in paragraph:
            candidate = current + char
            if pdfmetrics.stringWidth(candidate, FONT, size) <= width:
                current = candidate
            elif char in '，。；：！？、）》」”' and current:
                lines.append(current + char); current = ''
            else:
                if current:
                    lines.append(current)
                current = char
        lines.append(current or ' ')
    return lines


def _base(c, page, label):
    w, h = PAGE_SIZE
    c.setFillColor(BG); c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(ACCENT); c.setFont(FONT, 9); c.drawString(0.65*inch, h-0.45*inch, 'LANCE  内容策划')
    c.setFillColor(MUTED); c.drawRightString(w-0.65*inch, h-0.45*inch, '专场整体方向 · 不含脚本')
    c.drawRightString(w-0.65*inch, 0.35*inch, f'{page:02d}')
    c.setFillColor(INK); c.setFont(FONT, 28); c.drawString(0.65*inch, h-1.08*inch, label)


def _section_page(c, page, title, sections):
    _base(c, page, title)
    w, h = PAGE_SIZE; y = h-1.62*inch
    gap = 0.18*inch; available = y-0.62*inch
    heights = []
    for _, body in sections:
        lines = _wrap(body, 13, w-4.15*inch)
        heights.append(max(0.92*inch, len(lines)*0.23*inch + 0.35*inch))
    scale = min(1, available / max(sum(heights)+gap*(len(heights)-1), 1))
    for (label, body), raw_height in zip(sections, heights):
        box_h = raw_height*scale
        c.setFillColor(PANEL); c.roundRect(0.65*inch, y-box_h, w-1.3*inch, box_h, 10, fill=1, stroke=0)
        c.setFillColor(ACCENT); c.setFont(FONT, 13); c.drawString(0.88*inch, y-0.32*inch, label)
        c.setFillColor(INK); c.setFont(FONT, 13)
        ty = y-0.30*inch
        for line in _wrap(body, 13, w-4.15*inch)[:max(2, int((box_h-0.25*inch)/(0.23*inch)))]:
            c.drawString(3.0*inch, ty, line); ty -= 0.23*inch
        y -= box_h+gap
    c.showPage()


def project_overview_pdf(payload):
    data = validate_project_overview(payload); _register_font()
    output = BytesIO(); c = canvas.Canvas(output, pagesize=PAGE_SIZE)
    c.setTitle(data['title'] + ' · 专场整体方向'); c.setAuthor('Lance')
    w, h = PAGE_SIZE
    _base(c, 1, data['title'])
    c.setFillColor(ACCENT); c.setFont(FONT, 16); c.drawString(0.68*inch, h-2.05*inch, '快速汇报 PDF')
    c.setFillColor(INK); c.setFont(FONT, 24)
    y = h-2.65*inch
    for line in _wrap(data['fields']['outline'], 24, w-1.6*inch)[:5]:
        c.drawString(0.68*inch, y, line); y -= 0.43*inch
    c.setFillColor(MUTED); c.setFont(FONT, 11)
    c.drawString(0.68*inch, 0.78*inch, '汇报范围：整体主张、场景美术、影像摄影 · 不包含单条脚本')
    c.showPage()
    _section_page(c, 2, '结论先行', [('主推方向', data['fields']['outline']), ('创意寓意', data['fields']['meaning']), ('创意描述', data['fields']['description'])])
    _section_page(c, 3, '空间与美术', [('场景搭建', data['fields']['scene']), ('美术制景', data['fields']['art'])])
    _section_page(c, 4, '影像与摄影', [('整体影像氛围', data['fields']['atmosphere']), ('摄影调性', data['fields']['camera'])])
    report = data['report']
    _section_page(c, 5, '需求与边界', [('项目需求', data['idea']), ('已确认信息', report.get('confirmed', '待确认')), ('待确认事项', report.get('pending', '日期、预算、场地、人员与执行边界待确认'))])
    _section_page(c, 6, '本次需要拍板', [('需要决策', report.get('decisions', '主推方向、场景规模、影像调性与拍摄安排')), ('下一步', '整体方向确认后，再决定是否规划单条内容。脚本数量不是本次汇报的必要条件。')])
    c.save(); return output.getvalue()


def write_project_overview_pdf(payload, path):
    path.write_bytes(project_overview_pdf(payload)); return path
