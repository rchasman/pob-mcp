local f=assert(io.open("/Applications/Path of Building.app/Contents/Resources/src/TreeData/3_29/tree.lua"))
local tree=load(f:read("*a"))(); f:close()
local function calcOrbitAngles(n)
  local a={}
  if n==16 then a={0,30,45,60,90,120,135,150,180,210,225,240,270,300,315,330}
  elseif n==40 then a={0,10,20,30,40,45,50,60,70,80,90,100,110,120,130,135,140,150,160,170,180,190,200,210,220,225,230,240,250,260,270,280,290,300,310,315,320,330,340,350}
  else for i=0,n do a[i+1]=360*i/n end end
  for i,d in ipairs(a) do a[i]=math.rad(d) end
  return a
end
local radii=tree.constants.orbitRadii
local angles={}
for o,n in ipairs(tree.constants.skillsPerOrbit) do angles[o]=calcOrbitAngles(n) end

local N={}
for id,n in pairs(tree.nodes) do
  local g = n.group and (tree.groups[tostring(n.group)] or tree.groups[n.group])
  if g and n.orbit and n.orbitIndex and angles[n.orbit+1] then
    local ang=angles[n.orbit+1][n.orbitIndex+1]; local r=radii[n.orbit+1]
    if ang and r then n._x=g.x+math.sin(ang)*r; n._y=g.y-math.cos(ang)*r end
  end
  N[tostring(id)]=n
end

local ALLOC={}
for id in ("2151,3452,4036,4367,4432,5296,5875,6204,7503,7641,8948,9567,9788,10490,12032,12189,13232,13961,15228,15726,17236,18240,19501,22473,23659,26557,27659,27929,33310,33479,33864,35877,37671,37690,38176,40351,41635,42795,44184,45317,46092,46479,47306,47312,47504,48423,48778,49605,49651,50029,51219,51923,52407,54645,55230,55866,58168,58210,58833,60085,60090,60512,62577,62697,63447,63976"):gmatch("%d+") do ALLOC[id]=true end

-- bbox from allocated NON-ascendancy nodes
local minx,miny,maxx,maxy=1e9,1e9,-1e9,-1e9
for id in pairs(ALLOC) do
  local n=N[id]
  if n and n._x and not n.ascendancyName then
    minx=math.min(minx,n._x); maxx=math.max(maxx,n._x); miny=math.min(miny,n._y); maxy=math.max(maxy,n._y)
  end
end
local pad=700
minx,miny,maxx,maxy=minx-pad,miny-pad,maxx+pad,maxy+pad
local W,H=maxx-minx,maxy-miny

local function inbox(n) return n._x and n._x>=minx and n._x<=maxx and n._y>=miny and n._y<=maxy end
local out={}
local function w(s) out[#out+1]=s end
w(string.format('<svg viewBox="%.0f %.0f %.0f %.0f" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Allocated passive tree">',minx,miny,W,H))
w('<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')

-- unallocated context edges + nodes (faint)
w('<g stroke="currentColor" stroke-opacity=".10" stroke-width="8" fill="none">')
local seen={}
for id,n in pairs(N) do
  if inbox(n) and not n.ascendancyName then
    for _,o in ipairs(n.out or {}) do
      local m=N[tostring(o)]
      if m and inbox(m) and not m.ascendancyName then
        local k=id<tostring(o) and (id..">"..o) or (o..">"..id)
        if not seen[k] then seen[k]=true
          w(string.format('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f"/>',n._x,n._y,m._x,m._y)) end
      end
    end
  end
end
w('</g>')
w('<g fill="currentColor" fill-opacity=".16">')
for id,n in pairs(N) do
  if inbox(n) and not n.ascendancyName and not ALLOC[id] then
    local r = n.isKeystone and 34 or n.isNotable and 26 or n.isJewelSocket and 22 or 13
    w(string.format('<circle cx="%.0f" cy="%.0f" r="%d"/>',n._x,n._y,r))
  end
end
w('</g>')

-- allocated edges
w('<g stroke="var(--accent)" stroke-width="13" stroke-linecap="round" fill="none" filter="url(#glow)" stroke-opacity=".85">')
seen={}
for id in pairs(ALLOC) do
  local n=N[id]
  if n and n._x and not n.ascendancyName then
    for _,o in ipairs(n.out or {}) do
      local k=tostring(o)
      if ALLOC[k] then local m=N[k]
        if m and m._x and not m.ascendancyName then
          local kk=id<k and (id..">"..k) or (k..">"..id)
          if not seen[kk] then seen[kk]=true
            w(string.format('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f"/>',n._x,n._y,m._x,m._y)) end
        end
      end
    end
  end
end
w('</g>')

-- allocated nodes
local counts={keystone=0,notable=0,small=0,jewel=0,mastery=0}
w('<g>')
for id in pairs(ALLOC) do
  local n=N[id]
  if n and n._x and not n.ascendancyName then
    local cls
    if n.isKeystone then cls="keystone"
    elseif n.isMastery then cls="mastery"
    elseif n.isNotable then cls="notable"
    elseif n.isJewelSocket then cls="jewel"
    else cls="small" end
    counts[cls]=counts[cls]+1
    if cls=="small" then
      w(string.format('<circle cx="%.0f" cy="%.0f" r="22" fill="var(--accent)"/>',n._x,n._y))
    else
      local R = (cls=="keystone") and 132 or (cls=="mastery") and 104 or 112
      w(string.format('<circle cx="%.0f" cy="%.0f" r="%d" fill="var(--ground)"/>',n._x,n._y,R+7))
      if n.icon then
        w(string.format('<image x="%.0f" y="%.0f" width="%d" height="%d" href="ICON:%s" clip-path="circle(%d%%)"/>',
          n._x-R, n._y-R, R*2, R*2, n.icon, 50))
      end
      w(string.format('<circle cx="%.0f" cy="%.0f" r="%d" fill="none" stroke="var(--accent)" stroke-width="%d"/>',
        n._x,n._y,R, (cls=="keystone") and 16 or 11))
    end
  end
end
w('</g>')

w('<g font-family="Avenir Next Condensed, Avenir Next, Futura, sans-serif" font-size="118" font-weight="600" fill="currentColor" fill-opacity=".95" text-anchor="middle" paint-order="stroke" stroke="var(--ground)" stroke-width="16" stroke-linejoin="round">')
for id in pairs(ALLOC) do
  local n=N[id]
  if n and n._x and not n.ascendancyName and (n.isNotable or n.isKeystone) and n.name then
    w(string.format('<text x="%.0f" y="%.0f">%s</text>', n._x, n._y-152, (n.name:gsub("&","&amp;"))))
  end
end
w('</g>')
w('</svg>')

local fh=assert(io.open("tree.svg","w")); fh:write(table.concat(out,"\n")); fh:close()
print(string.format("wrote tree.svg  viewBox %.0f %.0f %.0f %.0f", minx,miny,W,H))
print(string.format("allocated drawn: %d small, %d notable, %d keystone, %d mastery, %d jewel",
  counts.small,counts.notable,counts.keystone,counts.mastery,counts.jewel))
