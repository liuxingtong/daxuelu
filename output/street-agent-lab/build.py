from pathlib import Path
p=Path(__file__).parent
html=p.joinpath('template.html').read_text()
engine=p.joinpath('engine.mjs').read_text().replace('export ','')
sim='\n'.join(l for l in p.joinpath('simulation.mjs').read_text().splitlines() if not l.startswith('import ')).replace('export ','')
env=p.joinpath('environment.mjs').read_text().replace('export ','')
html=html.replace('<!-- MODEL_SCRIPT -->','<script>'+p.joinpath('model.js').read_text()+'</script>')
html=html.replace('// ENGINE_SCRIPT',engine+'\n'+env).replace('// SIM_SCRIPT',sim).replace('// APP_SCRIPT',p.joinpath('app.js').read_text())
p.joinpath('index.html').write_text(html)
print('Built self-contained index.html',len(html),'characters')
