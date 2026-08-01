import re, html, json
B="/Users/roeychasman/Library/Application Support/Path of Building/Builds/rchasman - idk_lum_maybe.xml"
s=open(B).read()
groups=[]
for m in re.finditer(r'<Skill\b([^>]*)>(.*?)</Skill>', s, re.S):
    attrs=dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    gems=[]
    for g in re.finditer(r'<Gem\b([^>]*)/>', m.group(2)):
        a=dict(re.findall(r'(\w+)="([^"]*)"', g.group(1)))
        if a.get('nameSpec'):
            gems.append({"name":a['nameSpec'],"level":a.get('level','?'),"quality":a.get('quality','0'),
                         "enabled":a.get('enabled','true')=='true'})
    if gems: groups.append({"slot":attrs.get('slot','(unassigned)'),"enabled":attrs.get('enabled','true')=='true',"gems":gems})

main_idx=int(re.search(r'mainSocketGroup="(\d+)"', s).group(1))
SUPPORTS={"Faster Casting","Innervate","Infused Channelling","Added Lightning Damage","Arcane Surge","Spell Echo",
          "Impending Doom","Efficacy","Elemental Army","Minion Speed","Focused Channelling","Energy Leech","Living Lightning"}
out=[]
for i,g in enumerate(groups, start=1):
    is_main = (i==main_idx)
    cls="gemgroup"+(" main" if is_main else "")+("" if g["enabled"] else " off")
    h=[f'<div class="{cls}">']
    h.append(f'<div class="gemslot">{html.escape(g["slot"])}{" &middot; main" if is_main else ""}</div>')
    for gem in g["gems"]:
        kind = "support" if gem["name"] in SUPPORTS else "active"
        q = f'<span class="gq">/{gem["quality"]}</span>' if gem["quality"] not in ("0","") else ""
        h.append(f'<div class="gem {kind}"><span class="gname">{html.escape(gem["name"])}</span>'
                 f'<span class="glvl">{gem["level"]}{q}</span></div>')
    h.append('</div>')
    out.append("".join(h))
open("gems.html","w").write("\n".join(out))
print(f"{len(groups)} socket groups, main = #{main_idx}")
for i,g in enumerate(groups,1):
    print(f'  {"*" if i==main_idx else " "} {g["slot"]:<16} ' + ", ".join(f'{x["name"]} {x["level"]}' for x in g["gems"]))
