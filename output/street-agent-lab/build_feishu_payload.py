from pathlib import Path
import json

p = Path(__file__).parent
html = (p / 'index-embed.html').read_text()

heading = {
    'block_type': 4,
    'heading2': {'elements': [{'text_run': {'content': '可交互推演'}}]},
}
note = {
    'block_type': 2,
    'text': {'elements': [{'text_run': {'content': '在文档内可直接运行：拖动行人、点击行人打开卡片编辑体表温度/精神状态/步速/社交意愿；右上角“计算逻辑”查看公式。若块内空白，请刷新或重新打开文档。'}}]},
}
record = json.dumps({'html': html}, ensure_ascii=False)
addon = {
    'block_type': 40,
    'add_ons': {
        'component_type_id': 'blk_6900429af84180025ce76527',
        'record': record,
    },
}
body = {'children': [heading, note, addon]}
out = Path('/tmp/feishu_embed_payload.json')
out.write_text(json.dumps(body, ensure_ascii=False))
print(f'Wrote {out} ({out.stat().st_size} bytes); html={len(html)} chars')
