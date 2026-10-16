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
 const mode=key==='reach_plush'?'plush':key==='bread'?'wide':key==='stand_bottle'?'bottle':key==='hex'?'hex':key==='tighten_hex_screw'?'wrench':'';
 const trace=d.trace?`<details class="full-trace"><summary>${esc(d.traceLabel||'Full recorded trace')}</summary><p>Verbatim recorded notes. Click a timestamp to inspect the corresponding observation.</p><ol>${d.trace.map(n=>`<li><button class="trace-seek" data-time="${n.t}">${esc(n.call)} · ${clock(n.t)}</button><span>${esc(n.text)}</span></li>`).join('')}</ol></details>`:'';
 return `<article class="exhibit" data-case="${key}" id="${id}" ${d.trace?'data-detailed="true"':''}><div class="exhibit-title"><h3>${esc(d.title)}</h3><p>${esc(d.subtitle)}</p><span class="result ${(['hex','towel_expert'].includes(key)||d.outcomeStatus==='unconfirmed')?'failure':''}">${esc(d.result)}</span></div>${d.reportedResult?`<div class="case-summary"><strong>${esc(d.reportedResult)}</strong><p>${esc(d.reportedNote)}</p></div>`:''}${d.keyInsight?`<button class="key-insight" data-key-call="${esc(d.keyCall)}"><small>KEY DECISION · ${esc(d.keyCall)}</small><strong>${esc(d.keyInsight)}</strong><span>Inspect the turning point →</span></button>`:''}<div class="exhibit-body"><div class="screen-column"><div class="screen ${mode}"><video class="main-video" controls playsinline preload="metadata" poster="assets/${esc(d.poster||`poster-${key}.jpg`)}" src="assets/${esc(d.src)}"></video><span class="screen-label">${esc(d.screenLabel||(key==='bread'?'COMPILED · VARIABLE SPEED':key==='hex'?'TOP / RIGHT WRIST':'RECORDED EXECUTION'))}</span><div class="overlay-caption" aria-live="off"></div>${options.demo?`<div class="input-inset"><span>Demonstration · sampled frames</span><video class="demo-video" controls playsinline preload="metadata" src="assets/${esc(d.demo)}"></video></div>`:''}</div><div class="transport"><button class="play icon-button" aria-label="Play ${esc(d.title)}">▶</button><input class="scrub" aria-label="${esc(d.title)} timeline" type="range" min="0" max="${d.duration}" value="0" step="0.05"><output>0:00 / ${clock(d.duration)}</output><select aria-label="${esc(d.title)} playback speed">${d.timeScale?`<option value="${1/d.timeScale}">1× recorded</option><option value="${2/d.timeScale}">2× recorded</option><option value="1" selected>${d.timeScale}× recorded</option>`:'<option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option>'}</select><button class="expand" aria-label="Fullscreen ${esc(d.title)}">⛶</button></div><div class="seek-status" role="status"></div>${d.trace||d.nodes.some(n=>n.evidence)?'<div class="reasoning-panel" aria-live="polite"></div>':''}</div><aside class="decision-rail"><div class="rail-title"><span>DECISION PATH</span><span>Click to inspect ↓</span></div><div class="path"><svg class="path-lines" aria-hidden="true"></svg>${nodeMarkup(d)}</div><div class="action-note"></div></aside></div><div class="exhibit-foot"><details><summary>Evidence note${options.demo?' · demonstration replay is sampled':''}</summary><p>${esc(d.caveat)}</p></details>${trace}</div></article>`;
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
   if(panel)panel.innerHTML=n?.evidence?evidenceMarkup(n.evidence):d.trace&&n?`<div class="reasoning-heading"><span>${esc(n.call)} · ${clock(n.t)}</span><small>Summary grounded in the recorded notes</small></div><dl><div><dt>Inspection</dt><dd>${esc(n.inspection||n.note)}</dd></div><div class="${n.featured?'turning-point':''}"><dt>Decision</dt><dd>${n.featured?'<strong>':''}${esc(n.decision||'')}${n.featured?'</strong>':''}</dd></div><div><dt>Verification</dt><dd>${esc(n.verification||'')}</dd></div></dl><details class="stage-quotes" ${n.featured||n.call==='C9'?'open':''}><summary>Recorded notes · ${esc(n.trace?.[0]?.call||n.call)}${n.trace?.length>1?'–'+esc(n.trace.at(-1).call):''}</summary>${(n.trace||[]).map(q=>`<blockquote><span>${esc(q.call)}</span> ${esc(q.text)}</blockquote>`).join('')}</details>`:'';
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
function renderGrasp(taskKey){
 const d=GRASPS.tasks[taskKey],container=document.getElementById('grasp-compare'),seekers={};stopInside(container);
 container.innerHTML=`<div class="grasp-pair">${['baseline','history'].map(condition=>{const c=d[condition],label=condition==='baseline'?'Without memory':'With memory';return `<article class="grasp-condition" data-condition="${condition}"><div class="film-label ${condition==='history'?'accent':''}">${label}<span>top + ${esc(c.wrist)} wrist</span></div><video playsinline preload="metadata" controls src="${esc(c.src)}"></video><div class="grasp-controls"><button class="grasp-play icon-button" aria-label="Play ${esc(d.title)} ${label.toLowerCase()}">▶</button><input type="range" aria-label="${esc(d.title)} ${label.toLowerCase()} timeline" min="0" max="${c.duration}" value="0" step="0.05"><output>0:00 / ${clock(c.duration)}</output></div><div class="grasp-milestones">${c.milestones.map(n=>`<button data-time="${n.t}"><small>${clock(n.t)}</small>${esc(n.label)}</button>`).join('')}</div><div class="grasp-evidence" aria-live="polite"><strong>Inspect the sequence</strong><p>${esc(c.outcome)}</p></div><div class="grasp-status" role="status"></div></article>`;}).join('')}</div><div class="grasp-shared"><button id="pair-play" aria-label="Play both grasp recordings">Play both ▶</button><span>1× recorded time · independent timelines</span></div><p class="grasp-mechanism">${esc(d.mechanism)}</p><p class="caption">${esc(d.note)} “Memory” here is raw interaction history.</p>`;
 const both=container.querySelector('#pair-play'),videos=[...container.querySelectorAll('video')];
 function updateBoth(){const playing=videos.some(v=>!v.paused&&!v.ended);both.textContent=playing?'Pause both Ⅱ':'Play both ▶';both.setAttribute('aria-label',playing?'Pause both grasp recordings':'Play both grasp recordings');}
 container.querySelectorAll('.grasp-condition').forEach(root=>{
  const c=d[root.dataset.condition],v=root.querySelector('video'),slider=root.querySelector('input'),out=root.querySelector('output'),play=root.querySelector('.grasp-play'),status=root.querySelector('.grasp-status'),label=root.dataset.condition==='baseline'?'without memory':'with memory';let pending=null,lastEvidence=-2;
  v.controls=false;
  function update(){slider.value=pending??v.currentTime;out.textContent=`${clock(pending??v.currentTime)} / ${clock(v.duration||c.duration)}`;let idx=c.milestones.findLastIndex(n=>(pending??v.currentTime)+.15>=n.t);if(idx!==lastEvidence){lastEvidence=idx;const n=c.milestones[idx];root.querySelector('.grasp-evidence').innerHTML=`<strong>${n?`C${n.call} · ${esc(n.evidenceLabel)}`:'Inspect the sequence'}</strong><p>${esc(n?.evidence||c.outcome)}</p>`;}root.querySelectorAll('[data-time]').forEach((b,i)=>b.classList.toggle('current',i===idx));play.textContent=v.paused?'▶':'Ⅱ';play.setAttribute('aria-label',`${v.paused?'Play':'Pause'} ${d.title} ${label}`);updateBoth();}
  function seek(t){v.pause();pending=Math.min(Math.max(0,Number(t)),(v.duration||c.duration)-.05);status.textContent='Seeking…';if(v.readyState>=1)seekMedia(v,pending);update();}
  v.addEventListener('loadedmetadata',()=>{slider.max=v.duration;if(pending!==null)seekMedia(v,pending);update();});v.addEventListener('seekloading',()=>{status.textContent='Loading recording for seeking…';});v.addEventListener('seekerror',()=>{pending=null;status.textContent='Recording could not load for seeking. Select a timestamp to retry.';});v.addEventListener('seeked',()=>{pending=null;status.textContent='';update();});['timeupdate','play','pause','ended'].forEach(event=>v.addEventListener(event,update));v.addEventListener('error',()=>status.textContent='Recording could not load. Reload this comparison to retry.');
  seekers[root.dataset.condition]=seek;
  slider.addEventListener('input',()=>seek(slider.value));root.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>seek(b.dataset.time)));
  play.addEventListener('click',()=>{if(!v.paused){v.pause();return;}pauseOthers(v);if(v.ended)v.currentTime=0;v.play().catch(()=>status.textContent='Press play again after the recording loads.');});v.addEventListener('click',()=>play.click());
 });
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
function renderSponge(shape='square') {
 const container=document.getElementById('context-content');stopInside(container);const key='sponge_'+shape,d=DATA[key];
 container.innerHTML=`<div class="selector-row"><button data-shape="square" aria-pressed="${shape==='square'}">Square</button><button data-shape="triangle" aria-pressed="${shape==='triangle'}">Triangle</button><span>3/3 annotated successes per shape</span></div>${playerMarkup(key)}`;
 const root=container.querySelector('.exhibit');root.querySelector('.exhibit-body').classList.add('sponge-body');
 root.querySelector('.screen').insertAdjacentHTML('beforeend',trailMarkup(d.trail,'0 0 640 480',shape));
 const rail=root.querySelector('.decision-rail');rail.outerHTML=`<aside class="sponge-aside"><h4>REFERENCE · SAMPLED INPUT</h4><div class="reference"><div class="reference-frame"><video class="demo-video" controls playsinline preload="metadata" src="assets/${d.demo}"></video>${trailMarkup(d.referenceTrail,'0 0 100 100','ref-'+shape)}</div></div><button class="demo-button">Replay reference samples ↻</button><div class="trail-legend"><span>earlier</span><span class="gradient-line"></span><span>later</span></div><p>Execution and input share a path shape.<br>Each trail stays in its own camera view.</p><label class="trail-toggle"><input type="checkbox" checked> Show trajectories</label><p>Visible sponge edge · gaps = occlusion</p></aside>`;
 const trace=root.querySelector('.screen .trail'),reference=root.querySelector('.reference video'),refTrail=root.querySelector('.reference .trail');
 bindPlayer(root,{initial:d.trailWindow[1],replayStart:d.trailWindow[0],replayEnd:d.trailWindow[1],onTime:t=>updateTrail(trace,d.trail,t)});
 function updateReference(){updateTrail(refTrail,d.referenceTrail,reference.currentTime,true);}
 reference.addEventListener('timeupdate',updateReference);bindDemo(reference,d.title+' reference',10.5);root.querySelector('.reference').append(root.querySelector('.reference .demo-transport'));updateReference();
 root.querySelector('.demo-button').addEventListener('click',()=>{reference.currentTime=0;reference.play().catch(()=>{});});
 root.querySelector('.trail-toggle input').addEventListener('change',e=>{root.querySelectorAll('.trail').forEach(x=>x.toggleAttribute('hidden',!e.target.checked));});
 container.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>renderSponge(b.dataset.shape)));
}
function renderTowel(){const c=document.getElementById('context-content');stopInside(c);c.innerHTML=`<div class="towel-pair">${playerMarkup('towel_expert',{demo:true})}${playerMarkup('towel_recovery',{demo:true})}</div><p class="caption">Demonstration samples are inset in each execution. Click a decision to inspect that stage; play each input inset independently.</p>`;c.querySelectorAll('.exhibit').forEach(root=>bindPlayer(root));}
document.querySelectorAll('[data-context]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-context]');if(b.dataset.context==='sponge')renderSponge();else if(b.dataset.context==='towel')renderTowel();else renderPlayer(document.getElementById('context-content'),'bbq');}));
document.querySelectorAll('[data-spatial]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-spatial]');renderPlayer(document.getElementById('spatial-content'),b.dataset.spatial);}));
document.querySelectorAll('[data-harness]').forEach(b=>b.addEventListener('click',()=>{setTabs(b,'[data-harness]');const c=document.getElementById('harness-content');stopInside(c);document.querySelector('.bread-metrics').hidden=b.dataset.harness!=='bread';if(b.dataset.harness==='bread')renderPlayer(c,'bread');else c.innerHTML=`<div class="chip-content"><h3>Fracture → smaller closures → retained lift</h3><p>The first chip fractures. On a new chip, the gripper closes incrementally: 0.62 → 0.53 → 0.47.</p><a href="assets/chip-timeline.png" target="_blank"><img class="chip-figure" src="assets/chip-timeline.png" alt="Recorded chip sequence: fracture, target switch, incremental closure and retained lift"></a><details><summary>Evidence note</summary><p>The second chip stays held through the recording end. Agent text logs are absent; no explicit reflection or experience readback is inferred. Openings are normalized targets, not force measurements.</p></details></div>`;}));
// Arrow keys work across each tab group without adding more visible controls.
document.querySelectorAll('[role=tablist]').forEach(group=>group.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...group.querySelectorAll('[role=tab]')];let i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].focus();tabs[i].click();}));
window.addEventListener('resize',()=>document.querySelectorAll('.exhibit').forEach(drawConnectors));
renderPlayer(document.getElementById('precision-content'),'tighten_hex_screw');
renderSponge();renderPlayer(document.getElementById('spatial-content'),'reach_plush');renderPlayer(document.getElementById('harness-content'),'bread');



// The source framework is a loop: new observations and accumulated experience
// both return to the context compiler. Animation is opt-in and stops after one pass.
const workflow=document.querySelector('.workflow');
const flowSteps=[
 ['Observe the physical effect, not just the command.','Camera views and measured robot state close the action loop. Before / action / outcome / after records distinguish the intended motion, an accepted command and the observed physical change.'],
 ['History informs the actor; experience informs advice.','The compiler supplies interaction history, task criteria, current observations, robot conventions and optional feedback. In the current harness path, the full plan, current method and experience list stay outside the actor prompt. They condition a feedback module that supplies one grounded advice line for the next decision.'],
 ['Track the goal. Test the current method.','A joint planner maintains observable subgoals, evidence for passed steps and a current-subgoal cursor. It also proposes a method tied to that subgoal: what to try, its applicability condition and the expected observable change. The cursor can return to an unmet goal; a method is a proposal, never evidence of completion.'],
 ['Turn grounded advice into one tool call.','The actor combines current evidence, history and available feedback with embodiment, coordinate conventions, tool schemas and limits. The plan-to-action arrow denotes advice-mediated guidance, not direct injection of the whole plan. The actor still chooses the executable motion.'],
 ['Keep execution outcome separate from task progress.','Accepted, refused or interrupted commands enter the interaction ledger. After-action images and measured state support progress checks. A premature done call can be rejected when subgoals remain, prompting re-evaluation; the default allows two refusals before permitting termination, so it is not a success oracle.'],
 ['Check whether the method’s condition actually holds.','The feedback module compares the current method with the latest images and six completed interactions. It uses the actor’s same frame, unit and geometry definitions. Its audit records whether the applicability condition holds, what was checked and how prior experience constrains the proposed correction—or does not apply.'],
 ['Preserve a finding. Ground the next correction.','Past-run experience seeds a bounded list. During execution, the feedback module reads that list, recent outcomes and the current method; it can record up to two evidence-backed findings and issue one advice line. New entries preserve scope, counterevidence and unresolved factors. Revisions supersede earlier entries while retaining provenance.'],
 ['Keep human observations distinct from generated advice.','Human feedback reaches the next actor decision and can trigger a plan refresh; it also informs diagnosis. A new human correction invalidates stale decisions. Automatic advice is separately labeled, delivered once and cleared before the next decision; it is a proposed correction, not a measured outcome.']
];
const flowFacts=[
 [['Recorded evidence','Before → action → outcome → after'],['Physical verification','Compare measured effect with intended change']],
 [['Actor input','History + observations + a fresh advice line'],['Feedback-module input','Current subgoal + method + bounded experience']],
 [['Goal state','Passed evidence + a reversible subgoal cursor'],['Method contract','Subgoal ID · proposal · condition · expected change']],
 [['Scaffold','Embodiment, coordinates, tools and limits'],['Guidance path','Plan + experience → checked advice → actor']],
 [['Command outcome','Accepted, refused or interrupted'],['Completion check','Re-evaluate unfinished goals; bounded done gate']],
 [['Diagnostic window','Latest images + six completed interactions'],['Applicability check','Yes / no / cannot tell / no method given']],
 [['Seed once','Consolidate up to 30 prior runs of the same task / station¹'],['Record findings','Up to two per advice call; latest six active entries¹']],
 [['Human channel','Observation / correction, with its own provenance'],['Advice channel','Fresh one-shot guidance; stale guidance is discarded']]
];
const flowTransfers={
 scene:{target:0,title:'Environment → Observation · refresh physical evidence',copy:'New camera views and measured state return after execution. The command result alone does not establish that an object moved, was grasped or stayed supported.'},
 context:{target:6,title:'Evidence ↓ · grounded advice ↑',copy:'The feedback module reads recent interactions, the current subgoal and method, and the bounded experience list. Only its generated advice line returns to actor context. Advice is prepared before a scheduled actor decision (every five calls by default); it can wait up to 12 seconds for a pending method. If preparation fails, or the subgoal changes, the actor proceeds without that advice. The line is cleared on the next decision, not replayed as stale guidance.'},
 plan:{target:2,title:'Task & method plan → action · via grounded advice',copy:'The planner tracks observable goals separately from how to achieve them. A current method names its subgoal, applicability condition and expected change. Feedback checks that condition against the scene before advising the actor. Initialization is synchronous; later plan refreshes run in the background. A method budget triggers re-evaluation, which may change or re-endorse the method. The full plan is logged, not copied into the actor prompt.'},
 intent:{target:6,title:'Motion decision → Experience · intended action and actual outcome',copy:'The last six completed interactions include tool arguments, recorded action notes and measured effects. Actor notes remain self-reports. A useful first discovery, partial success or refused boundary can become experience even before the whole task succeeds.'},
 result:{target:6,title:'Execution → Experience · command outcome',copy:'Accepted, refused or interrupted execution is compared with post-action observations. A returned command is not itself proof of a retained grasp, seating or task completion.'},
 evidence:{target:6,title:'Environment → Experience · check the condition and preserve limits',copy:'Images and measured changes ground the applicability check. A retained finding records what happened, where it applies, how it can guide a later decision, what it does not establish and which simultaneous changes remain unresolved. Evidence IDs connect the finding back to its source.'}
};
function maintenanceMarkup(){return `<details class="experience-maintenance"><summary>Experience template & maintenance rules <span>6 active entries · 5 fields¹</span></summary><div class="maintenance-grid"><div><h4>One retained finding</h4><dl><dt>FOUND · lesson</dt><dd>What was tried or observed, and what came of it.</dd><dt>WHEN · applicability</dt><dd>Where it applies—and where it stops applying.</dd><dt>USE · feedback_use</dt><dd>Which later decision this can constrain.</dd><dt>LIMITS</dt><dd>Counterevidence and what the finding does not establish.</dd><dt>UNRESOLVED</dt><dd>Simultaneous changes whose effects cannot yet be separated.</dd></dl></div><div><h4>Evidence → finding → later advice</h4><p>Feedback may append or revise up to two findings, each with source evidence IDs. Revising creates an immutable entry linked to the one it supersedes; the active list retains the latest six entries. Older records remain in the store.</p><p>Each feedback audit records the method-condition check and how an experience entry applies—or why it does not. A prepared advice line counts as delivered only when present in the actor request.</p><p>Seeding consolidates past runs separately. Seed-only copies are excluded from later run evidence, avoiding repeated copies masquerading as new physical findings.</p></div></div><p class="caption">¹ October 14 implementation defaults: six active entries; seed budget 9,000 characters from up to 30 same-task / station runs. The character budget applies to seeding, not every within-run update. Advice normally runs every five calls over the last six completed interactions; scheduled advice can wait briefly for a method, while later planning runs in the background. Development runs persist findings; evaluation runs do not write them back. Actual run settings may differ.</p></details>`;}
const experienceExamples={
 slip:{label:'Tool slip · C40',when:'After suspected tool slip, the gripper recloses around the tong shafts.',why:'Closure and a static view do not establish secure tool retention.',do:'Make a small verification lift. Check that the tongs move with the gripper; if they slip, reseat the shafts and reclose.',foot:'Recorded lesson, abridged. C40 reports wrist motion while tong tips stayed beside the bread.',call:'C40'},
 release:{label:'Reuse a release · C143 → C169',when:'Bread is over the tray and still held between the tong paddles.',why:'Relaxing the gripper can open the retained tongs enough to release the bread.',do:'Open the right gripper to 0.38, with the left near 0.026. Withdraw and confirm the bread stays on the tray.',foot:'The same release values recur at C169. C144 and C170 check support after withdrawal; this is observed reuse, not a causal comparison.',call:'C169'}
};
let experienceExample='slip';
function exampleMarkup(){const e=experienceExamples[experienceExample];return `<div class="experience-example"><div class="example-title"><span>BREAD · LEGACY EXPERIENCE FORMAT · ABRIDGED</span><div><button data-example="slip" aria-pressed="${experienceExample==='slip'}">Tool slip</button><button data-example="release" aria-pressed="${experienceExample==='release'}">Release reuse</button></div></div><h4>${e.label}</h4><dl><div><dt>WHEN</dt><dd>${e.when}</dd></div><div><dt>WHY <small>hypothesis</small></dt><dd>${e.why}</dd></div><div><dt>DO</dt><dd><strong>${e.do}</strong></dd></div></dl><div class="example-foot"><p>${e.foot}</p><button data-bread-jump="${e.call}">Inspect in the bread recording ↗</button></div></div>`;}
function renderFlowEvidence(){
 const panel=document.getElementById('workflow-evidence');panel.innerHTML=`<div class="flow-facts">${flowFacts[flowIndex].map(([title,copy])=>`<div><small>${esc(title)}</small><span>${esc(copy)}</span></div>`).join('')}</div>`+(flowIndex===6?maintenanceMarkup()+exampleMarkup():'');panel.hidden=false;
 panel.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{experienceExample=b.dataset.example;renderFlowEvidence();}));
 panel.querySelector('[data-bread-jump]')?.addEventListener('click',e=>{const call=e.currentTarget.dataset.breadJump;setTabs(document.querySelector('[data-harness="bread"]'),'[data-harness]');document.querySelector('.bread-metrics').hidden=false;const player=renderPlayer(document.getElementById('harness-content'),'bread');const n=DATA.bread.nodes.find(n=>n.call===call);if(n)player.seek(n.t);player.root.scrollIntoView({behavior:'smooth',block:'start'});});
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
  [1,2,elbow(point(1,'r',-25),point(2,'l'))],
  [1,3,elbow(point(1,'r',25),point(3,'l'))],
  [2,3,straight(point(2,'b'),point(3,'t'))],
  [3,4,elbow(point(3,'r'),point(4,'l'))],
  [4,5,straight(point(4,'r'),point(5,'l'))],
  [5,0,`M${point(5,'t')} V18 H${point(0,'t')[0]} V${point(0,'t')[1]}`,true],
  [3,6,straight(point(3,'b'),[motion.x+motion.w/2,exp.y])],
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
   [1,2,elbow(point(1,'r',-25),point(2,'l'))],
   [1,3,elbow(point(1,'r',25),point(3,'l'))],
   [2,3,straight(point(2,'b'),point(3,'t'))],
   [3,4,down(point(3,'b'),point(4,'t'))],
   [4,5,straight(point(4,'r'),point(5,'l'))],
   [5,0,`M${point(5,'r')} H${right} V12 H${point(0,'t')[0]} V${point(0,'t')[1]}`,true],
   [3,6,`M${point(3,'r')} H${right-5} V${exp.y-12} H${exp.x+exp.w*.7} V${exp.y}`],
   [4,6,straight(point(4,'b'),[act.x+act.w/2,exp.y])],
   [5,6,straight(point(5,'b'),[env.x+env.w/2,exp.y])],
   [1,6,`M${point(1,'l',15)} H${left+4} V${exp.y+exp.h/2} H${exp.x}`,true],
   [6,1,`M${exp.x} ${exp.y+exp.h/2+5} H${left} V${ctx.y+ctx.h/2-10} H${ctx.x}`,true],
   [7,6,`M${point(7,'r')} H${right} V${exp.y+exp.h/2} H${exp.x+exp.w}`,true],
   [7,1,down(point(7,'b'),point(1,'t',15)),true]
  ];
 }
 const compact=r.width<720;
 const planLabel=['plan','via advice',task.x+task.w/2,(task.y+task.h+motion.y)/2];
 const labels=compact?
  [planLabel,['scene','Observe again',r.width*.52,10],['context','Evidence ↓ · Advice ↑',exp.x+exp.w*.32,exp.y-18],['evidence','Scene evidence',exp.x+exp.w*.8,exp.y-18]]:
  [planLabel,['scene','New images + measured state',r.width*.52,18],['context','Evidence ↓ · Advice ↑',ctx.x+ctx.w/2,exp.y-25],['intent','Action intent',motion.x+motion.w/2,exp.y-25],['result','Command outcome',act.x+act.w/2,exp.y-25],['evidence','Scene evidence',env.x+env.w/2,exp.y-25]];
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
 document.getElementById('workflow-title').textContent=transfer?flowTransfers[transfer].title:flowSteps[index][0];document.getElementById('workflow-copy').textContent=transfer?flowTransfers[transfer].copy:flowSteps[index][1];renderFlowEvidence();drawWorkflow();
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

// Include every supplied episode by default; allow demonstration filtering and preserve model versions.
function renderModelComparison(){
 const reported=document.getElementById('model-source').value==='reported';
 const data=reported?GRASPS.reportedModelComparison:GRASPS.modelComparison,demo=document.getElementById('model-demo').value;
 const metricControl=document.getElementById('model-metric');
 if(reported)metricControl.value='success';
 metricControl.disabled=reported;
 const metric=metricControl.value;
 document.getElementById('recovered-sol').hidden=reported;
 document.querySelector('#model-demo option[value=all]').textContent=reported?'All settings':'All episodes';
 document.querySelector('#model-demo option[value=yes]').textContent=reported?'Video':'Configured';
 document.querySelector('#model-demo option[value=no]').textContent=reported?'No video':'None';
 const rows=data.rows.filter(r=>demo==='all'||r.demo===(demo==='yes'));
 function cell(task,model,history){
  const rs=rows.filter(r=>r.model===model&&r.history===history&&(task==='total'||r.task===task));
  const n=rs.reduce((sum,r)=>sum+r.n,0);if(!n)return '<span class="missing" aria-label="No supplied episodes">—</span>';
  if(metric==='success')return `${rs.reduce((sum,r)=>sum+r.successes,0)}/${n}`;
  const value=rs.reduce((sum,r)=>sum+r[metric]*r.n,0)/n;
  return `${value.toFixed(1)}${metric==='elapsed'?' s':''}<small>n=${n}</small>`;
 }
 function row(task,label,total=false){return `<tr${total?' class="model-total"':''}><th scope="row">${esc(label)}</th>${data.models.map(m=>`<td><span>${cell(task,m.id,false)}</span><span class="comparison-arrow">→</span><strong>${cell(task,m.id,true)}</strong></td>`).join('')}</tr>`;}
 document.getElementById('model-results').innerHTML=`<table><thead><tr><th scope="col">Task</th>${data.models.map(m=>`<th scope="col">${esc(m.label)}<small>${esc(m.version)}</small></th>`).join('')}</tr></thead><tbody>${data.tasks.map(t=>row(t.id,t.label)).join('')}</tbody><tfoot>${row('total','All four tasks',true)}</tfoot></table>`;
 document.getElementById('model-sample-count').textContent=`${rows.reduce((s,r)=>s+r.n,0)} ${reported?'reported trials':'logged episodes'} in this view`;
 document.getElementById('model-metric-note').textContent=reported?'Reported successes / trials · September 24–25 study summary (right-hand block). All 16 Sol task × video × history cells contain three trials. Original 0/2 entries for Astra key and Opus hex key are retained. Episode-level reconciliation is pending; these counts are not pooled with the log export.':metric==='success'?'Annotated successes / recorded episodes, including hex-key pickup. Astra without-history key has one unknown outcome retained in the denominator. All episodes pools demonstration settings; use the filter to inspect them separately. Coverage varies across models.':'Means include successful and unsuccessful episodes; fewer calls or less elapsed time can also reflect an early failure. They do not measure time to first successful grasp. Rounded source means are weighted by episode count in the four-task total.';
}
document.getElementById('model-source').addEventListener('change',()=>{document.getElementById('model-demo').value=document.getElementById('model-source').value==='reported'?'no':'all';renderModelComparison();});
['model-demo','model-metric'].forEach(id=>document.getElementById(id).addEventListener('change',renderModelComparison));renderModelComparison();

// Evidence shortcuts reuse the existing players and their recorded clocks.
function openComponentEvidence(component) {
 let player;
 if(component==='memory'){
  setTabs(document.querySelector('[data-pick="ball"]'),'[data-pick]');
  player=renderGrasp('ball');player.seekers.history(83.52);
 }else if(component==='plan'){
  player=renderPlayer(document.getElementById('precision-content'),'tighten_hex_screw');
  player.seek(DATA.tighten_hex_screw.nodes.find(n=>n.call==='C76').t);
 }else{
  setTabs(document.querySelector('[data-harness="bread"]'),'[data-harness]');
  document.querySelector('.bread-metrics').hidden=false;
  player=renderPlayer(document.getElementById('harness-content'),'bread');player.seek(DATA.bread.nodes.find(n=>n.call==='C169').t);
 }
 player.root.scrollIntoView({behavior:'smooth',block:'start'});
 const focus=player.root.querySelector(component==='memory'?'.grasp-condition[data-condition="history"] .grasp-play':'.play');focus?.focus({preventScroll:true});
}
document.querySelectorAll('[data-component]').forEach(b=>b.addEventListener('click',()=>openComponentEvidence(b.dataset.component)));

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
