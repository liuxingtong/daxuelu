from pathlib import Path

p = Path(__file__).parent
src = (p / 'index.html').read_text()

src = src.replace(
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="html-box-height-mode" content="auto">'
)

css = '''<style id="embed-style">
html,body{overflow-x:hidden}header{height:42px;padding:0 10px}
.header-right{display:none}
.brand .mark{width:24px;height:24px}
.brand .mark:after{width:9px;height:9px;right:-5px;bottom:-2px}
.eyebrow{display:none}
h1{font-size:14px}
.workspace{grid-template-columns:minmax(0,1fr) 250px;gap:8px;padding:8px;max-width:none}
.toolbar{padding:6px 8px;gap:4px}
.toolbar button,.toolbar select{font-size:10px;padding:5px 7px}
.separator{height:16px;margin:0 2px}
.metrics{padding:6px 4px}
.metric{padding:0 7px}
.metric .value{font-size:16px}
.metric span{font-size:9px}
canvas{height:320px}
.side{display:flex;max-height:500px;overflow:auto;gap:8px;padding-right:2px}
.card{padding:8px}
.card h2{font-size:10px;margin-bottom:6px}
.range{margin:5px 0}
.range .row{font-size:10px}
input[type=range]{margin-top:5px}
.checks{gap:4px;font-size:10px}
.fleet{max-height:80px}
.eventlog{max-height:80px}
.board-note{display:none}
.legend{bottom:6px;left:6px;gap:7px;font-size:8.5px;padding:3px 5px}
.mapbuttons{bottom:6px;right:6px}
.statusbar{min-height:26px;padding:4px 8px;font-size:9.5px}
.tabs,.panel,footer{display:none!important}
.person-popup{width:238px}
body.embed-logic-open{overflow:hidden}
body.embed-logic-open #panel-logic{display:block!important;position:fixed;inset:12px;z-index:50;overflow:auto;background:var(--paper);border:1px solid var(--line);box-shadow:0 20px 60px rgba(0,0,0,.25);padding:16px;border-radius:8px}
.embed-close{display:none;position:fixed;right:20px;top:20px;z-index:51;background:var(--green);color:#fff;border-color:var(--green);font-size:11px;padding:5px 9px}
body.embed-logic-open .embed-close{display:block}
@media(max-width:1050px){.workspace{grid-template-columns:minmax(0,1fr) 248px}.side{display:flex;grid-template-columns:none;max-height:500px}canvas{height:320px}}
@media(max-width:720px){.workspace{grid-template-columns:1fr}.side{max-height:220px;display:grid;grid-template-columns:1fr 1fr;overflow:auto}canvas{height:320px}.metrics{grid-template-columns:repeat(3,1fr);gap:4px}}
</style>'''
src = src.replace('</head>', css + '</head>')

js = '''<script id="embed-boot">
(function(){
 const fit=function(){var m=window.magic;if(m&&m.updateHeight){try{m.updateHeight()}catch(e){}}};
 function addLogic(){var tb=document.querySelector('.toolbar');if(!tb||document.getElementById('embedLogicBtn'))return;var b=document.createElement('button');b.id='embedLogicBtn';b.textContent='计算逻辑';b.title='查看完整计算逻辑';b.onclick=function(){var p=document.getElementById('panel-logic');if(!p)return;p.hidden=false;document.body.classList.add('embed-logic-open');setTimeout(fit,80);};tb.appendChild(b);var c=document.createElement('button');c.className='embed-close';c.textContent='关闭公式 ×';c.onclick=function(){document.body.classList.remove('embed-logic-open');var p=document.getElementById('panel-logic');if(p)p.hidden=true;setTimeout(fit,80);};document.body.appendChild(c);}
 addEventListener('load',function(){setTimeout(function(){addLogic();fit();},150);setTimeout(fit,700);setTimeout(fit,1800);});
 addEventListener('resize',function(){setTimeout(fit,180)});
 setTimeout(function(){addLogic();fit();},900);
})();
</script>'''
src = src.replace('</body>', js + '</body>')
(p / 'index-embed.html').write_text(src)
print('Built index-embed.html', len(src), 'characters')
