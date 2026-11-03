#!/usr/bin/env python3
"""Render the Little Harbor design doc and package a self-contained handoff kit.
No third-party packages. The supported Markdown subset is intentionally small.
"""
from pathlib import Path
import html, re, json, hashlib, zipfile
ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/little-harbor'
MEDIA = ROOT / 'public/direction-media'
OUT = ROOT / 'direction'
MEDIA.mkdir(parents=True, exist_ok=True)
INK='#263e39'; PAPER='#f5f1e8'; MUTE='#62736a'; LINE='#c4cec2'; RED='#a44632'; GREEN='#e0e8da'
def esc(x): return html.escape(str(x), quote=True)
def text(x,y,lines,size=16,color=INK,weight='normal',anchor='start'):
    if isinstance(lines,str): lines=[lines]
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">'+''.join(f'<tspan x="{x}" dy="{0 if i==0 else size*1.35}">{esc(line)}</tspan>' for i,line in enumerate(lines))+'</text>'
def box(x,y,w,h,title,body=None,fill=GREEN):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{LINE}"/>'
    s+=text(x+18,y+30,title,17,INK,'bold')
    if body:s+=text(x+18,y+57,body,13,MUTE)
    return s
def arrow(x1,y1,x2,y2):return f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#arrow)"/>'
def svg(name,title,desc,w,h,body):
    s=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{esc(title)}</title><desc id="desc">{esc(desc)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" fill="{INK}"/></marker></defs><rect width="100%" height="100%" fill="{PAPER}"/><g font-family="Arial,Helvetica,sans-serif">{text(28,35,title,21,INK,'bold')}{body}</g></svg>'''
    (MEDIA/name).write_text(s)
# Diagrams are design specifications, not generated art.
b=box(30,70,240,105,'Entry / BootstrapContext',['content + map + namespace','selected before importing Game'])
b+=arrow(270,120,315,120)+box(320,70,250,105,'Game / composition root',['construct selected systems','retain controller boundaries'])
b+=arrow(570,120,615,120)+box(620,70,300,105,'World + content adapters',['mapConstants / activePack','consume the frozen context'])
b+=arrow(445,175,445,220)+box(320,225,250,105,'Controllers / commands',['input → validate → apply','no UI-owned progression'])
b+=arrow(320,275,275,275)+box(30,225,240,105,'Systems own state',['clock · jobs · residents','housing · social events'])
b+=arrow(570,275,615,275)+box(620,225,300,105,'Snapshot / persistence',['one revision with effects + receipt','save success is explicit'])
b+=arrow(445,330,445,375)+box(320,380,600,90,'Committed events → presentation',['HUD · dialogue · audio · animations; notifications never pay wages'])
b+=text(30,423,['Retain rendering, asset loading,','island and scene authoring.','Do not create a second engine.'],14,MUTE)
svg('architecture.svg','Boot and ownership boundaries','Configure content before import-time world construction. Controllers call state-owning systems; saves and presentation follow committed commands.',950,500,b)
b=''
for a in [(180,165,430,165),(560,165,780,165),(430,165,430,340),(180,165,180,340),(780,165,780,340),(430,340,780,340),(560,165,560,65)]:
 b+=f'<path d="M{a[0]} {a[1]}L{a[2]} {a[3]}" stroke="{MUTE}" stroke-width="4" fill="none"/>'
b+=box(45,115,230,95,'Dock / repair yard',['arrival · Ada · delivery depot'])
b+=box(320,115,250,95,'Bakery + upstairs room',['Basil · home · Pip next door'])
b+=box(655,115,230,95,'Café + secondhand shop',['June · work · daily purchases'])
b+=box(45,300,230,90,'Beach loop',['quiet spot · leisure'])+box(320,300,250,90,'Bathhouse + allotment',['cards · Nell · shared project'])+box(655,300,230,90,'Hill / observatory',['Omar · club · evening view'])
b+=text(30,445,['Topology only. Author actual paths and entrance anchors in little-harbor-v1.island.','Slice: dock → bakery → café loop. Target 20–35 seconds walking; measure with current player speed.'],14,MUTE)
svg('neighborhood.svg','One compact daily loop, with places beyond it','The harbor loop joins dock, home and café; beach, bathhouse and observatory branch from and return to the town.',930,490,b)
b=box(35,85,245,100,'FREE PLAY',['advance 0.5 game min / real sec','07:00–23:00 ≈ 32 real minutes'])
b+=arrow(280,135,340,135)+box(350,85,245,100,'PAUSED',['dialogue · menus · placement','scene · transition · hidden tab'])
b+=text(300,120,'open',12,MUTE)+arrow(350,165,285,165)+text(300,187,'close',12,MUTE)
b+=arrow(160,185,160,255)+box(35,265,245,100,'EVENING HOLD / SLEEP',['at 23:00: stay in control','sleep: explicit confirmation'])
b+=arrow(280,315,340,315)+box(350,265,245,100,'DAY ROLLOVER',['process each boundary once','stock · plants · rent · events'])
b+=arrow(595,315,650,315)+box(660,265,245,100,'SAVE NEXT MORNING',['one complete state revision','retry snapshot if write fails'])
b+=box(660,85,245,100,'MORNING 07:00',['new day; safe home position','refresh resident plans'])+arrow(780,265,780,190)
b+=text(35,420,['No wall-clock catch-up. Rendering may continue while simulation is paused.','Time waits for the player; obligations never accrue while the game is closed.'],15,MUTE)
svg('day-cycle.svg','The day belongs to the simulation clock','Free play advances time; modal states pause it; sleep performs one day rollover and durable save before morning.',940,465,b)
b=box(30,80,270,105,'1 / Validate command',['run state · capacity · balance','reject without side effects'])+arrow(300,130,340,130)
b+=box(350,80,270,105,'2 / Prepare next snapshot',['reward + completion + receipt','same revision / stable command ID'])+arrow(620,130,660,130)
b+=box(670,80,270,105,'3 / Write inactive generation',['serialize + checksum + readback','preserve previous generation'])
b+=arrow(800,185,800,245)+box(670,255,270,105,'4 / Switch head pointer',['commit this exact generation','then report save success'])
b+=arrow(670,305,625,305)+box(350,255,270,105,'5 / Notify presentation',['job:settled / purchase complete','animate result, do not pay again'])
b+=box(30,255,270,105,'If saving fails',['keep in-memory pending snapshot','retry save, never rerun reward'], '#f0ded2')
b+=text(30,420,['Duplicate settlement returns the existing receipt. Cleanup only releases camera, input, and reservations.','On load, a valid head wins over an orphan uncommitted generation; recovery is visible to the player.'],14,MUTE)
svg('transaction.svg','One-time actions and durable state','Validation precedes mutation; effects and receipt share one snapshot; A/B generations preserve a valid prior save. Retry does not reapply rewards.',970,465,b)
# 12 x 10 half-metre grid = 6 x 5 metres.
b=text(36,74,'6 m wide × 5 m deep · 0.5 m placement cells',15,MUTE)
for i in range(13):b+=f'<path d="M{60+i*40} 110V510" stroke="{LINE}"/>'
for i in range(11):b+=f'<path d="M60 {110+i*40}H540" stroke="{LINE}"/>'
b+=f'<rect x="60" y="110" width="480" height="400" fill="none" stroke="{INK}" stroke-width="3"/>'
b+=f'<path d="M440 510V410H260V270H180" stroke="#96ae88" stroke-width="34" fill="none" opacity=".65"/>'
b+=box(70,125,100,180,'BED',None)+box(340,150,150,95,'TABLE',None)+box(70,365,110,80,'STORAGE',None)
b+=text(190,266,['bed access','reserved'],12,INK)+text(380,475,'door approach',12,INK)
b+=f'<path d="M410 510H470" stroke="{PAPER}" stroke-width="8"/>'+text(440,540,'DOOR',13,INK,'bold','middle')
b+=f'<path d="M300 110H450" stroke="#6d9297" stroke-width="9"/>'+text(375,98,'WINDOW',12,INK,'normal','middle')
b+=text(600,150,['Before commit:'],18,INK,'bold')+text(600,185,['1. Check footprint bounds.','2. Check object overlap.','3. Reserve usable approach cells.','4. Flood-fill from entry.','5. Require bed + exit access.'],15,MUTE)
b+=text(600,355,['Save local coordinates + place ID.','This drawing is an example layout.','Furniture can move; access cannot','be blocked by the final placement.'],15,MUTE)
svg('room-plan.svg','Starter room / placement rules','A 6 by 5 metre room has half-metre placement cells and a connected access lane from door to bed. Furniture placement validates bounds, overlap and reachability.',960,575,b)

def slug(s):return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def inline(s):
    tokens=[]
    def stash(markup):tokens.append(markup);return f'ZZTOKEN{len(tokens)-1}ZZ'
    s=re.sub(r'`([^`]+)`',lambda m:stash('<code>'+esc(m[1])+'</code>'),s)
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:stash(f'<a href="{esc(m[2])}">{esc(m[1])}</a>'),s)
    s=esc(s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
    s=re.sub(r'\*([^*]+)\*',r'<em>\1</em>',s)
    for i,t in enumerate(tokens):s=s.replace(f'ZZTOKEN{i}ZZ',t)
    return s
md=(DOC/'design.md').read_text()
parts=re.split(r'^## (.+)$',md,flags=re.M)
intro=parts[0]
chapters=list(zip(parts[1::2],parts[2::2]))
def render(body):
    blocks=re.split(r'\n\s*\n',body.strip()); out=[]
    for block in blocks:
        if not block.strip():continue
        m=re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)',block.strip())
        if m:
            src=m[2].replace('../../public/','/')
            kind='Current build' if '/current-' in src else 'Concept art' if '-concept.' in src else 'Implementation diagram'
            out.append(f'<figure><button class="expand-image" type="button" data-image="{esc(src)}" data-caption="{esc(m[1])}" aria-label="Enlarge {esc(kind.lower())}"><img src="{esc(src)}" alt="{esc(m[1])}" loading="lazy" decoding="async"></button><figcaption><span class="media-label">{kind}</span>{esc(m[1])}</figcaption></figure>')
        elif block.startswith('```'):
            lines=block.splitlines();out.append('<pre><code>'+esc('\n'.join(lines[1:-1]))+'</code></pre>')
        elif block.startswith('### '):out.append('<h3>'+inline(block[4:])+'</h3>')
        elif block.startswith('# '):continue
        else:out.append('<p>'+inline(block.replace('\n',' '))+'</p>')
    return '\n'.join(out)
nav=''.join(f'<a href="#{slug(title)}" data-search="{esc(title.lower())}"><span>{esc(title[:2])}</span>{esc(title[4:])}</a>' for title,body in chapters)
content=''.join(f'<section id="{slug(title)}" class="chapter" data-title="{esc(title)}"><div class="chapter-number">SYSTEM {esc(title[:2])}</div><h2>{esc(title[4:])}</h2>{render(body)}</section>' for title,body in chapters)
page=f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Little Harbor implementation design: 31 focused systems, existing-code migration boundaries, typed contracts, concept art, and current-build evidence."><title>Little Harbor — Implementation design</title><link rel="stylesheet" href="/direction/gdd.css"></head><body><a class="skip" href="#document">Skip to document</a><header><a href="#" class="brand">LITTLE HARBOR <span>DESIGN & IMPLEMENTATION</span></a><a href="/">Current game ↗</a></header><div class="layout"><aside class="toc"><p class="eyebrow">IMPLEMENTATION INDEX</p><label for="section-search">Find a system</label><input id="section-search" type="search" placeholder="Try: save, clock, home…" autocomplete="off"><nav aria-label="Document sections">{nav}</nav><p id="search-status" role="status"></p><div class="downloads"><a href="/direction-media/design.md" download>Download Markdown</a><a href="/direction-media/contracts.ts" download>TypeScript contracts</a><a href="/direction-media/LittleHarbor-Design.zip" download>Complete handoff kit ↓</a><button id="print-doc" type="button">Print / save PDF</button></div></aside><main id="document"><section class="document-hero"><p class="eyebrow">GAME DESIGN DOCUMENT · VERSION 0.1</p><h1>A town to live in.<br>A plan to build it.</h1><p class="lead">Little Harbor, from the existing game to your first year living on your own.</p><div class="document-meta"><span>31 focused sections</span><span>3 concept images</span><span>3 current-build captures</span><span>5 implementation diagrams</span></div>{render(intro)}</section><div class="reading-note"><strong>Implementation, not a feature pitch.</strong> Each system names the code to retain, the boundary to replace, and the behavior to verify. New type names and content are proposed. No gameplay migration is included in this document.</div>{content}<section class="appendix" id="contracts"><p class="eyebrow">COMPANION ARTIFACT</p><h2>Shared contracts</h2><p>Checked standalone TypeScript definitions for boot, places, schedules, jobs, inventory, housing, invitations, command results, and saves. These are proposed boundaries, not current runtime exports.</p><details><summary>Read the proposed TypeScript contracts</summary><pre><code>{esc((DOC/'contracts.ts').read_text())}</code></pre></details><div class="audio-preview"><h3>Existing music reference</h3><p>Uses the game's AudioSystem. This is current audio, not a newly commissioned score.</p><label for="audio-theme">Time and season</label><select id="audio-theme"><option value="hour-7-spring">Morning / spring</option><option value="hour-15-autumn">Afternoon / autumn</option><option value="hour-22-winter">Evening / winter</option></select><div><button id="audio-play">Play</button><button id="audio-stop">Stop</button></div><label for="audio-volume">Preview volume</label><input id="audio-volume" type="range" min="0" max="1" step="0.05" value="0.25"><p id="audio-status" role="status">Silent until played.</p></div></section><footer>Little Harbor · Design v0.1 · <a href="/direction-media/source-audit.json">Source audit</a> · <a href="/direction-media/image-prompts.md">Image prompts</a></footer></main></div><dialog id="image-dialog"><button id="close-image" autofocus>Close image</button><img id="expanded-image" alt=""><p id="image-caption"></p></dialog><script type="module" src="/direction/gdd.ts"></script></body></html>'''
(OUT/'index.html').write_text(page)
# Record inspected code hashes and useful declaration anchors; no source data is sent elsewhere.
files=['src/main.ts','src/game/Game.ts','src/game/ARCHITECTURE.md','src/content/activePack.ts','src/content/types.ts','src/world/mapConstants.ts','src/world/island/TemplateLibrary.ts','src/world/island/generatedLayout.ts','src/world/Interior.ts','src/world/Weather.ts','src/world/objects/GameObjectFormat.ts','src/characters/NPC.ts','src/player/Input.ts','src/core/events.ts','src/core/AudioSystem.ts','src/core/AssetLoader.ts','src/cutscene/scene/SceneDirector.ts','src/cutscene/scene/GameSceneHost.ts','assets/CONVENTION.md','public/assets/manifest.json']
files += [f'src/game/modules/{n}.ts' for n in ['GameLoop','InteractionController','FixtureInteraction','SocialController','CommerceController','CalendarMailController','PersistenceController']]
files += [f'src/systems/{n}.ts' for n in ['TimeSystem','Calendar','Inventory','FurnitureSystem','Friendship','MailSystem','QuestSystem','SaveSystem']]
files += [f'src/content/kindly-forward/{n}.ts' for n in ['cast','runtime','residentContent','storySpine']]
files += [f'src/ui/{n}.ts' for n in ['ShopUI','LedgerUI','PauseMenu']]
audit=[]
for path in files:
    data=(ROOT/path).read_bytes(); lines=data.decode().splitlines()
    symbols=[{'line':i,'declaration':l.strip()[:180]} for i,l in enumerate(lines,1) if re.match(r'export (?:async )?(?:function|class|interface|type|const) ',l)]
    audit.append({'path':path,'sha256':hashlib.sha256(data).hexdigest(),'lines':len(lines),'symbols':symbols})
(DOC/'source-audit.json').write_text(json.dumps({'reviewDate':'2026-10-25','files':audit},indent=2)+'\n')
for name in ['contracts.ts','source-audit.json','image-prompts.md']:
    if (DOC/name).exists():(MEDIA/name).write_bytes((DOC/name).read_bytes())
(MEDIA/'design.md').write_text(md.replace('../../public/direction-media/','./'))
with zipfile.ZipFile(MEDIA/'LittleHarbor-Design.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('LittleHarbor/design.md',md.replace('../../public/direction-media/','media/'))
    for name in ['contracts.ts','source-audit.json','image-prompts.md']:
        if (DOC/name).exists():z.write(DOC/name,'LittleHarbor/'+name)
    for p in sorted(MEDIA.iterdir()):
        if p.suffix in {'.png','.svg'}:z.write(p,'LittleHarbor/media/'+p.name)
print(f'Rendered {len(chapters)} sections; {len(md.split())} words; {len(audit)} source files audited.')
