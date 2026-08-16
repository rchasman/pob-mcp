"""Downscale the inlined PNGs in a poe-item-render theme stylesheet.

The library stays dependency-free and emits the assets at source resolution.
Pages that know their display size can shrink them here; headers drawn at 44px
do not need 88px source art.
"""
import re, io, base64, sys
from PIL import Image

def shrink(css, max_h=88):
    def repl(m):
        raw = base64.b64decode(m.group(1))
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        if im.height > max_h:
            w = max(1, round(im.width * max_h / im.height))
            im = im.resize((w, max_h), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, format="PNG", optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
    return re.sub(r'data:image/png;base64,([A-Za-z0-9+/=]+)', repl, css)

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 88
    css = open(src).read()
    out = shrink(css, h)
    open(dst, "w").write(out)
    print(f"{len(css)//1024} KB -> {len(out)//1024} KB at max height {h}px")
