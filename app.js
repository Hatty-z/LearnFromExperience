'use strict';
const DATA = window.EXPERIMENTS;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = value => { const s=Math.max(0,Math.floor(value||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
let serial=0;
// Some static hosts expose only a zero-length seekable range for partial MP4s.
// On the first seek, load that recording once as a Blob; range-capable hosts
// continue using native streaming. Keep only the latest requested position.
const mediaLoads=new WeakMap();
function seekMedia(video,time){
 let state=mediaLoads.get(video);
 if(!state){state={sequence:0,source:video.currentSrc||video.src};mediaLoads.set(video,state);}
 const sequence=++state.sequence;
 const apply=()=>{if(sequence===state.sequence&&video.isConnected)video.currentTime=time;};
 if(video.src.startsWith('blob:')||(!state.promise&&(time===0||Array.from({length:video.seekable.length},(_,i)=>i).some(i=>time>=video.seekable.start(i)&&time<=video.seekable.end(i))))){apply();return;}
 video.dispatchEvent(new Event('seekloading'));
 if(!state.promise){
  state.controller=new AbortController();
  state.promise=(async()=>{
   const response=await fetch(state.source,{signal:state.controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error(`Recording response ${response.status}`);
   const blob=await response.blob();
   if(!video.isConnected||state.controller.signal.aborted)return;
   state.url=URL.createObjectURL(blob);
   await new Promise((resolve,reject)=>{
    const cleanup=()=>{video.removeEventListener('loadedmetadata',ready);video.removeEventListener('error',failed);};
    const ready=()=>{cleanup();resolve();};
    const failed=()=>{cleanup();reject(new Error('Recording could not be decoded'));};
    video.addEventListener('loadedmetadata',ready);video.addEventListener('error',failed);
    video.src=state.url;video.load();
   });
  })().catch(error=>{state.promise=null;if(error.name!=='AbortError')video.dispatchEvent(new Event('seekerror'));});
 }
 state.promise.then(()=>{if(video.src.startsWith('blob:'))apply();});
}
function pauseOthers(except) { for(const v of document.querySelectorAll('video')) if(v!==except) v.pause(); }
function stopInside(container) { container.querySelectorAll('video').forEach(v=>{v.pause();const load=mediaLoads.get(v);if(load){load.sequence++;load.controller?.abort();if(load.url)URL.revokeObjectURL(load.url);mediaLoads.delete(v);}}); }
function setTabs(button, selector) { document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-selected',String(b===button))); }
function nodeMarkup(d) { return d.nodes.map((n,i)=>`<button class="node ${n.featured?'featured':''} ${esc(n.kind)} ${n.kind==='fail'?'branch':''}" data-node="${i}" aria-label="${esc(n.title)}, ${clock(n.t)}"><span><strong>${esc(n.title)}</strong><small>${n.featured?'KEY DECISION · ':''}${n.call?esc(n.call)+' · ':''}${clock(n.t)}</small></span></button>`).join(''); }
function evidenceMarkup(e) {
 return `<div class="component-evidence"><p class="evidence-label">${esc(e.label)}</p><h4>${esc(e.title)}</h4>${e.states?.length?`<div class="progress-track" aria-label="Recorded subgoal status">${e.states.map(s=>`<div class="${esc(s.status)}"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('')}</div>`:''}<div class="evidence-steps">${e.steps.map(s=>`<div><strong>${esc(s.label)}</strong><p>${esc(s.text)}</p></div>`).join('')}</div>${e.links?.length?`<div class="evidence-links">${e.links.map(l=>`<button data-evidence-time="${l.t}">${esc(l.label)}</button>`).join('')}</div>`:''}${e.foot?`<p class="evidence-foot">${esc(e.foot)}</p>`:''}</div>`;
}
function playerMarkup(key, options={}) {
 const d=DATA[key],id=`player-${++serial}`;
 const mode=key==='reach_plush'?'plush':key==='stand_bottle'?'bottle':key==='hex'?'hex':key==='tighten_hex_screw'?'wrench':'';
 const trace=d.trace?`<details class="full-trace"><summary>${esc(d.traceLabel||'Full recorded trace')}</summary><p>Verbatim recorded notes. Click a timestamp to inspect the corresponding observation.</p><ol>${d.trace.map(n=>`<li${n.cam?' class="cam"':''}><button class="trace-seek" data-time="${n.t}">${esc(n.call)} · ${clock(n.t)}</button><span>${esc(n.text)}</span></li>`).join('')}</ol></details>`:'';
 return `<article class="exhibit" data-case="${key}" id="${id}" ${d.trace?'data-detailed="true"':''}><div class="exhibit-title"><h3>${esc(d.title)}</h3>${d.result?`<span class="result ${(['hex','towel_expert'].includes(key)||d.outcomeStatus==='unconfirmed')?'failure':''}">${esc(d.result)}</span>`:''}</div>${d.keyInsight?`<button class="key-insight${d.keyKind?' '+d.keyKind:''}" data-key-call="${esc(d.keyCall)}"><small>${esc(d.keyLabel||'KEY DECISION')} · ${esc(d.keyCall)}</small><strong>${esc(d.keyInsight).replace(/\[\[(.+?)\]\]/g,'<em class="key-num">$1</em>')}</strong><span>Inspect the turning point →</span></button>`:''}<div class="exhibit-body"><div class="screen-column"><div class="screen ${mode}"><video class="main-video" controls playsinline preload="metadata" poster="assets/${esc(d.poster||`poster-${key}.jpg`)}" src="assets/${esc(d.src)}"></video><span class="screen-label">${esc(d.screenLabel||(key==='bread'?'COMPILED · VARIABLE SPEED':key==='hex'?'TOP / RIGHT WRIST':'RECORDED EXECUTION'))}</span><div class="overlay-caption" aria-live="off"></div>${options.demo?`<div class="input-inset"><span>HUMAN DEMONSTRATION ·<br>SAMPLED INPUT</span><video class="demo-video" controls playsinline preload="metadata" src="assets/${esc(d.demo)}"></video></div>`:''}</div><div class="transport"><button class="play icon-button" aria-label="Play ${esc(d.title)}">▶</button><input class="scrub" aria-label="${esc(d.title)} timeline" type="range" min="0" max="${d.duration}" value="0" step="0.05"><output>0:00 / ${clock(d.duration)}</output><select aria-label="${esc(d.title)} playback speed">${d.timeScale?`<option value="${1/d.timeScale}">1× recorded</option><option value="${2/d.timeScale}">2× recorded</option><option value="1" selected>${d.timeScale}× recorded</option>`:'<option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option>'}</select><button class="expand" aria-label="Fullscreen ${esc(d.title)}">⛶</button></div><div class="seek-status" role="status"></div>${d.trace||d.nodes.some(n=>n.evidence)?'<div class="reasoning-panel" aria-live="polite"></div>':''}</div><aside class="decision-rail"><div class="rail-title"><span>DECISION PATH</span><span>Click to inspect ↓</span></div><div class="path"><svg class="path-lines" aria-hidden="true"></svg>${nodeMarkup(d)}</div><div class="action-note"></div></aside></div><div class="exhibit-foot">${trace}</div></article>`;
}
function drawConnectors(root) {
 const path=root.querySelector('.path'); if(!path)return;
 const svg=path.querySelector('svg');const buttons=[...path.querySelectorAll('.node')];
 if(!buttons.length)return;
 const h=path.clientHeight,w=path.clientWidth;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 svg.innerHTML=buttons.slice(1).map((b,i)=>{const a=buttons[i];const x1=a.classList.contains('branch')?24.5:4.5,x2=b.classList.contains('branch')?24.5:4.5;const y1=a.offsetTop+18,y2=b.offsetTop+18;return `<path d="M${x1} ${y1} C${x1} ${(y1+y2)/2},${x2} ${(y1+y2)/2},${x2} ${y2}" fill="none" stroke="${b.classList.contains('fail')?'#c8a692':'#b3bfb4'}" stroke-width="1.2" ${b.classList.contains('fail')?'stroke-dasharray="3 3"':''}/>`}).join('');
}
function bindDemo(video,label,initial) {
 video.controls=false;
 const controls=document.createElement('div');controls.className='demo-transport';
 controls.innerHTML=`<button aria-label="Play ${esc(label)}">▶</button><input type="range" aria-label="${esc(label)} timeline" min="0" max="12" step="0.05" value="0">`;
 video.insertAdjacentElement('afterend',controls);
 const b=controls.querySelector('button'),r=controls.querySelector('input');let pending=null;
 function seek(t){video.pause();pending=Number(t);if(video.readyState>=1)seekMedia(video,pending);}
 video.addEventListener('seeked',()=>{pending=null;});
 video.addEventListener('seekloading',()=>{b.textContent='…';b.title='Loading recording for seeking…';});
 video.addEventListener('seekerror',()=>{pending=null;b.textContent='▶';b.title='Could not load recording. Try again.';});
 video.addEventListener('seeked',()=>{b.textContent='▶';b.title='';});
 video.addEventListener('loadedmetadata',()=>{r.max=video.duration-.05;if(pending!==null)seek(pending);else if(initial!==undefined)seek(Math.min(initial,video.duration-.1));});
 video.addEventListener('timeupdate',()=>{r.value=video.currentTime;});
 video.addEventListener('play',()=>{b.textContent='Ⅱ';b.setAttribute('aria-label',`Pause ${label}`);});
 video.addEventListener('pause',()=>{b.textContent='▶';b.setAttribute('aria-label',`Play ${label}`);});
 r.addEventListener('input',()=>seek(r.value));
 b.addEventListener('click',()=>{if(video.paused){if(video.ended)video.currentTime=0;video.play().catch(()=>{});}else video.pause();});
 video.addEventListener('click',()=>b.click());
 if(video.readyState>=1){r.max=video.duration-.05;if(initial!==undefined)seek(Math.min(initial,video.duration-.1));}
}
function bindPlayer(root,options={}) {
 const d=DATA[root.dataset.case],video=root.querySelector('.main-video'),slider=root.querySelector('.scrub'),output=root.querySelector('output'),button=root.querySelector('.play'),status=root.querySelector('.seek-status');
 const nodes=[...root.querySelectorAll('.node')];let pending=null,last=-2,scrubbing=false;
 video.controls=false;
 function update() {
  const t=pending??video.currentTime;
  if(!scrubbing)slider.value=t;
  output.textContent=`${clock(t)} / ${clock(video.duration||d.duration)}`;
  let i=d.nodes.findLastIndex(n=>t+.15>=n.t);
  if(i!==last) {
   last=i;nodes.forEach((b,k)=>{b.classList.toggle('active',k===i);b.setAttribute('aria-current',String(k===i));});
   const path=root.querySelector('.path');if(i>=0&&path&&path.scrollWidth>path.clientWidth){const selected=nodes[i];path.scrollLeft=selected.offsetLeft-path.offsetLeft-12;}
   const n=d.nodes[i];const caption=root.querySelector('.overlay-caption');
   if(caption)caption.innerHTML=n?.quote?`<div class="quote"><small>OPERATOR INSTRUCTION · ${esc(n.call)}</small>“${esc(n.quote)}”</div>`:keyCaption(n);
   const note=root.querySelector('.action-note');if(note)note.textContent=n?.note||d.subtitle;
   const panel=root.querySelector('.reasoning-panel');
   if(panel)panel.innerHTML=n?.evidence?evidenceMarkup(n.evidence):d.trace&&n?`<div class="stage-quotes is-open"><h5>Recorded notes · ${esc(n.trace?.[0]?.call||n.call)}${n.trace?.length>1?'–'+esc(n.trace.at(-1).call):''}</h5>${(n.trace||[]).map(q=>`${q.fb?`<div class="fb-line"><h6>FEEDBACK DELIVERED BEFORE ${esc(q.call)}</h6><p>${esc(q.fb)}</p></div>`:''}<blockquote><span>${esc(q.call)}</span> ${esc(q.text)}</blockquote>`).join('')}</div>`:'';
   panel?.querySelectorAll('[data-evidence-time]').forEach(b=>b.addEventListener('click',()=>seek(b.dataset.evidenceTime)));

  }
  if(options.onTime)options.onTime(t);
 }
 function keyCaption(n){return n?`${n.call?`<span class="micro">${esc(n.call)}</span> &nbsp; `:''}${esc(n.title)}`:'';}
 function seek(time) {
  video.pause();pending=Math.max(0,Math.min(Number(time), (video.duration||d.duration)-.05));
  slider.value=pending;status.textContent='Seeking…';update();
  if(video.readyState>=1)seekMedia(video,pending);
 }
 video.addEventListener('loadedmetadata',()=>{slider.max=video.duration;if(pending!==null)seekMedia(video,pending);update();});
 video.addEventListener('seekloading',()=>{status.textContent='Loading recording for seeking…';});
 video.addEventListener('seekerror',()=>{pending=null;status.textContent='Recording could not load for seeking. Select the timestamp to retry.';});
 video.addEventListener('seeked',()=>{status.textContent='';pending=null;update();});
 video.addEventListener('timeupdate',update);
 video.addEventListener('play',()=>{button.textContent='Ⅱ';button.setAttribute('aria-label',`Pause ${d.title}`);});
 video.addEventListener('pause',()=>{button.textContent='▶';button.setAttribute('aria-label',`Play ${d.title}`);});
 video.addEventListener('ended',update);
 video.addEventListener('error',()=>{status.textContent='Video could not load. Reload this view to retry.';status.classList.add('error-message');});
 slider.addEventListener('input',()=>{scrubbing=true;seek(slider.value);});
 slider.addEventListener('change',()=>{seek(slider.value);scrubbing=false;});
 slider.addEventListener('pointerup',()=>{scrubbing=false;});
 slider.addEventListener('blur',()=>{scrubbing=false;});
 button.addEventListener('click',async()=>{
  if(!video.paused){video.pause();return;}
  pauseOthers(video);
  if(video.ended || (options.replayEnd && video.currentTime>=options.replayEnd-.5))video.currentTime=options.replayStart||0;
  try{await video.play();status.textContent='';}catch{status.textContent='Press play again once the video has loaded.';}
 });
 root.querySelector('select').addEventListener('change',e=>{video.playbackRate=Number(e.target.value);});
 root.querySelector('.expand').addEventListener('click',async()=>{
  const target=root.querySelector('.screen-column');
  if(document.fullscreenElement){await document.exitFullscreen();return;}
  try{await target.requestFullscreen();}catch{if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();}
 });
 nodes.forEach((b,i)=>b.addEventListener('click',()=>seek(d.nodes[i].t)));
 root.querySelectorAll('.trace-seek').forEach(b=>b.addEventListener('click',()=>seek(Number(b.dataset.time))));
 root.querySelector('.key-insight')?.addEventListener('click',()=>{const n=d.nodes.find(n=>n.call===d.keyCall);if(n)seek(n.t);});
 video.addEventListener('click',()=>button.click());
 root.querySelectorAll('.input-inset .demo-video').forEach(v=>bindDemo(v,d.title+' input samples'));
 drawConnectors(root);update();
 if(options.initial!==undefined)seek(options.initial);
 const player={root,video,seek};return player;
}
function renderPlayer(container,key,options={}) {stopInside(container);container.innerHTML=playerMarkup(key,options);return bindPlayer(container.firstElementChild,options);}
// The two unpaired episodes have independent clocks. Preserve real durations;
// never normalize a long failed rollout to the short successful one.
const GRASPS=window.GRASPS;

/* Commanded-target trace. One scale for all three axes, so the flat sideways
   spread stays flat; the floor sits at the lowest height the run ever asked for. */
let trajAz=38, trajEl=26;
function trajBounds(d){
 const all=[...(d.baseline.traj||[]),...(d.history.traj||[])];
 if(!all.length)return null;
 const ax=['x','y','z'].map(k=>{const v=all.map(p=>p[k]);return [Math.min(...v),Math.max(...v)];});
 const span=Math.max(...ax.map(r=>r[1]-r[0]))||.01;
 return {c:ax.map(r=>(r[0]+r[1])/2), s:span*1.3, floor:ax[2][0]};
}
function trajSvg(pts,bn,accent){
 if(!bn||!pts||!pts.length)return '';
 const W=300,H=190,cx=W/2,cy=H/2+8,k=Math.min(W,H)*0.74/bn.s;
 const A=trajAz*Math.PI/180,E=trajEl*Math.PI/180;
 const pr=(x,y,z)=>{const dx=x-bn.c[0],dy=y-bn.c[1],dz=z-bn.c[2];
  const u=dx*Math.cos(A)-dy*Math.sin(A), v=dx*Math.sin(A)+dy*Math.cos(A);
  return [cx+u*k, cy+(v*Math.sin(E)-dz*Math.cos(E))*k];};
 const h=bn.s/2, fz=bn.floor;
 const floor=[[-h,-h],[h,-h],[h,h],[-h,h]].map(([p,q])=>pr(bn.c[0]+p,bn.c[1]+q,fz));
 let s=`<polygon points="${floor.map(p=>p.join(',')).join(' ')}" fill="var(--soft)" stroke="var(--line)" stroke-width="1"/>`;
 for(let i=1;i<4;i++){const f=-h+i*(2*h)/4;
  const a1=pr(bn.c[0]+f,bn.c[1]-h,fz),a2=pr(bn.c[0]+f,bn.c[1]+h,fz);
  const b1=pr(bn.c[0]-h,bn.c[1]+f,fz),b2=pr(bn.c[0]+h,bn.c[1]+f,fz);
  s+=`<line x1="${a1[0]}" y1="${a1[1]}" x2="${a2[0]}" y2="${a2[1]}" stroke="var(--line)" stroke-width=".5"/>`
   + `<line x1="${b1[0]}" y1="${b1[1]}" x2="${b2[0]}" y2="${b2[1]}" stroke="var(--line)" stroke-width=".5"/>`;}
 const P=pts.map(p=>pr(p.x,p.y,p.z));
 pts.forEach((p,i)=>{const f=pr(p.x,p.y,fz);
  s+=`<line x1="${P[i][0]}" y1="${P[i][1]}" x2="${f[0]}" y2="${f[1]}" stroke="var(--line)" stroke-width=".5" opacity=".22"/>`;});
 s+=`<polyline fill="none" stroke="${accent?'var(--accent)':'var(--muted)'}" stroke-opacity=".75" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${P.map(q=>q.join(',')).join(' ')}"/>`;
 pts.forEach((p,i)=>{
  const col=p.r?'var(--bad,#b23a2c)':(accent?'var(--accent)':'var(--muted)');
  s+=`<circle class="tj-p" data-i="${i}" cx="${P[i][0]}" cy="${P[i][1]}" r="3.2" fill="${col}" stroke="var(--panel,#fff)" stroke-width=".9"/>`;});
 s+=`<circle class="tj-cur" r="5.5" fill="none" stroke="var(--ink)" stroke-width="1.6" opacity="0"/>`;
 return `<svg class="tj" viewBox="0 0 ${W} ${H}" role="img" aria-label="Measured end-effector path in space">${s}</svg>`;
}

function graspTimeline(d){
 const bd=Number(d.baseline.duration)||1, hd=Number(d.history.duration)||1;
 const pc=(t,dur)=>Math.max(0,Math.min(100,(Number(t)/dur)*100));
 const dec=d.decisions||[];
 const rail=(sk,side,dur)=>`<div class="vtl-rail" data-side="${side}"><i class="vtl-line"></i><i class="vtl-cursor"></i>`+
  dec.map((r,i)=>`<button class="vtl-mark${r.key?' key':''}" data-i="${i}" style="top:${pc(r[sk].t,dur)}%" aria-label="${esc(r.s)} - ${clock(r[sk].t)}"><em>${clock(r[sk].t)}</em></button>`).join('')+
  `<span class="vtl-a">0:00</span><span class="vtl-b">${clock(dur)}</span></div>`;
 const tips=dec.map((r,i)=>`<span class="vtl-tip" data-i="${i}" style="top:${pc(r.h.t,hd)}%"><b>${esc(r.s)}</b>${r.key?'<em>Key decision</em>':''}<i><u>Without memory · ${clock(r.b.t)}</u>${esc(r.b.x)}</i><i><u>With memory · ${clock(r.h.t)}</u>${esc(r.h.x)}</i></span>`).join('');
 const links=dec.map((r,i)=>`<line x1="0" y1="${pc(r.b.t,bd)}" x2="100" y2="${pc(r.h.t,hd)}" data-i="${i}"${r.key?' class="key"':''} vector-effect="non-scaling-stroke"/>`).join('');
 return `<div class="vtl">${rail('b','baseline',bd)}<svg class="vtl-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>${rail('h','history',hd)}<div class="vtl-tips">${tips}</div></div>`;
}

function renderGrasp(taskKey){
 const d=GRASPS.tasks[taskKey],container=document.getElementById('grasp-compare'),seekers={};stopInside(container);
 container.innerHTML=`<div class="grasp-shared"><button id="pair-play" aria-label="Play both grasp recordings">Play both ▶</button><span>1× recorded time · independent timelines</span></div><div class="grasp-pair">${['baseline','tl','history'].map(condition=>{if(condition==='tl')return graspTimeline(d);const c=d[condition],label=condition==='baseline'?'Without memory':'With memory';return `<article class="grasp-condition" data-condition="${condition}"><div class="film-label ${condition==='history'?'accent':''}">${label}<span>top + ${esc(c.wrist)} wrist</span></div><video playsinline preload="metadata" controls src="${esc(c.src)}"></video><div class="grasp-controls"><button class="grasp-play icon-button" aria-label="Play ${esc(d.title)} ${label.toLowerCase()}">▶</button><input type="range" aria-label="${esc(d.title)} ${label.toLowerCase()} timeline" min="0" max="${c.duration}" value="0" step="0.05"><output>0:00 / ${clock(c.duration)}</output></div><div class="grasp-status" role="status"></div><div class="tj-wrap" data-side="${condition}">${trajSvg(c.traj,trajBounds(d),condition==='history')}</div></article>`;}).join('')}</div><p class="vtl-note">Each rail is one run on its own clock; a line joins the same decision in both. Hover a point to read what happened there — the key decision stays open. The chart under each video traces the measured end-effector path of the working arm.</p>`;
 const both=container.querySelector('#pair-play'),videos=[...container.querySelectorAll('video')];
 function updateBoth(){const playing=videos.some(v=>!v.paused&&!v.ended);both.textContent=playing?'Pause both Ⅱ':'Play both ▶';both.setAttribute('aria-label',playing?'Pause both grasp recordings':'Play both grasp recordings');}
 container.querySelectorAll('.grasp-condition').forEach(root=>{
  const c=d[root.dataset.condition],v=root.querySelector('video'),slider=root.querySelector('input'),out=root.querySelector('output'),play=root.querySelector('.grasp-play'),status=root.querySelector('.grasp-status'),label=root.dataset.condition==='baseline'?'without memory':'with memory';let pending=null;
  v.controls=false;
  function update(){slider.value=pending??v.currentTime;out.textContent=`${clock(pending??v.currentTime)} / ${clock(v.duration||c.duration)}`;let idx=c.milestones.findLastIndex(n=>(pending??v.currentTime)+.15>=n.t);root.querySelectorAll('[data-time]').forEach((b,i)=>b.classList.toggle('current',i===idx));play.textContent=v.paused?'▶':'Ⅱ';play.setAttribute('aria-label',`${v.paused?'Play':'Pause'} ${d.title} ${label}`);updateBoth();}
  function seek(t){v.pause();pending=Math.min(Math.max(0,Number(t)),(v.duration||c.duration)-.05);status.textContent='Seeking…';if(v.readyState>=1)seekMedia(v,pending);update();}
  v.addEventListener('loadedmetadata',()=>{slider.max=v.duration;if(pending!==null)seekMedia(v,pending);update();});v.addEventListener('seekloading',()=>{status.textContent='Loading recording for seeking…';});v.addEventListener('seekerror',()=>{pending=null;status.textContent='Recording could not load for seeking. Select a timestamp to retry.';});v.addEventListener('seeked',()=>{pending=null;status.textContent='';update();});['timeupdate','play','pause','ended'].forEach(event=>v.addEventListener(event,update));v.addEventListener('error',()=>status.textContent='Recording could not load. Reload this comparison to retry.');
  seekers[root.dataset.condition]=seek;
  slider.addEventListener('input',()=>seek(slider.value));root.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>seek(b.dataset.time)));
  play.addEventListener('click',()=>{if(!v.paused){v.pause();return;}pauseOthers(v);if(v.ended)v.currentTime=0;v.play().catch(()=>status.textContent='Press play again after the recording loads.');});v.addEventListener('click',()=>play.click());
 });
 const bn3=trajBounds(d);
 const tjSync={};
 let tjDrag=null;
 function tjDraw(){
  container.querySelectorAll('.tj-wrap').forEach(w=>{
   const side=w.dataset.side;
   w.innerHTML=trajSvg(d[side].traj,bn3,side==='history');
   w.querySelectorAll('.tj-p').forEach(el=>{
    const p=(d[side].traj||[])[+el.dataset.i]; if(!p)return;
    el.addEventListener('click',()=>{const f=seekers[side];if(f&&p.t!=null)f(p.t);});
   });
  });
  Object.keys(tjSync).forEach(k=>tjSync[k]&&tjSync[k]());
 }
 if(bn3){
  tjDraw();
  // the svg is rebuilt on every frame, so the drag lives on the wrapper, which is not
  container.querySelectorAll('.tj-wrap').forEach(w=>{
   w.addEventListener('pointerdown',e=>{
    if(e.target.closest('.tj-p'))return;
    tjDrag={x:e.clientX,y:e.clientY,a:trajAz,e:trajEl};
    w.classList.add('dragging');
    try{w.setPointerCapture(e.pointerId);}catch(_){}
    e.preventDefault();
   });
   w.addEventListener('pointermove',e=>{
    if(!tjDrag)return;
    trajAz=tjDrag.a+(e.clientX-tjDrag.x)*0.6;
    trajEl=Math.max(8,Math.min(80,tjDrag.e-(e.clientY-tjDrag.y)*0.4));
    tjDraw();
   });
   const end=e=>{tjDrag=null;w.classList.remove('dragging');
    try{w.releasePointerCapture(e.pointerId);}catch(_){}};
   w.addEventListener('pointerup',end);
   w.addEventListener('pointercancel',end);
   w.addEventListener('lostpointercapture',()=>{tjDrag=null;w.classList.remove('dragging');});
  });
  container.querySelectorAll('.grasp-condition').forEach(root=>{
   const side=root.dataset.condition,v=root.querySelector('video');
   tjSync[side]=()=>{
    const svg=root.querySelector('.tj'),cur=svg&&svg.querySelector('.tj-cur');
    const pts=d[side].traj||[]; if(!cur||!pts.length)return;
    let i=-1,now=v.currentTime||0;
    for(let k=0;k<pts.length;k++)if(pts[k].t!=null&&pts[k].t<=now+0.2)i=k;
    const c=i>=0?svg.querySelectorAll('.tj-p')[i]:null;
    if(!c){cur.setAttribute('opacity','0');return;}
    cur.setAttribute('cx',c.getAttribute('cx'));cur.setAttribute('cy',c.getAttribute('cy'));
    cur.setAttribute('opacity','1');
   };
   v.addEventListener('timeupdate',tjSync[side]);
   v.addEventListener('seeked',tjSync[side]);
   tjSync[side]();
  });
 }
 const tl=container.querySelector('.vtl');
 if(tl){
  const dec=d.decisions||[];
  const hot=(i,on)=>tl.querySelectorAll('[data-i="'+i+'"]').forEach(el=>el.classList.toggle('hot',on));
  let pinned=dec.findIndex(r=>r.key); if(pinned<0)pinned=0;
  const paint=()=>{dec.forEach((r,i)=>hot(i,i===pinned));};
  tl.querySelectorAll('.vtl-mark,.vtl-label').forEach(el=>{
   const i=Number(el.dataset.i);
   const enter=()=>{dec.forEach((r,k)=>hot(k,k===i));};
   el.addEventListener('mouseenter',enter);
   el.addEventListener('focus',enter);
   el.addEventListener('click',()=>{pinned=i;const r=dec[i];if(r){if(seekers.baseline)seekers.baseline(r.b.t);if(seekers.history)seekers.history(r.h.t);}paint();});
  });
  tl.addEventListener('mouseleave',paint);
  container.querySelectorAll('.grasp-condition').forEach(root=>{
   const side=root.dataset.condition,v=root.querySelector('video');
   const cur=tl.querySelector('.vtl-rail[data-side="'+side+'"] .vtl-cursor');
   const dur=Number(d[side].duration)||1;
   const sync=()=>{if(cur)cur.style.top=Math.max(0,Math.min(100,((v.currentTime||0)/dur)*100))+'%';};
   v.addEventListener('timeupdate',sync);v.addEventListener('seeked',sync);sync();
  });
  paint();
 }
 both.addEventListener('click',async()=>{if(videos.some(v=>!v.paused&&!v.ended)){videos.forEach(v=>v.pause());return;}pauseOthers();for(const v of videos)if(v.ended)v.currentTime=0;const results=await Promise.allSettled(videos.map(v=>v.play()));results.forEach((result,i)=>{if(result.status==='rejected')container.querySelectorAll('.grasp-status')[i].textContent='Press play again after the recording loads.';});updateBoth();});
 document.querySelectorAll('[data-row]').forEach(r=>r.classList.toggle('selected',r.dataset.row===taskKey));
 return {root:container,seekers};
}
document.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-pick]');renderGrasp(b.dataset.pick);}));
renderGrasp(GRASPS.defaultTask);
function trailMarkup(points,viewBox,key) {
 return `<svg class="trail" viewBox="${viewBox}" preserveAspectRatio="none" aria-label="Observed sponge edge trail"><defs><linearGradient id="gradient-${key}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#97d9ed" stop-opacity=".35"/><stop offset="1" stop-color="#2cf5b1"/></linearGradient></defs><g class="trail-lines"></g><circle class="trail-dot" r="4" fill="#36f5b3" stroke="#173f31" stroke-width="1"/></svg>`;
}
function updateTrail(svg,points,t,isReference=false) {
 let html='';const gap=isReference?1.5:.8;
 for(let i=1;i<points.length;i++) {const a=points[i-1],b=points[i];if(b[0]-a[0]>gap)continue;const past=b[0]<=t;const alpha=past?.25+.75*i/points.length:.11;html+=`<line x1="${a[1]}" y1="${a[2]}" x2="${b[1]}" y2="${b[2]}" stroke="${past?'#36efad':'#b4e6d9'}" stroke-opacity="${alpha}" stroke-width="${isReference?.9:3}" stroke-linecap="round"/>`;}
 svg.querySelector('.trail-lines').innerHTML=html;
 const p=points.findLast(x=>x[0]<=t);const dot=svg.querySelector('circle');dot.style.display=p?'':'none';if(p){dot.setAttribute('cx',p[1]);dot.setAttribute('cy',p[2]);dot.setAttribute('r',isReference?1.2:4);}
}
function renderSponge() {
 const container=document.getElementById('context-content');stopInside(container);
 container.innerHTML=`<div class="selector-row"><label class="trail-toggle"><input type="checkbox" checked> Show observed trajectory</label><span>3/3 successes per shape</span></div><div class="towel-pair sponge-pair">${playerMarkup('sponge_square',{demo:true})}${playerMarkup('sponge_triangle',{demo:true})}</div>`;
 ['square','triangle'].forEach(shape=>{
  const key='sponge_'+shape,d=DATA[key],root=container.querySelector('.exhibit[data-case="'+key+'"]');
  root.querySelector('.screen').insertAdjacentHTML('beforeend',trailMarkup(d.trail,'0 0 640 480',shape));
  const trace=root.querySelector('.screen > .trail');
  bindPlayer(root,{initial:d.trailWindow[1],replayStart:d.trailWindow[0],replayEnd:d.trailWindow[1],onTime:t=>updateTrail(trace,d.trail,t)});
  const refVideo=root.querySelector('.input-inset video'),frame=document.createElement('div');
  frame.className='inset-frame';refVideo.parentNode.insertBefore(frame,refVideo);frame.appendChild(refVideo);
  frame.insertAdjacentHTML('beforeend',trailMarkup(d.referenceTrail,'0 0 100 100','ref-'+shape));
  const refTrail=frame.querySelector('.trail');
  const updateReference=()=>updateTrail(refTrail,d.referenceTrail,refVideo.currentTime,true);
  refVideo.addEventListener('timeupdate',updateReference);updateReference();
 });
 const toggle=container.querySelector('.trail-toggle input');
 const apply=()=>container.querySelectorAll('.trail').forEach(t=>t.classList.toggle('is-off',!toggle.checked));
 toggle.addEventListener('change',apply);apply();
}
function renderPair(container, a, b, extra) {
 stopInside(container);
 container.innerHTML=`<div class="towel-pair sort-pair">${playerMarkup(a)}${playerMarkup(b)}</div>`;
 container.querySelectorAll('.exhibit').forEach(root=>{
  const d=DATA[root.dataset.case];bindPlayer(root);
  const list=d.checklist,col=root.querySelector('.screen-column');
  if(list||extra) col.insertAdjacentHTML('beforeend',list
   ?`<div class="plan-block"><h5>PLANNER CHECKLIST · FINAL STATE</h5><ul>${list.map(x=>`<li><b>${esc(x.state||'pass')}</b><span>${esc(x.text||x)}</span></li>`).join('')}</ul></div>`
   :`<div class="plan-block is-empty"><h5>PLANNER CHECKLIST</h5><p>${esc(extra)}</p></div>`);
  if(d.carried) col.insertAdjacentHTML('beforeend',
   `<div class="plan-block"><h5>${esc(d.carried.title)}</h5><ul>${d.carried.items.map(x=>`<li><b>${esc(x.state||'past')}</b><span>${esc(x.text)}</span></li>`).join('')}</ul>`
   +(d.carried.note?`<p class="carried-note">${esc(d.carried.note)}</p>`:'')+`</div>`);
 });
}
function renderSortPair(c){renderPair(c,'sort_memory','sort_experience',
 'No planner in this configuration. The container binding survives only in the conversation window.');}
function renderBreadPair(c){renderPair(c,'bread_early','bread_late','');}
function renderDrawerPair(c){renderPair(c,'drawer_memory','drawer_experience',
 'No planner and no feedback module in this configuration. Nothing reaches the actor but its own conversation window.');}
function renderTowel(){const c=document.getElementById('context-content');stopInside(c);c.innerHTML=`<div class="towel-pair">${playerMarkup('towel_expert',{demo:true})}${playerMarkup('towel_recovery',{demo:true})}</div>`;c.querySelectorAll('.exhibit').forEach(root=>bindPlayer(root));}
document.querySelectorAll('[data-context]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-context]');if(b.dataset.context==='sponge')renderSponge();else if(b.dataset.context==='towel')renderTowel();else renderPlayer(document.getElementById('context-content'),'bbq');}));
document.querySelectorAll('[data-spatial]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-spatial]');renderPlayer(document.getElementById('spatial-content'),b.dataset.spatial);}));
document.querySelectorAll('[data-harness]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-harness]');const c=document.getElementById('harness-content');stopInside(c);if(b.dataset.harness==='bread')renderBreadPair(c);else if(b.dataset.harness==='sort')renderSortPair(c);else renderDrawerPair(c);}));
// Arrow keys work across each tab group without adding more visible controls.
document.querySelectorAll('[role=tablist]').forEach(group=>group.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...group.querySelectorAll('[role=tab]')];let i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].focus();tabs[i].click();}));
window.addEventListener('resize',()=>document.querySelectorAll('.exhibit').forEach(drawConnectors));
renderPlayer(document.getElementById('precision-content'),'tighten_hex_screw');
renderSponge();renderPlayer(document.getElementById('spatial-content'),'reach_plush');renderBreadPair(document.getElementById('harness-content'));



// The source framework is a loop: new observations and accumulated experience
// both return to the context compiler. Animation is opt-in and stops after one pass.
const workflow=document.querySelector('.workflow');
const flowSteps=[
 ['Observe','Current camera views and robot states.'],
 ['Compile, the actor’s context',['System prompt: embodiment, coordinate conventions, station geometry and movement limits.','Task instruction: the task statement.','Memory: the recent interaction history.','Current observation: the images and measured state from step 01.','Feedback: one line from the experience module, when one was prepared for this call.']],
 ['Task planner','Holds the subtask checklist — which steps are passed, which one is in play, and how to carry out that one. Progress is judged from the scene; the proposed method goes to the experience module, not to the actor.'],
 ['Ground','The actor turns its context into one executable tool call, plus a note on what it intended.'],
 ['Act','Guards accept, refuse or interrupt the call.'],
 ['Record','Before, command, outcome and after go into the episode ledger. Three readers take different slices: the actor the recent turns, the planner the latest scene, the experience module the last six interactions.'],
 ['Experience','Reads the ledger, the proposed method and the retained entries; returns a feedback to the actor and may record up to two findings. Entries carry what they do not establish, and what changed alongside.'],
 ['Human feedback','Human notes what they want the actor to do in the next step.'],
];
const flowTransfers={
 context:{target:6,title:'Evidence ↓ · feedback ↑',copy:'The feedback module reads recent interactions, the current subgoal and method, and the bounded experience list. Only its generated advice line returns to actor context. Advice is prepared before a scheduled actor decision (every five calls by default); it can wait up to 12 seconds for a pending method. If preparation fails, or the subgoal changes, the actor proceeds without that advice. The line is cleared on the next decision, not replayed as stale guidance.'},
 method:{target:6,title:'Task planner → Experience · the proposed method',copy:'The planner proposes a method for the current subgoal: what to try, the condition under which it applies and the change it should produce. It is never sent to the actor. The feedback module is its only reader, and checks that condition against the scene before writing the one advice line the actor receives.'},
 result:{target:6,title:'Execution → Experience · the commanded action',copy:'Accepted, refused or interrupted execution is compared with post-action observations. A returned command is not itself proof of a retained grasp, seating or task completion.'},
 evidence:{target:6,title:'Environment → Experience · the measured outcome',copy:'Images and measured changes ground the applicability check. A retained finding records what happened, where it applies, how it can guide a later decision, what it does not establish and which simultaneous changes remain unresolved. Evidence IDs connect the finding back to its source.'}
};
function maintenanceMarkup(){return `<details class="experience-maintenance"><summary>What one retained finding holds <span>5 fields</span></summary><div class="maintenance-grid"><div><dl><dt>Lesson</dt><dd>What was tried or observed, and what came of it.</dd><dt>Applicability</dt><dd>Where it applies, and where it stops applying.</dd><dt>Feedback</dt><dd>Which later decision it can constrain.</dd><dt>Limits and unresolved</dt><dd>What it does not establish, and the changes that happened alongside it and cannot be told apart.</dd><dt>Evidence</dt><dd>The calls or earlier runs the finding was drawn from.</dd></dl></div></div></details>`;}
function renderFlowEvidence(){
 const panel=document.getElementById('workflow-evidence');panel.innerHTML=(flowIndex===6?maintenanceMarkup():'');panel.hidden=!panel.innerHTML;
}
const flowButtons=[...workflow.querySelectorAll('[data-flow]')],flowMap=workflow.querySelector('.workflow-map'),flowSVG=workflow.querySelector('.workflow-links'),flowPlay=document.getElementById('workflow-play');
let flowIndex=0,flowTimer=null,flowTransfer=null;
function drawWorkflow(){
 const r=flowMap.getBoundingClientRect();
 const rect=i=>{const b=workflow.querySelector(`[data-flow="${i}"]`).getBoundingClientRect();return {x:b.left-r.left,y:b.top-r.top,w:b.width,h:b.height};};
 const point=(i,side,offset=0)=>{const b=rect(i);return side==='l'?[b.x,b.y+b.h/2+offset]:side==='r'?[b.x+b.w,b.y+b.h/2+offset]:side==='t'?[b.x+b.w/2+offset,b.y]:[b.x+b.w/2+offset,b.y+b.h];};
 const straight=(a,b)=>`M${a} L${b}`;
 const elbow=(a,b)=>`M${a} H${(a[0]+b[0])/2} V${b[1]} H${b[0]}`;
 const down=(a,b)=>`M${a} V${(a[1]+b[1])/2} H${b[0]} V${b[1]}`;
 const exp=rect(6),ctx=rect(1),task=rect(2),motion=rect(3),act=rect(4),env=rect(5),fb=rect(7);
 let edges=[
  [0,1,elbow(point(0,'r'),point(1,'l'))],
  [1,3,elbow(point(1,'r',-25),point(3,'l'))],
  [1,2,elbow(point(1,'r'),point(2,'l'))],
  [3,4,elbow(point(3,'r'),point(4,'l'))],
  [4,5,straight(point(4,'r'),point(5,'l'))],
  [5,0,`M${point(5,'t')} V18 H${point(0,'t')[0]} V${point(0,'t')[1]}`,true],
  [2,6,straight(point(2,'b'),[task.x+task.w/2,exp.y])],
  [4,6,straight(point(4,'b'),[act.x+act.w/2,exp.y])],
  [5,6,straight(point(5,'b'),[env.x+env.w/2,exp.y])],
  [1,6,straight(point(1,'b',-14),[ctx.x+ctx.w/2-14,exp.y]),true],
  [6,1,straight([ctx.x+ctx.w/2+14,exp.y],point(1,'b',14)),true],
  [7,6,straight(point(7,'r'),[exp.x,fb.y+fb.h/2]),true],
  [7,1,elbow(point(7,'r',-12),point(1,'l',30)),true]
 ];
 if(r.width<720){
  const left=10,right=r.width-10;
  edges=[
   [0,1,down(point(0,'b'),point(1,'t'))],
   [1,3,elbow(point(1,'r',-25),point(3,'l'))],
   [1,2,elbow(point(1,'r',25),point(2,'l'))],
   [3,4,`M${point(3,'r')} H${right-12} V${point(4,'t')[1]-10} H${point(4,'t')[0]} V${point(4,'t')[1]}`],
   [4,5,straight(point(4,'r'),point(5,'l'))],
   [5,0,`M${point(5,'r')} H${right} V12 H${point(0,'t')[0]} V${point(0,'t')[1]}`,true],
   [2,6,straight(point(2,'b'),[task.x+task.w/2,exp.y])],
   [4,6,straight(point(4,'b'),[act.x+act.w/2,exp.y])],
   [5,6,straight(point(5,'b'),[env.x+env.w/2,exp.y])],
   [1,6,`M${point(1,'l',15)} H${left+4} V${exp.y+exp.h/2} H${exp.x}`,true],
   [6,1,`M${exp.x} ${exp.y+exp.h/2+5} H${left} V${ctx.y+ctx.h/2-10} H${ctx.x}`,true],
   [7,6,`M${point(7,'r')} H${right} V${exp.y+exp.h/2} H${exp.x+exp.w}`,true],
   [7,1,down(point(7,'b'),point(1,'t',15)),true]
  ];
 }
 const compact=r.width<720;
  const methodLabel=['method','subtask method',task.x+task.w/2,exp.y-25];
 const labels=compact?
  [methodLabel,['context','Evidence ↓ · Feedback ↑',exp.x+exp.w*.32,exp.y-18],['evidence','Outcome',exp.x+exp.w*.8,exp.y-18]]:
  [methodLabel,['context','Evidence ↓ · Feedback ↑',ctx.x+ctx.w/2,exp.y-25],['result','Action intent',act.x+act.w/2,exp.y-25],['evidence','Outcome',env.x+env.w/2,exp.y-25]];
 for(const [key,label,x,y] of labels){
  let button=flowMap.querySelector(`[data-transfer="${key}"]`);if(!button){button=document.createElement('button');button.className='flow-transfer';button.dataset.transfer=key;button.addEventListener('click',()=>{stopFlow();selectFlow(flowTransfers[key].target,key);});flowMap.append(button);}button.textContent=label;button.style.left=x+'px';button.style.top=y+'px';button.setAttribute('aria-pressed',String(flowTransfer===key));button.setAttribute('aria-label',flowTransfers[key].title);
 }
 flowMap.querySelectorAll('.flow-transfer').forEach(b=>{if(!labels.some(([key])=>key===b.dataset.transfer))b.remove();});
 flowSVG.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
 flowSVG.innerHTML='<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#8eaa98"/></marker></defs>'+edges.map(([from,to,d,loop])=>`<path class="edge ${loop?'loop-edge':''} ${to===flowIndex?'lit':''}" d="${d}" marker-end="url(#flow-arrow)"/>`).join('');
}
function selectFlow(index,transfer=null){
 flowTransfer=transfer;flowIndex=index;flowButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.flow)===index)));
 document.getElementById('workflow-count').textContent=index===7?'OPTIONAL':`${String(index+1).padStart(2,'0')} / 07`;
 document.getElementById('workflow-title').textContent=transfer?flowTransfers[transfer].title:flowSteps[index][0];{const copy=transfer?flowTransfers[transfer].copy:flowSteps[index][1];document.getElementById('workflow-copy').innerHTML=Array.isArray(copy)?copy.map(esc).join('<br>'):esc(copy);}renderFlowEvidence();drawWorkflow();
}
function stopFlow(){clearInterval(flowTimer);flowTimer=null;workflow.classList.remove('playing');flowPlay.setAttribute('aria-pressed','false');flowPlay.setAttribute('aria-label','Animate workflow');flowPlay.innerHTML='Play the loop <span>↻</span>';}
flowButtons.forEach(b=>b.addEventListener('click',()=>{stopFlow();selectFlow(Number(b.dataset.flow));}));
document.getElementById('workflow-next').addEventListener('click',()=>{stopFlow();selectFlow((flowIndex+1)%7);});
flowPlay.addEventListener('click',()=>{
 if(flowTimer){stopFlow();return;}selectFlow(0);workflow.classList.add('playing');flowPlay.setAttribute('aria-pressed','true');flowPlay.setAttribute('aria-label','Pause workflow animation');flowPlay.textContent='Pause Ⅱ';
 flowTimer=setInterval(()=>{if(flowIndex===6){selectFlow(0);stopFlow();}else selectFlow(flowIndex+1);},2600);
});
workflow.addEventListener('keydown',e=>{if(e.key==='Escape')stopFlow();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFlow();});
new ResizeObserver(drawWorkflow).observe(flowMap);selectFlow(6);

// Model comparison reads the same file as the task table below, so the two always agree.
(() => {
 const TASKS=[['pick_cable_tie','Cable tie'],['pick_key','Key'],['pick_hex_key','Hex key']];
 const MODELS=[['astra','Astra','GPT-6'],['opus','Opus','Claude 5.5'],['sol','Sol','GPT-5.6']];
 const host=document.getElementById('model-results');
 if(!host) return;
 const scored=r=>r&&['reported','annotated'].includes(r.status)&&Number.isInteger(r.successes)&&Number.isInteger(r.trials)&&r.trials>0;
 fetch('benchmark-results.json',{cache:'no-store'}).then(r=>r.json()).then(data=>{
  const byId=Object.fromEntries(data.tasks.map(t=>[t.id,t]));
  const get=(taskId,model,hist)=>{
   const t=byId[taskId]; if(!t) return null;
   const r=t.results[model+(hist?'_memory':'_vanilla')];
   return scored(r)?r:null;
  };
  const cell=(taskId,model,hist)=>{
   const rs=taskId==='total'?TASKS.map(([id])=>get(id,model,hist)).filter(Boolean):[get(taskId,model,hist)].filter(Boolean);
   if(!rs.length) return '<span class="missing" aria-label="No supplied episodes">&mdash;</span>';
   return rs.reduce((s,r)=>s+r.successes,0)+'/'+rs.reduce((s,r)=>s+r.trials,0);
  };
  const row=(taskId,label,total)=>`<tr${total?' class="model-total"':''}><th scope="row">${esc(label)}</th>`+
   MODELS.map(([m])=>`<td><span>${cell(taskId,m,false)}</span><span class="comparison-arrow">\u2192</span><strong>${cell(taskId,m,true)}</strong></td>`).join('')+'</tr>';
  host.innerHTML=`<table><thead><tr><th scope="col">Task</th>`+
   MODELS.map(([,l,v])=>`<th scope="col">${esc(l)}<small>${esc(v)}</small></th>`).join('')+
   `</tr></thead><tbody>`+TASKS.map(([id,l])=>row(id,l,false)).join('')+
   row('total','All three tasks',true)+`</tbody></table>`;
 }).catch(e=>{host.innerHTML='<p class="error-message">Comparison could not be loaded: '+esc(e.message)+'</p>';});
})();


// Native anchors remain usable without JS; scroll tracking adds location feedback.
(() => {
 const header=document.querySelector('.masthead');
 const nav=header.querySelector('nav');
 const entries=[...nav.querySelectorAll('a[href^="#"]')].map(link=>({link,target:document.getElementById(link.hash.slice(1))})).filter(entry=>entry.target);
 let offset=96,scheduled=false,current=null;
 function update(){
  scheduled=false;
  let active=null;
  for(const entry of entries){if(entry.target.getBoundingClientRect().top<=offset+12)active=entry;}
  if(active===current)return;
  current=active;
  for(const entry of entries){
   if(entry===active)entry.link.setAttribute('aria-current','location');
   else entry.link.removeAttribute('aria-current');
  }
  if(active){
   const linkRect=active.link.getBoundingClientRect(),navRect=nav.getBoundingClientRect();
   if(linkRect.left<navRect.left||linkRect.right>navRect.right)nav.scrollTo({left:nav.scrollLeft+linkRect.left-navRect.left-(nav.clientWidth-linkRect.width)/2,behavior:'instant'});
  }
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 function measure(){offset=header.offsetHeight+parseFloat(getComputedStyle(header).top)+18;document.documentElement.style.setProperty('--section-offset',`${offset}px`);schedule();}
 new ResizeObserver(measure).observe(header);
 window.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',measure,{passive:true});
 window.addEventListener('load',measure);
 window.addEventListener('hashchange',schedule);
 measure();
})();

;(() => {
  const masthead = document.querySelector('.masthead');
  const panel = document.getElementById('nav-subnav');
  const parent = document.getElementById('nav-parent');
  if (!masthead || !panel || !parent) return;
  const nav = masthead.querySelector('nav');
  const links = [...panel.querySelectorAll('a[href^="#"]')]
    .map(link => ({ link, target: document.getElementById(link.hash.slice(1)) }))
    .filter(e => e.target);
  if (!links.length) return;

  let open = false, closeTimer = null;

  function place() {
    const l = parent.getBoundingClientRect(), m = masthead.getBoundingClientRect();
    const pad = 8;
    let left = l.left - m.left;
    const maxLeft = m.width - panel.offsetWidth - pad;
    panel.style.left = Math.max(pad, Math.min(left, Math.max(pad, maxLeft))) + 'px';
  }
  function setOpen(next) {
    if (next === open) return;
    open = next;
    panel.classList.toggle('is-open', open);
    panel.hidden = !open;
    parent.setAttribute('aria-expanded', String(open));
    if (open) { mark(); place(); }
  }
  const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer = setTimeout(() => setOpen(false), 180); };

  let current = null;
  function mark() {
    const offset = 96;
    let active = null;
    for (const e of links) if (e.target.getBoundingClientRect().top <= offset + 12) active = e;
    if (active === current) return;
    current = active;
    for (const e of links) {
      if (e === active) e.link.setAttribute('aria-current', 'location');
      else e.link.removeAttribute('aria-current');
    }
  }

  parent.addEventListener('mouseenter', () => { cancelClose(); setOpen(true); });
  parent.addEventListener('mouseleave', scheduleClose);
  panel.addEventListener('mouseenter', cancelClose);
  panel.addEventListener('mouseleave', scheduleClose);
  parent.addEventListener('focus', () => { cancelClose(); setOpen(true); });
  parent.addEventListener('click', () => { cancelClose(); setOpen(!open); });
  panel.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('pointerdown', e => {
    if (open && !panel.contains(e.target) && !parent.contains(e.target)) setOpen(false);
  });
  if (nav) nav.addEventListener('scroll', () => { if (open) place(); }, { passive: true });
  addEventListener('scroll', () => { if (open) { place(); mark(); } }, { passive: true });
  addEventListener('resize', () => { if (open) place(); });
})();
