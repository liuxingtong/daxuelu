"""Extract a bounded plan from the supplied Rhino file without modifying it."""
import json, math, collections, sys
from pathlib import Path
import rhino3dm as rh
sys.path.insert(0,'/tmp/daxue-geometry-deps')
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'2601008_大学路_图层整理版.3dm'
OUT=Path(__file__).parent
ORIGIN=(2000000,310000)  # original mm; common model XY, not a georeference
BOUNDS=[0,0,160,60]
def pt(p): return [round((p.X-ORIGIN[0])/1000,3),round((p.Y-ORIGIN[1])/1000,3)]
def area(p): return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(p,p[1:]+p[:1])))/2
def hull(points):
    ps=sorted(set(tuple(p) for p in points))
    if len(ps)<3:return []
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lo=[];hi=[]
    for p in ps:
        while len(lo)>1 and cross(lo[-2],lo[-1],p)<=0:lo.pop()
        lo.append(p)
    for p in reversed(ps):
        while len(hi)>1 and cross(hi[-2],hi[-1],p)<=0:hi.pop()
        hi.append(p)
    return [list(p) for p in lo[:-1]+hi[:-1]]
def curve(c):
    p=c.TryGetPolyline()
    if p:return [pt(v) for v in p]
    d=c.Domain
    return [pt(c.PointAt(d.T0+(d.T1-d.T0)*i/48)) for i in range(49)]
def mesh_loops(g):
    vs=list(g.Vertices);z=max(p.Z for p in vs);edges=collections.Counter()
    for f in g.Faces:
        ids=list(f);ids=ids[:3] if ids[2]==ids[3] else ids
        vv=[vs[i] for i in ids]
        if any(p.Z<z-20 for p in vv):continue
        poly=[tuple(pt(p)) for p in vv]
        if area(poly)<.00001:continue
        for a,b in zip(poly,poly[1:]+poly[:1]):
            if a!=b:edges[tuple(sorted([a,b]))]+=1
    remaining={e for e,n in edges.items() if n==1};adj=collections.defaultdict(set)
    for a,b in remaining:adj[a].add(b);adj[b].add(a)
    loops=[]
    while remaining:
        a,b=remaining.pop();p=[a,b];prev=a;cur=b
        for _ in range(10000):
            candidates=[q for q in adj[cur] if tuple(sorted([cur,q])) in remaining]
            if not candidates:break
            nxt=candidates[0];remaining.remove(tuple(sorted([cur,nxt])));p.append(nxt);prev,cur=cur,nxt
            if cur==p[0]:break
        if len(p)>3 and p[0]==p[-1] and area(p)>.002:loops.append([list(q) for q in p[:-1]])
    return loops
def rect(b):
    a=pt(b.Min);c=pt(b.Max)
    return [a,[c[0],a[1]],c,[a[0],c[1]]]
def intersects(b):
    a=pt(b.Min);c=pt(b.Max)
    return c[0]>=0 and a[0]<=160 and c[1]>=0 and a[1]<=60

m=rh.File3dm.Read(str(SOURCE));data={k:[] for k in ['road','walk','buildings','canopies','furniture','facilities','spillout','pits','trees','obstacles']}
counts=collections.Counter();fallback=collections.Counter();seen=set()
for o in m.Objects:
    li=o.Attributes.LayerIndex;g=o.Geometry
    if li not in [2,3,8,14,17,18,19,24,25] or o.Attributes.IsInstanceDefinitionObject:continue
    try:b=g.GetBoundingBox()
    except TypeError:continue
    if not intersects(b):continue
    # Keep primary street, exclude surrounding-context road and minor detailing.
    if li==2 and not (isinstance(g,rh.Mesh) and len(g.Vertices)<1000):continue
    a=pt(b.Min);c=pt(b.Max);sx=c[0]-a[0];sy=c[1]-a[1]
    if li==17:
        x=(a[0]+c[0])/2;y=(a[1]+c[1])/2
        if 0<=x<=160 and 0<=y<=60:
            data['trees'].append({'pos':[round(x,3),round(y,3)],'r':round(max(sx,sy)/2,2),'trunkRadius':.35,'source':str(o.Attributes.Id)})
        continue
    key={2:'road',3:'walk',8:'buildings',14:'canopies',18:'pits',19:'furniture',24:'facilities',25:'spillout'}[li]
    polygons=[];method=''
    if isinstance(g,rh.Extrusion):
        polygons=[curve(g.Profile3d(0,0))];method='extrusion-profile'
    elif isinstance(g,rh.Mesh) and key in ['road','walk']:
        polygons=mesh_loops(g);method='mesh-top-boundary'
    elif isinstance(g,rh.Brep) and key=='buildings':
        polygons=[hull([pt(v.Location) for v in g.Vertices])];method='brep-vertex-hull'
    else:polygons=[rect(b)];method='bbox-proxy';fallback[key]+=1
    for poly in polygons:
        if len(poly)<3 or area(poly)<.015:continue
        if max(p[0] for p in poly)<0 or min(p[0] for p in poly)>160 or max(p[1] for p in poly)<0 or min(p[1] for p in poly)>60:continue
        if key=='buildings' and b.Min.Z>2000:continue  # upper-only decorative masses
        sig=(key,tuple(tuple(p) for p in poly))
        if sig in seen:continue
        seen.add(sig);data[key].append(poly);counts[key]+=1
    if key in ['pits','facilities','spillout','furniture'] and b.Min.Z<1200 and .12<sx<7 and .12<sy<7:
        data['obstacles'].append(rect(b))

# Dissolve tile seams; clip before browser work. Do not infer parcel boundaries from paver joints.
clip=box(*BOUNDS)
for key in ['walk','road','obstacles']:
    gs=[]
    for p in data[key]:
        g=Polygon(p).buffer(0).intersection(clip)
        if not g.is_empty:gs.append(g)
    g=unary_union(gs)
    if key=='walk':g=g.buffer(.08).buffer(-.08)
    geoms=list(g.geoms) if hasattr(g,'geoms') else [g]
    data[key]=[[[round(x,3),round(y,3)] for x,y in q.simplify(.025,preserve_topology=True).exterior.coords[:-1]] for q in geoms if q.geom_type=='Polygon' and q.area>.02]
    # Interior holes are exported separately as exclusions, preserving actual walking barriers.
    if key=='walk':
        data['walkHoles']=[[[round(x,3),round(y,3)] for x,y in ring.coords[:-1]] for q in geoms if q.geom_type=='Polygon' for ring in q.interiors if Polygon(ring).area>.1]

# Actual straight carriageway limits verified by intersections of primary mesh at x=2000,2080,2140m.
data.update(bounds=BOUNDS,originMM=list(ORIGIN),corridor=[0,8,160,44],roadY=[20.877,33.290],railY=[17.0,37.0],
    metadata={'source':SOURCE.name,'units':'m','sourceUnits':'mm','extractDate':'2026-11-15','axis':'原模型 +X / +Y；未确认地理北向',
    'length':160,'carriagewayWidth':12.413,'counts':dict(counts),'proxies':dict(fallback),
    'notes':['道路和人行道来自顶面网格边界；建筑优先使用拉伸轮廓，Brep 使用平面凸包。','连续铺装合并，闭合小于0.16m的铺装接缝；保留大于0.1平方米的内部孔洞。','树冠为实例包围盒投影近似，树干位置取包围盒中心，非实测树干。','外摆、家具、市政、树池多采用包围盒占地代理；结构、净高、微气候未求解。','截取原模型 X=2000–2160m、Y=310–370m；所有后续标注使用同一米制坐标。']})
OUT.joinpath('model.js').write_text('window.SITE = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
OUT.joinpath('model.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(json.dumps({'counts':counts,'proxies':fallback,'trees':len(data['trees']),'obstacles':len(data['obstacles']),'width':12.413},ensure_ascii=False))
