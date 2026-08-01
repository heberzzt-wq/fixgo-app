const SOURCES=[
  ['INEGI','https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/23'],
  ['GeoJSON de respaldo','https://raw.githubusercontent.com/strotgen/mexico-leaflet/refs/heads/master/states.geojson']
];
const $=id=>document.getElementById(id);
const CX=600;
const CY=260;
const R=190;
let polygons=null;
let raf=0;
let timers=[];

function polygonArea(ring){
  let sum=0;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) sum+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
  return Math.abs(sum/2);
}
function normalizeGeoJSON(input){
  let feature=input;
  if(input.type==='FeatureCollection'){
    feature=input.features.find(f=>String(f.properties?.state_code)==='23'||/Quintana Roo/i.test(f.properties?.nomgeo||f.properties?.state_name||''));
  }
  if(!feature) throw new Error('No se encontró Quintana Roo');
  const geometry=feature.type==='Feature'?feature.geometry:feature;
  const raw=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!raw) throw new Error('Geometría inválida');
  return raw.filter(p=>p?.[0]?.length>2).sort((a,b)=>polygonArea(b[0])-polygonArea(a[0]));
}
async function fetchJSON(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
    if(!response.ok) throw new Error(String(response.status));
    return await response.json();
  }finally{clearTimeout(timeout)}
}
async function loadMap(){
  for(const [name,url] of SOURCES){
    try{
      $('loadingText').textContent='Consultando '+name+'…';
      polygons=normalizeGeoJSON(await fetchJSON(url));
      $('source').textContent=name;
      buildScene();
      $('loading').classList.add('hide');
      return;
    }catch(error){console.warn(name,error)}
  }
  $('loadingText').textContent='No se pudo cargar la cartografía. Revisa internet y pulsa Repetir.';
  $('source').textContent='sin conexión';
}
function project(source,bounds){
  const all=source.flatMap(poly=>poly.flat());
  const xs=all.map(p=>p[0]);
  const ys=all.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min(bounds.w/(maxX-minX),bounds.h/(maxY-minY));
  const offsetX=bounds.x+(bounds.w-(maxX-minX)*scale)/2;
  const offsetY=bounds.y+(bounds.h-(maxY-minY)*scale)/2;
  return source.map(poly=>poly.map(ring=>ring.map(([x,y])=>[offsetX+(x-minX)*scale,offsetY+(maxY-y)*scale])));
}
function ringPath(ring){return ring.map((point,index)=>(index?'L':'M')+point[0].toFixed(2)+' '+point[1].toFixed(2)).join(' ')+' Z'}
function polygonPath(poly){return poly.map(ringPath).join(' ')}
function polar(radius,angle){return [CX+Math.cos(angle)*radius,CY+Math.sin(angle)*radius]}
function arcPath(radius,start,end){
  const a=polar(radius,start),b=polar(radius,end);
  return `M${a[0].toFixed(2)} ${a[1].toFixed(2)} A${radius} ${radius} 0 ${end-start>Math.PI?1:0} 1 ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
}
function buildHud(){
  const parts=[];
  for(let i=0;i<128;i++){
    const angle=Math.PI*2*i/128-Math.PI/2;
    const inner=i%8===0?R+18:R+12;
    const outer=i%8===0?R+36:R+24;
    const a=polar(inner,angle),b=polar(outer,angle);
    parts.push(`<line class="hud ${i%8===0?'tick-strong':'tick'}" x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`);
  }
  const spokeAngles=[-156,-132,-104,-76,-48,-20,12,40,70,100,130,158].map(v=>v*Math.PI/180);
  spokeAngles.forEach(angle=>{
    const a=polar(R+38,angle),b=polar(R+90,angle);
    parts.push(`<line class="hud spoke" x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`);
    parts.push(`<circle class="hud dot" cx="${b[0].toFixed(2)}" cy="${b[1].toFixed(2)}" r="2.6"/>`);
  });
  [[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy])=>{
    const x=CX+dx*(R+42),y=CY+dy*(R+42);
    parts.push(`<line class="hud cross" x1="${x-24}" y1="${y}" x2="${x+24}" y2="${y}"/>`);
    parts.push(`<line class="hud cross" x1="${x}" y1="${y-24}" x2="${x}" y2="${y+24}"/>`);
    parts.push(`<circle class="hud node" cx="${x}" cy="${y}" r="4.6"/>`);
  });
  const arcs=[[-2.98,-2.58],[-2.39,-1.94],[-1.73,-1.26],[-1.05,-.57],[-.36,.06],[.29,.73],[.96,1.40],[1.62,2.08],[2.30,2.76]];
  arcs.forEach(([start,end],index)=>{
    const d=arcPath(R+52+(index%3)*10,start,end);
    parts.push(`<path class="hud arc-glow" d="${d}"/><path class="hud arc-core" d="${d}"/>`);
  });
  const micro=[[-218,-80,-262,-112],[202,-94,250,-126],[-232,28,-278,44],[222,40,274,60],[-132,196,-90,234],[128,194,178,232],[-48,-244,-30,-280],[44,-246,62,-282]];
  micro.forEach(([x1,y1,x2,y2])=>{
    parts.push(`<line class="hud micro" x1="${CX+x1}" y1="${CY+y1}" x2="${CX+x2}" y2="${CY+y2}"/>`);
    parts.push(`<circle class="hud dot" cx="${CX+x2}" cy="${CY+y2}" r="2.7"/>`);
  });
  return parts.join('');
}
function buildBranches(){
  const branches=[
    {d:`M${CX-R-12} ${CY-74} H318 L270 ${CY-122} H162`,node:[162,CY-122]},
    {d:`M${CX-R-12} ${CY-35} H332 L286 ${CY-71} H205`,node:[205,CY-71]},
    {d:`M${CX-R-12} ${CY+5} H300 L248 ${CY+5} H118`,node:[118,CY+5]},
    {d:`M${CX-R-12} ${CY+45} H336 L286 ${CY+92} H184`,node:[184,CY+92]},
    {d:`M${CX-R-12} ${CY+84} H320 L274 ${CY+138} H146`,node:[146,CY+138]},
    {d:`M${CX+R+12} ${CY-74} H882 L930 ${CY-122} H1038`,node:[1038,CY-122]},
    {d:`M${CX+R+12} ${CY-35} H868 L914 ${CY-71} H995`,node:[995,CY-71]},
    {d:`M${CX+R+12} ${CY+5} H900 L952 ${CY+5} H1082`,node:[1082,CY+5]},
    {d:`M${CX+R+12} ${CY+45} H864 L914 ${CY+92} H1016`,node:[1016,CY+92]},
    {d:`M${CX+R+12} ${CY+84} H880 L926 ${CY+138} H1054`,node:[1054,CY+138]}
  ];
  return branches.map((branch,index)=>`<g class="branch-group" data-index="${index}"><path class="branch-wide branch-path" d="${branch.d}"/><path class="branch-line branch-path" d="${branch.d}"/><path class="branch-hot branch-path" d="${branch.d}"/><circle class="branch-node" cx="${branch.node[0]}" cy="${branch.node[1]}" r="3.4"/></g>`).join('');
}
function buildInternalCircuits(){
  const lines=[];
  const center=[CX,CY+6];
  const endpoints=[[548,148],[574,132],[614,128],[646,154],[668,205],[665,255],[654,310],[636,365],[603,390],[566,372],[542,328],[535,276],[540,216]];
  endpoints.forEach((point,index)=>{
    const bendX=center[0]+(point[0]-center[0])*.48+(index%2?14:-14);
    const bendY=center[1]+(point[1]-center[1])*.48;
    lines.push(`M${center[0]} ${center[1]} L${bendX.toFixed(1)} ${bendY.toFixed(1)} L${point[0]} ${point[1]}`);
  });
  return lines.map((d,index)=>`<path class="circuit circuit-path" id="circuit${index}" d="${d}"/><path class="circuit-hot" d="${d}"/><circle class="circuit-node" cx="${endpoints[index][0]}" cy="${endpoints[index][1]}" r="2.7"/>`).join('');
}
function buildScene(){
  const projected=project(polygons,{x:520,y:96,w:160,h:330});
  const complete=projected.map(polygonPath).join(' ');
  const main=polygonPath(projected[0]);
  const islands=projected.slice(1).map(poly=>polygonPath(poly));
  $('scene').innerHTML=`
    <defs>
      <linearGradient id="ringStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".14" stop-color="#e4ffff"/><stop offset=".48" stop-color="#27f4ff"/><stop offset="1" stop-color="#126bff"/></linearGradient>
      <linearGradient id="mapStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".17" stop-color="#dcffff"/><stop offset=".58" stop-color="#27f4ff"/><stop offset="1" stop-color="#126bff"/></linearGradient>
      <filter id="wideGlow"><feGaussianBlur stdDeviation="11"/></filter>
      <filter id="softGlow"><feGaussianBlur stdDeviation="4.2"/></filter>
      <filter id="lineGlow"><feGaussianBlur stdDeviation="1.65"/></filter>
      <filter id="tinyGlow"><feGaussianBlur stdDeviation="1.5"/></filter>
      <filter id="hudGlow"><feGaussianBlur stdDeviation="2"/></filter>
      <filter id="hudGlowStrong"><feGaussianBlur stdDeviation="3.1"/></filter>
      <filter id="nodeGlow"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id="tailGlow"><feGaussianBlur stdDeviation="2.6"/></filter>
      <filter id="headGlow"><feGaussianBlur stdDeviation="3.4"/></filter>
      <clipPath id="mapClip"><path d="${complete}"/></clipPath>
    </defs>
    <circle class="nucleus-wide" id="nucleusWide" cx="${CX}" cy="${CY}" r="34"/>
    <circle class="nucleus-mid" id="nucleusMid" cx="${CX}" cy="${CY}" r="16"/>
    <circle class="nucleus-core" id="nucleusCore" cx="${CX}" cy="${CY}" r="5.5"/>
    <circle class="final-pulse" id="finalPulse" cx="${CX}" cy="${CY}" r="${R+8}"/>
    <circle class="outer-ring" cx="${CX}" cy="${CY}" r="${R+29}" stroke-dasharray="4 8"/>
    <circle class="core-wide" id="ringWide" cx="${CX}" cy="${CY}" r="${R}"/>
    <circle class="core-mid" id="ringMid" cx="${CX}" cy="${CY}" r="${R}"/>
    <circle class="core-line" id="ringLine" cx="${CX}" cy="${CY}" r="${R}"/>
    <circle class="core-hot" id="ringHot" cx="${CX}" cy="${CY}" r="${R}"/>
    <circle class="inner-ring" cx="${CX}" cy="${CY}" r="${R-24}" stroke-dasharray="3 7"/>
    <g id="hud">${buildHud()}</g>
    <g id="branches">${buildBranches()}</g>
    <path class="map-fill" d="${complete}"/>
    <g clip-path="url(#mapClip)" id="internalCircuits">${buildInternalCircuits()}</g>
    <path class="map-wide" id="mapWide" d="${main}"/>
    <path class="map-mid" id="mapMid" d="${main}"/>
    <path class="map-line" id="mapLine" d="${main}"/>
    <path class="map-hot" id="mapHot" d="${main}"/>
    <g id="islands">${islands.map(d=>`<path class="island-wide island" d="${d}"/><path class="island-mid island" d="${d}"/><path class="island-line island" d="${d}"/><path class="island-hot island" d="${d}"/>`).join('')}</g>
    <path class="head-tail" id="headTail"/>
    <circle class="head-halo" id="headHalo" r="23"/>
    <circle class="head-core" id="headCore" r="5.4"/>
  `;
  prepareWordmark();
  replay();
}
function prepareWordmark(){
  $('letters').innerHTML=[...'PEN\u00cdNSULA'].map(letter=>`<i>${letter}</i>`).join('');
  $('tech').classList.remove('on');
  $('tag').classList.remove('on');
  $('slogan').classList.remove('on');
}
function clearAnimation(){
  cancelAnimationFrame(raf);
  timers.forEach(clearTimeout);
  timers=[];
  $('screenFlash').classList.remove('run');
  $('scene').classList.remove('energized');
  $('stage').classList.remove('powered');
  ['nucleusWide','nucleusMid','nucleusCore'].forEach(id=>$(id)?.classList.remove('on'));
}
function animateStroke(elements,duration,done){
  const main=elements[0];
  const length=main.getTotalLength();
  elements.forEach(element=>{element.style.strokeDasharray=String(length);element.style.strokeDashoffset=String(length)});
  const tail=$('headTail'),core=$('headCore'),halo=$('headHalo');
  core.style.opacity=1;halo.style.opacity=1;
  const start=performance.now();
  function frame(now){
    const progress=Math.min(1,(now-start)/duration);
    const distance=length*progress;
    const point=main.getPointAtLength(distance);
    const previous=main.getPointAtLength(Math.max(0,distance-72));
    elements.forEach(element=>element.style.strokeDashoffset=String(length-distance));
    tail.setAttribute('d',`M${previous.x.toFixed(2)} ${previous.y.toFixed(2)} L${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
    core.setAttribute('cx',point.x);core.setAttribute('cy',point.y);
    halo.setAttribute('cx',point.x);halo.setAttribute('cy',point.y);
    halo.setAttribute('r',String(22+Math.sin(now/78)*3.2));
    if(progress<1){raf=requestAnimationFrame(frame)}else{
      tail.setAttribute('d','');core.style.opacity=0;halo.style.opacity=0;done&&done();
    }
  }
  raf=requestAnimationFrame(frame);
}
function hideStrokeElements(elements){
  elements.forEach(element=>{
    const length=element.getTotalLength();
    element.style.transition='none';
    element.style.strokeDasharray=String(length);
    element.style.strokeDashoffset=String(length);
  });
}
function revealGroup(selector,step){
  document.querySelectorAll(selector).forEach((element,index)=>timers.push(setTimeout(()=>element.classList.add('on'),index*step)));
}
function animatePathList(selector,step,duration){
  document.querySelectorAll(selector).forEach((element,index)=>{
    const length=element.getTotalLength();
    element.style.transition='none';
    element.style.strokeDasharray=String(length);
    element.style.strokeDashoffset=String(length);
    timers.push(setTimeout(()=>{
      element.style.transition=`stroke-dashoffset ${duration}ms ease`;
      element.style.strokeDashoffset='0';
    },index*step));
  });
}
function animateBranches(){
  document.querySelectorAll('.branch-group').forEach((group,index)=>{
    const paths=[...group.querySelectorAll('.branch-path')];
    const length=paths[0].getTotalLength();
    paths.forEach(path=>{
      path.style.transition='none';
      path.style.strokeDasharray=String(length);
      path.style.strokeDashoffset=String(length);
    });
    timers.push(setTimeout(()=>{
      paths.forEach(path=>{
        path.style.transition='stroke-dashoffset .88s ease';
        path.style.strokeDashoffset='0';
      });
      const node=group.querySelector('.branch-node');
      timers.push(setTimeout(()=>node.style.opacity='1',700));
    },index*75));
  });
}
function revealWordmark(delay){
  const letters=[...document.querySelectorAll('#letters i')];
  letters.forEach((letter,index)=>timers.push(setTimeout(()=>letter.classList.add('on'),delay+index*105)));
  timers.push(setTimeout(()=>$('tech').classList.add('on'),delay+letters.length*105+100));
  timers.push(setTimeout(()=>$('tag').classList.add('on'),delay+letters.length*105+380));
  timers.push(setTimeout(()=>$('slogan').classList.add('on'),delay+letters.length*105+670));
}
function fullPower(){
  $('scene').classList.add('energized');
  $('stage').classList.remove('powered');
  void $('stage').offsetWidth;
  $('stage').classList.add('powered');
  document.querySelectorAll('.hud').forEach(element=>element.classList.add('on'));
  document.querySelectorAll('.island,.circuit,.circuit-hot,.circuit-node,.branch-node').forEach(element=>element.style.opacity='1');
  const flash=$('screenFlash');
  flash.classList.remove('run');
  void flash.offsetWidth;
  flash.classList.add('run');
  const pulse=$('finalPulse');
  pulse.classList.remove('run');
  void pulse.getBBox();
  pulse.classList.add('run');
}
function replay(){
  if(!polygons){loadMap();return}
  clearAnimation();
  prepareWordmark();
  document.querySelectorAll('.hud').forEach(element=>element.classList.remove('on'));
  document.querySelectorAll('.island,.circuit,.circuit-hot,.circuit-node,.branch-node').forEach(element=>element.style.opacity='0');
  hideStrokeElements([$('mapLine'),$('mapWide'),$('mapMid'),$('mapHot'),$('ringLine'),$('ringWide'),$('ringMid'),$('ringHot')]);
  document.querySelectorAll('.branch-group').forEach(group=>hideStrokeElements([...group.querySelectorAll('.branch-path')]));

  timers.push(setTimeout(()=>{
    $('nucleusWide').classList.add('on');
    $('nucleusMid').classList.add('on');
    $('nucleusCore').classList.add('on');
  },120));

  timers.push(setTimeout(()=>animateStroke([$('mapLine'),$('mapWide'),$('mapMid'),$('mapHot')],1850,()=>{
    animatePathList('.circuit-path',40,780);
    timers.push(setTimeout(()=>document.querySelectorAll('.circuit,.circuit-hot,.circuit-node').forEach(element=>element.style.opacity='1'),150));

    timers.push(setTimeout(()=>animateStroke([$('ringLine'),$('ringWide'),$('ringMid'),$('ringHot')],1500,()=>{
      revealGroup('.hud',5);
      animateBranches();
      timers.push(setTimeout(()=>document.querySelectorAll('.island').forEach(element=>element.style.opacity='1'),820));
      timers.push(setTimeout(fullPower,1220));
      revealWordmark(1420);
    }),760));
  }),520));
}
$('replay').onclick=replay;
$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
window.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='r')replay()});
prepareWordmark();
loadMap();
