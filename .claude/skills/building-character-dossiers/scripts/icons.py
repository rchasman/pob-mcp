import re, json, base64, io
from PIL import Image
TD="/Applications/Path of Building.app/Contents/Resources/src/TreeData/3_29/"

# sprites.lua -> python dict for the sheets we need
src=open(TD+"sprites.lua").read()
def sheet(name):
    i=src.find('"%s"]'%name)
    if i<0: return {}
    j=src.find('["coords"]', i)
    # take until the closing of this sheet block: next `"]= {` at same nesting is hard; slice generously
    chunk=src[j:j+900000]
    out={}
    for m in re.finditer(r'\["(Art/2DArt/SkillIcons/[^"]+)"\]=\s*\{\s*\["x"\]=\s*(\d+),\s*\["y"\]=\s*(\d+),\s*\["w"\]=\s*(\d+),\s*\["h"\]=\s*(\d+)', chunk):
        out[m.group(1)]=tuple(int(m.group(k)) for k in (2,3,4,5))
        if len(out)>4000: break
    return out

coords={}
for s in ("notableActive","keystoneActive","normalActive","masteryActiveSelected"):
    c=sheet(s)
    print(f"{s}: {len(c)} coords")
    for k,v in c.items(): coords.setdefault(k,v)

img=Image.open(TD+"skills-3.jpg").convert("RGB")
json.dump({"count":len(coords)}, open("icons_meta.json","w"))

def crop_datauri(icon, size=64):
    c=coords.get(icon)
    if not c: return None
    x,y,w,h=c
    im=img.crop((x,y,x+w,y+h)).resize((size,size), Image.LANCZOS)
    b=io.BytesIO(); im.save(b,format="PNG",optimize=True)
    return "data:image/png;base64,"+base64.b64encode(b.getvalue()).decode()

if __name__=="__main__":
    import sys
    want=json.load(open("want_icons.json"))
    out={}
    for icon in want:
        u=crop_datauri(icon)
        if u: out[icon]=u
    json.dump(out, open("icon_data.json","w"))
    print(f"cropped {len(out)}/{len(want)} icons")
