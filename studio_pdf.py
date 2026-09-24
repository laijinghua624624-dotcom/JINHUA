"""Generate a project-only direction PDF without script planning or media."""
from io import BytesIO
from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
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
        'wardrobeSuggestion': _clean(payload.get('wardrobeSuggestion')),
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
    c.setFillColor(MUTED); c.drawRightString(w-0.65*inch, h-0.45*inch, getattr(c, '_lance_report_header', '专场整体方向 · 不含脚本'))
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
    _section_page(c, 4, '影像、摄影与服装', [('整体影像氛围', data['fields']['atmosphere']), ('摄影调性', data['fields']['camera']), ('服装搭配建议', data['wardrobeSuggestion'])])
    report = data['report']
    _section_page(c, 5, '需求与边界', [('项目需求', data['idea']), ('已确认信息', report.get('confirmed', '待确认')), ('待确认事项', report.get('pending', '日期、预算、场地、人员与执行边界待确认'))])
    _section_page(c, 6, '本次需要拍板', [('需要决策', report.get('decisions', '主推方向、场景规模、影像调性与拍摄安排')), ('下一步', '整体方向确认后，再决定是否规划单条内容。脚本数量不是本次汇报的必要条件。')])
    c.save(); return output.getvalue()


def write_project_overview_pdf(payload, path):
    path.write_bytes(project_overview_pdf(payload)); return path


REVERSE_REQUIRED = (
    ('origin', '创意来源与推导链'), ('fit', '内容目标与创意贴合度'),
    ('intent', '创作意图'), ('concept', '核心创作概念'),
    ('outline', '创意大纲'), ('description', '叙事逻辑'),
    ('script', '完整故事脚本'), ('landing', '从故事到落地的执行路径'),
    ('reuse', '可复用创意机制'),
)


def validate_reverse_story(payload, frame_loader):
    if not isinstance(payload, dict) or not isinstance(payload.get('analysis'), dict):
        raise ValueError('请先完成视频反推')
    title = _clean(payload.get('title'), 200)
    fields = payload['analysis'].get('fields')
    shots = payload['analysis'].get('shots')
    if not isinstance(fields, dict) or not isinstance(shots, list) or not shots:
        raise ValueError('反推脚本或镜头故事不完整')
    missing = [label for key, label in REVERSE_REQUIRED if not str(fields.get(key) or '').strip()]
    if missing:
        raise ValueError('请先补充：' + '、'.join(missing))
    frames = payload.get('frames')
    if not isinstance(frames, list):
        raise ValueError('关键帧资料无效')
    clean_shots = []
    for index, shot in enumerate(shots):
        if not isinstance(shot, dict) or not isinstance(shot.get('frameIndex'), int):
            raise ValueError('镜头故事缺少关键帧索引')
        frame_index = shot['frameIndex']
        if frame_index < 0 or frame_index >= len(frames) or not isinstance(frames[frame_index], dict):
            raise ValueError('镜头故事引用了不存在的关键帧')
        local_id = frames[frame_index].get('localId')
        image_path = frame_loader(local_id)
        clean_shots.append({
            'number': index + 1,
            'timestamp': float(shot.get('timestamp') or frames[frame_index].get('timestamp') or 0),
            'image': image_path,
            **{key: _clean(shot.get(key), 6000) for key in (
                'story', 'narrativeRole', 'action', 'emotion', 'visual', 'camera',
                'cameraMovement', 'editThinking', 'dialogue', 'transition', 'evidence', 'note')},
        })
    return {
        'title': title,
        'purpose': '历史项目重建' if payload.get('purpose') == 'archive' else '参考片拆解',
        'type': _clean(payload.get('type'), 100),
        'fields': {str(key): _clean(value) for key, value in fields.items()},
        'shots': clean_shots,
        'basis': _clean(payload['analysis'].get('basis')),
    }


def _text_pages(c, page, title, body, subtitle=''):
    lines = _wrap(body, 14, PAGE_SIZE[0] - 1.4*inch)
    per_page = 19
    for offset in range(0, max(len(lines), 1), per_page):
        label = title + ('（续）' if offset else '')
        _base(c, page, label)
        if subtitle:
            c.setFillColor(ACCENT); c.setFont(FONT, 10); c.drawString(0.68*inch, PAGE_SIZE[1]-1.42*inch, subtitle)
        c.setFillColor(INK); c.setFont(FONT, 14); y = PAGE_SIZE[1]-1.85*inch
        for line in lines[offset:offset+per_page]:
            c.drawString(0.68*inch, y, line); y -= 0.285*inch
        c.showPage(); page += 1
    return page


def _draw_frame(c, path, x, y, width, height):
    image = ImageReader(str(path)); iw, ih = image.getSize()
    scale = min(width/max(iw, 1), height/max(ih, 1))
    draw_w, draw_h = iw*scale, ih*scale
    c.setFillColor(PANEL); c.roundRect(x, y, width, height, 8, fill=1, stroke=0)
    c.drawImage(image, x+(width-draw_w)/2, y+(height-draw_h)/2, draw_w, draw_h, preserveAspectRatio=True, mask='auto')


def _shot_page(c, page, shot):
    title = f"故事段落 {shot['number']:02d}  ·  {shot['timestamp']:.2f}秒"
    _base(c, page, title)
    _draw_frame(c, shot['image'], 0.68*inch, 2.05*inch, 5.55*inch, 3.85*inch)
    x = 6.55*inch; y = PAGE_SIZE[1]-1.62*inch; width = PAGE_SIZE[0]-x-0.68*inch
    sections = (
        ('故事内容', shot['story']), ('叙事作用', shot['narrativeRole']),
        ('人物/主体动作', shot['action']), ('情绪变化', shot['emotion']),
    )
    for label, body in sections:
        c.setFillColor(ACCENT); c.setFont(FONT, 10); c.drawString(x, y, label); y -= 0.22*inch
        c.setFillColor(INK); c.setFont(FONT, 10)
        for line in _wrap(body, 10, width)[:4]:
            c.drawString(x, y, line); y -= 0.19*inch
        y -= 0.12*inch
    c.setFillColor(MUTED); c.setFont(FONT, 9)
    c.drawString(0.68*inch, 1.66*inch, '画面事实 / 镜头 / 声音 / 衔接 / 证据边界的完整文字见紧随其后的“逐段详细脚本”。')
    c.showPage(); return page + 1


def reverse_story_pdf(payload, frame_loader):
    data = validate_reverse_story(payload, frame_loader); _register_font()
    output = BytesIO(); c = canvas.Canvas(output, pagesize=PAGE_SIZE)
    c._lance_report_header = '视频反推故事脚本 · 可直接汇报'
    c.setTitle(data['title'] + ' · 视频反推故事脚本'); c.setAuthor('Lance')
    w, h = PAGE_SIZE; page = 1; fields = data['fields']
    _base(c, page, data['title'])
    c.setFillColor(ACCENT); c.setFont(FONT, 15); c.drawString(0.68*inch, h-2.02*inch, '视频反推 · 详细故事脚本')
    c.setFillColor(INK); c.setFont(FONT, 22); y = h-2.62*inch
    for line in _wrap(fields.get('concept') or fields.get('intent'), 22, w-1.5*inch)[:6]:
        c.drawString(0.68*inch, y, line); y -= 0.4*inch
    c.setFillColor(MUTED); c.setFont(FONT, 10)
    c.drawString(0.68*inch, 0.78*inch, f"{data['purpose']} · {data['type']} · {len(data['shots'])}个故事段落证据 · 不含新生成图片、视频或封面")
    c.showPage(); page += 1
    _section_page(c, page, '3分钟汇报摘要', [
        ('创意从哪来', fields.get('origin')), ('为什么贴合', fields.get('fit')),
        ('要讲什么故事', '\n'.join(filter(None, [fields.get('concept'), fields.get('outline')]))),
        ('怎样落地', fields.get('landing')),
    ]); page += 1
    _section_page(c, page, '结论先行', [
        ('创作意图', fields.get('intent')), ('核心概念', fields.get('concept')),
        ('观众与情绪钩子', fields.get('audience')), ('创意寓意', fields.get('meaning')),
    ]); page += 1
    _section_page(c, page, '叙事架构', [('创意大纲', fields.get('outline')), ('起承转合', fields.get('description'))]); page += 1
    page = _text_pages(c, page, '完整故事脚本', fields.get('script'), data['title'])
    for shot in data['shots']:
        page = _shot_page(c, page, shot)
    details = []
    for shot in data['shots']:
        details.append(
            f"故事段落 {shot['number']:02d} · {shot['timestamp']:.2f}秒\n"
            f"故事内容：{shot['story']}\n叙事作用：{shot['narrativeRole']}\n"
            f"动作：{shot['action']}\n情绪：{shot['emotion']}\n可见画面：{shot['visual']}\n"
            f"构图、景别与机位：{shot['camera']}\n运镜思考：{shot['cameraMovement']}\n"
            f"剪辑思考：{shot['editThinking']}\n台词/声音：{shot['dialogue']}\n"
            f"衔接逻辑：{shot['transition']}\n证据边界：{shot['evidence']}\n备注：{shot['note']}"
        )
    page = _text_pages(c, page, '逐段详细脚本', '\n\n'.join(details), '文字全量版')
    _section_page(c, page, '视听与执行', [
        ('场景与空间', fields.get('scene')), ('美术、道具与色彩', fields.get('art')),
        ('影像与摄影', '\n'.join(filter(None, [fields.get('atmosphere'), fields.get('camera')]))),
        ('剪辑与声音', '\n'.join(filter(None, [fields.get('editing'), fields.get('music')]))),
    ]); page += 1
    _section_page(c, page, '汇报收口', [
        ('从故事到落地', fields.get('landing')), ('执行要点与边界', fields.get('production')),
        ('可复用创意机制', fields.get('reuse')),
        ('可沉淀资料', fields.get('archive')), ('依据与未确认事项', data['basis'] + '\n' + fields.get('uncertainties', '')),
    ])
    c.save(); return output.getvalue()


def write_reverse_story_pdf(payload, frame_loader, path):
    path.write_bytes(reverse_story_pdf(payload, frame_loader)); return path
