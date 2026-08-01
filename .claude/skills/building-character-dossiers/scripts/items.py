import re, html
B="/Users/roeychasman/Library/Application Support/Path of Building/Builds/rchasman - idk_lum_maybe.xml"
s=open(B).read()
items={m.group(1): m.group(2) for m in re.finditer(r'<Item id="(\d+)">(.*?)</Item>', s, re.S)}
slots={m.group(1): m.group(2) for m in re.finditer(r'<Slot name="([^"]+)"[^>]*itemId="(\d+)"', s)}

WANT=["Weapon 1","Weapon 2","Helmet","Body Armour","Gloves","Boots","Amulet","Ring 1","Ring 2","Belt"]
SKIP=("Unique ID:","Sockets:","Quality:","LevelReq:","Energy Shield:","Armour:","Evasion:",
      "EnergyShieldBasePercentile","ArmourBasePercentile","EvasionBasePercentile","Selected","Radius:","Limited to:")

def parse(block):
    lines=[l.strip() for l in html.unescape(block).strip().splitlines()
           if l.strip() and not l.strip().startswith('<')]
    d={"rarity":"RARE","ilvl":None,"implicits":0}
    body=[]
    for l in lines:
        if l.startswith("Rarity:"): d["rarity"]=l.split(":",1)[1].strip()
        elif l.startswith("Item Level:"): d["ilvl"]=l.split(":",1)[1].strip()
        elif l.startswith("Implicits:"): d["implicits"]=int(l.split(":",1)[1])
        elif l.startswith(SKIP): pass
        else: body.append(l)
    d["name"]=body[0] if body else "?"
    d["base"]=body[1] if len(body)>1 else ""
    d["mods"]=body[2:]
    return d

def render(d):
    r=d["rarity"].lower()
    imp=d["mods"][:d["implicits"]]
    exp=d["mods"][d["implicits"]:]
    def mod(m):
        c = m.startswith("{crafted}")
        m = re.sub(r'^\{[a-z]+\}','',m)
        return f'<div class="poe-mod{" crafted" if c else ""}">{html.escape(m)}</div>'
    meta = f'{html.escape(d["slot"])}' + (f' &middot; ilvl {d["ilvl"]}' if d["ilvl"] else '')
    h=[f'<div class="poe-item {r}">',
       f'<div class="poe-slot">{meta}</div>',
       '<div class="poe-head">',
       f'<div class="poe-name">{html.escape(d["name"])}</div>']
    if d["base"] and d["base"]!=d["name"]:
        h.append(f'<div class="poe-base">{html.escape(d["base"])}</div>')
    h.append('</div>')
    if imp:
        h.append('<div class="poe-sep"></div>')
        h += [mod(m) for m in imp]
    if exp:
        h.append('<div class="poe-sep"></div>')
        h += [mod(m) for m in exp]
    h.append('</div>')
    return "".join(h)

out=[]
for name in WANT:
    iid=slots.get(name)
    if not iid or iid not in items: continue
    d=parse(items[iid]); d["slot"]=name
    out.append(d)
open("items.html","w").write("\n".join(render(d) for d in out))
print(f"rendered {len(out)}:", ", ".join(f'{d["slot"]}={d["name"]}' for d in out))
