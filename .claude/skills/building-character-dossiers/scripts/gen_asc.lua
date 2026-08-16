local f=assert(io.open("/Applications/Path of Building.app/Contents/Resources/src/TreeData/3_29/tree.lua"))
local tree=load(f:read("*a"))(); f:close()
local function ang(n) local a={}
  if n==16 then a={0,30,45,60,90,120,135,150,180,210,225,240,270,300,315,330}
  elseif n==40 then a={0,10,20,30,40,45,50,60,70,80,90,100,110,120,130,135,140,150,160,170,180,190,200,210,220,225,230,240,250,260,270,280,290,300,310,315,320,330,340,350}
  else for i=0,n do a[i+1]=360*i/n end end
  for i,d in ipairs(a) do a[i]=math.rad(d) end return a end
local radii=tree.constants.orbitRadii; local A={}
for o,n in ipairs(tree.constants.skillsPerOrbit) do A[o]=ang(n) end
local L={}
for id,n in pairs(tree.nodes) do
  if n.ascendancyName=="Luminary" then
    local g=tree.groups[tostring(n.group)] or tree.groups[n.group]
    if g and A[n.orbit+1] then
      n._x=g.x+math.sin(A[n.orbit+1][n.orbitIndex+1])*radii[n.orbit+1]
      n._y=g.y-math.cos(A[n.orbit+1][n.orbitIndex+1])*radii[n.orbit+1]
      L[tostring(id)]=n
    end
  end
end
local ALLOC={["15726"]=1,["35877"]=1,["46479"]=1}
local PLAN={["27123"]=3,["1564"]=4,["61133"]=5,["56292"]=6}  -- planned route
local minx,miny,maxx,maxy=1e9,1e9,-1e9,-1e9
for _,n in pairs(L) do minx=math.min(minx,n._x);maxx=math.max(maxx,n._x);miny=math.min(miny,n._y);maxy=math.max(maxy,n._y) end
local pad=180
minx,miny,maxx,maxy=minx-pad,miny-pad,maxx+pad,maxy+pad
local o={}
local function w(s) o[#o+1]=s end
w(string.format('<svg viewBox="%.0f %.0f %.0f %.0f" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Luminary ascendancy">',minx,miny,maxx-minx,maxy-miny))
w('<g stroke="currentColor" stroke-opacity=".22" stroke-width="6" fill="none">')
local seen={}
for id,n in pairs(L) do for _,t in ipairs(n.out or {}) do local m=L[tostring(t)]
  if m then local k=id<tostring(t) and id..tostring(t) or tostring(t)..id
    if not seen[k] then seen[k]=true w(string.format('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f"/>',n._x,n._y,m._x,m._y)) end end end end
w('</g>')
-- planned route highlight
w('<g stroke="var(--accent)" stroke-opacity=".45" stroke-width="9" stroke-dasharray="18 14" fill="none">')
seen={}
for id,n in pairs(L) do
  if ALLOC[id] or PLAN[id] then
    for _,t in ipairs(n.out or {}) do local k=tostring(t); local m=L[k]
      if m and (ALLOC[k] or PLAN[k]) then local kk=id<k and id..k or k..id
        if not seen[kk] then seen[kk]=true w(string.format('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f"/>',n._x,n._y,m._x,m._y)) end end end
  end
end
w('</g>')
for id,n in pairs(L) do
  local r = n.isNotable and 30 or 20
  if ALLOC[id] then
    w(string.format('<circle cx="%.0f" cy="%.0f" r="%d" fill="var(--accent)" stroke="var(--ground)" stroke-width="5"/>',n._x,n._y,r))
  elseif PLAN[id] then
    w(string.format('<circle cx="%.0f" cy="%.0f" r="%d" fill="none" stroke="var(--accent)" stroke-width="7" stroke-opacity=".8"/>',n._x,n._y,r))
    w(string.format('<text x="%.0f" y="%.0f" font-size="30" font-weight="700" fill="var(--accent)" text-anchor="middle" dy="10" font-family="Avenir Next Condensed,sans-serif">%d</text>',n._x,n._y,PLAN[id]))
  else
    w(string.format('<circle cx="%.0f" cy="%.0f" r="%d" fill="currentColor" fill-opacity=".2"/>',n._x,n._y,r))
  end
end
w('<g font-family="Avenir Next Condensed,Avenir Next,sans-serif" font-size="34" font-weight="600" text-anchor="middle" paint-order="stroke" stroke="var(--ground)" stroke-width="7" stroke-linejoin="round">')
for id,n in pairs(L) do
  if n.isNotable and n.name then
    local fill = (ALLOC[id] or PLAN[id]) and "currentColor" or "currentColor"
    local op = (ALLOC[id] or PLAN[id]) and ".95" or ".38"
    w(string.format('<text x="%.0f" y="%.0f" fill="%s" fill-opacity="%s">%s</text>',n._x,n._y-46,fill,op,(n.name:gsub("&","&amp;"))))
  end
end
w('</g></svg>')
local fh=assert(io.open("asc.svg","w")); fh:write(table.concat(o,"\n")); fh:close()
local c=0 for _ in pairs(L) do c=c+1 end
print("wrote asc.svg with "..c.." Luminary nodes")
