/* The editable JSON is the only source of benchmark values. */
(function (root) {
  'use strict';
  const isScored = r => r && ['reported', 'annotated'].includes(r.status) && Number.isInteger(r.successes) && Number.isInteger(r.trials) && r.trials > 0;
  function aggregate(data, family, axis, condition, shared = null) {
    const tagged = data.tasks.filter(t => t[family].includes(axis));
    const rows = tagged.filter(t => isScored(t.results[condition]) && (!shared || shared.every(c => isScored(t.results[c]))));
    return {
      value: rows.length ? rows.reduce((s, t) => s + t.results[condition].successes / t.results[condition].trials, 0) / rows.length : null,
      count: rows.length, total: tagged.length,
      trials: rows.reduce((s, t) => s + t.results[condition].trials, 0),
      tasks: rows.map(t => t.id)
    };
  }
  function validate(data) {
    if (data.schema_version !== 1) throw Error('Unsupported benchmark schema');
    const unique = a => new Set(a).size === a.length;
    if (!unique(data.conditions.map(c => c.id)) || !unique(data.tasks.map(t => t.id))) throw Error('Duplicate identifiers');
    const conditionIds = data.conditions.map(c => c.id);
    for (const t of data.tasks) {
      for (const f of ['capabilities', 'objects']) {
        if (!unique(t[f]) || !t[f].every(a => data.axes[f].some(x => x.id === a))) throw Error(`Invalid tags: ${t.id}`);
      }
      if (t.objects.length !== 1) throw Error(`Exactly one object category required: ${t.id}`);
      if (Object.keys(t.results).length !== conditionIds.length) throw Error(`Unexpected conditions: ${t.id}`);
      for (const c of conditionIds) {
        const r = t.results[c];
        if (!r || !['missing', 'pending', 'reported', 'annotated'].includes(r.status)) throw Error(`Invalid status: ${t.id}/${c}`);
        if (r.trials !== null && (!Number.isInteger(r.trials) || r.trials <= 0)) throw Error(`Invalid trials: ${t.id}/${c}`);
        if (r.successes !== null && (!Number.isInteger(r.successes) || r.successes < 0 || r.trials === null || r.successes > r.trials)) throw Error(`Invalid successes: ${t.id}/${c}`);
               if (r.source !== null && !data.sources[r.source]) throw Error(`Unknown source: ${t.id}/${c}`);
        if (['reported', 'annotated'].includes(r.status) && (r.successes === null || r.trials === null || !r.source)) throw Error(`Incomplete scored result: ${t.id}/${c}`);
        if (r.status === 'missing' && r.successes !== null) throw Error(`Missing status contains measurements: ${t.id}/${c}`);
      }
    }
    return data;
  }
  const api = { isScored, aggregate, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.Benchmark = api;
  const host = document.getElementById('benchmark');
  if (!host) return;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const pct = n => `${Math.round(n * 100)}%`;
  const el = (tag, attrs = {}, content = '') => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    node.textContent = content; return node;
  };
  async function init() {
    const response = await fetch('benchmark-results.json', { cache: 'no-store' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const data = validate(await response.json());
    const series = data.conditions.filter(c=>c.visible!==false);
    let active = series.map(c=>c.id);
    let hoverMark = null, pinnedMark = null;
    const marks = new WeakMap();
    let selectedAxis = { family: 'capabilities', id: 'fine' };
    host.innerHTML = `
      <div class="section-heading benchmark-heading"><span class="index">04</span><h2>Results</h2><a href="benchmark-results.json" download>Data ↗</a></div>
      <div class="benchmark-legend" aria-label="Chart series">${series.map(c => `<button type="button" data-series="${escape(c.id)}" aria-pressed="${active.includes(c.id)}" style="--series:${escape(c.color)}"><i></i>${escape(c.label)}</button>`).join('')}</div>
      <div class="benchmark-controls"><span>Task success · 0–100% · equal task weighting</span></div>
      <div id="benchmark-tooltip" class="benchmark-tooltip" role="status" hidden></div>
      <div class="benchmark-radars"><figure><figcaption>By capability <small>A task may appear on several axes</small></figcaption><div id="radar-capabilities"></div></figure><figure><figcaption>By object <small>One primary object category per task</small></figcaption><div id="radar-objects"></div></figure></div>
      <div id="benchmark-axis-detail" class="benchmark-axis-detail" aria-live="polite"></div>
      <div class="benchmark-table-heading"><h4>Results by task</h4><label><span class="sr-only">Search tasks</span><input id="benchmark-search" type="search" placeholder="Find a task…"></label></div>
      <div class="benchmark-legend benchmark-results-legend" aria-label="Results series">${series.map(c => `<button type="button" data-series="${escape(c.id)}" aria-pressed="${active.includes(c.id)}" style="--series:${escape(c.color)}"><i></i>${escape(c.label)}</button>`).join('')}</div>
      <div class="benchmark-bars-axis" aria-hidden="true"><span>Task</span><div><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><span id="benchmark-bars-measure">Success / trials</span></div>
      <div id="benchmark-bars" class="benchmark-bars" aria-label="Task performance" aria-live="polite"></div>
      <details class="benchmark-raw"><summary>View the results table</summary>
      <div class="benchmark-table-scroll" tabindex="0" role="region" aria-label="Complete experimental results; scroll horizontally for all models"><table class="benchmark-table"><caption id="benchmark-count"></caption><thead><tr><th rowspan="2" scope="col">Task</th>${[...new Set(series.map(c=>c.label.split(' · ')[0]))].map(model=>`<th colspan="${series.filter(c=>c.label.split(' · ')[0]===model).length}" scope="colgroup">${escape(model)}</th>`).join('')}</tr><tr>${series.map(c=>`<th scope="col">${escape(c.label.split(' · ')[1])}</th>`).join('')}</tr></thead><tbody id="benchmark-rows"></tbody></table></div></details>`;
    const getStats = (f, a, c) => aggregate(data, f, a, c, null);
    const tooltip = host.querySelector('#benchmark-tooltip');
    function highlightInfo(info) {
      const condition=series.find(s=>s.id===info.series);
      if(info.task) {
        const task=data.tasks.find(t=>t.id===info.task), r=task.results[info.series];
                const text=`${r.successes}/${r.trials} successful trials · ${pct(r.successes/r.trials)}`;
        return `<strong>${escape(condition.label)}</strong><span>${escape(task.label)}</span><b>${text}</b>${r.status==='pending'?'<small>Awaiting confirmation †</small>':''}`;
      }
      const axes=data.axes[info.family].filter(a=>!info.axis||a.id===info.axis);
      return `<strong>${escape(condition.label)}</strong>${axes.map(a=>{
        const v=getStats(info.family,a.id,info.series);
        return `<div><span>${escape(a.label)}</span><b>${v.value===null?'—':pct(v.value)}</b><small>${v.count}/${v.total} tasks · ${v.trials} trials</small></div>`;
      }).join('')}`;
    }
    function updateHighlight() {
      const target=hoverMark||pinnedMark, info=target&&marks.get(target);
      host.querySelectorAll('[data-highlight-series]').forEach(node=>{
        const match=!!info&&node.dataset.highlightSeries===info.series;
        node.classList.toggle('is-highlighted',match);
        node.classList.toggle('is-dimmed',!!info&&!match);
        node.classList.toggle('is-picked',node===pinnedMark);
        if(node.getAttribute('role')==='button')node.setAttribute('aria-pressed',node===pinnedMark?'true':'false');
      });
      if(!info||!target.isConnected||info.legend){tooltip.hidden=true;return;}
      tooltip.innerHTML=highlightInfo(info);tooltip.hidden=false;
      const box=target.getBoundingClientRect();
      tooltip.style.left=Math.max(8,Math.min(box.right+10,window.innerWidth-tooltip.offsetWidth-10))+'px';
      tooltip.style.top=Math.max(8,Math.min(box.top,window.innerHeight-tooltip.offsetHeight-10))+'px';
    }
    function clearHighlight() {hoverMark=null;pinnedMark=null;updateHighlight();}
    function bindMark(node,info) {
      marks.set(node,info);node.dataset.highlightSeries=info.series;
      node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-pressed','false');
      node.addEventListener('pointerenter',()=>{hoverMark=node;updateHighlight();});
      node.addEventListener('pointerleave',e=>{
        hoverMark=e.relatedTarget instanceof Element?e.relatedTarget.closest('[data-highlight-series]'):null;
        if(hoverMark&&!marks.has(hoverMark))hoverMark=null;
        updateHighlight();
      });
      node.addEventListener('focus',()=>{hoverMark=node;updateHighlight();});
      node.addEventListener('blur',()=>{if(hoverMark===node)hoverMark=null;updateHighlight();});
      const toggle=e=>{e.stopPropagation();pinnedMark=pinnedMark===node?null:node;hoverMark=null;updateHighlight();};
      node.addEventListener('click',toggle);
      node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(e);}});
    }
    host.addEventListener('keydown',e=>{if(e.key==='Escape'){clearHighlight();}});
    document.addEventListener('pointerdown',e=>{if(!marks.has(e.target.closest('[data-highlight-series]')))clearHighlight();});
    window.addEventListener('scroll',()=>{tooltip.hidden=true;}, {passive:true});
    function drawRadar(family) {
      const axes = data.axes[family], n = axes.length;
      const svg = el('svg', {viewBox:'0 0 520 380', role:'group', 'aria-label':`${family === 'objects' ? 'Object' : 'Capability'} radar. Focus an axis to inspect values.`});
      const cx=260, cy=188, radius=123;
      const point = (i, r) => [cx + Math.sin(i*2*Math.PI/n)*r, cy - Math.cos(i*2*Math.PI/n)*r];
      for (const level of [.25,.5,.75,1]) {
        svg.append(el('polygon',{points:axes.map((_,i)=>point(i,radius*level).join(',')).join(' '),fill:'none',stroke:'#d8ddd4','stroke-width':1}));
        svg.append(el('text',{x:cx+5,y:cy-radius*level+12,class:'radar-scale'},pct(level)));
      }
      axes.forEach((_,i)=>{const p=point(i,radius);svg.append(el('line',{x1:cx,y1:cy,x2:p[0],y2:p[1],stroke:'#d8ddd4'}));});
      active.forEach(c => {
        const values = axes.map(a=>getStats(family,a.id,c));
        const color = series.find(s=>s.id===c).color;
        const group=el('g',{class:'radar-series','aria-label':`${series.find(s=>s.id===c).label} · ${family} contour`});
        bindMark(group,{series:c,family});
        svg.append(group);
        // Fill only between adjacent observed axes; never close across a missing axis.
        values.forEach((v,i)=>{
          const next=values[(i+1)%n];
          if(v.value===null || next.value===null)return;
          group.append(el('polygon',{points:[[cx,cy],point(i,v.value*radius),point((i+1)%n,next.value*radius)].map(p=>p.join(',')).join(' '),fill:color,'fill-opacity':.18,stroke:'none',class:'radar-area','aria-hidden':'true'}));
        });
        values.forEach((v,i)=>{
          if(v.value===null)return;
          const p=point(i,v.value*radius), next=values[(i+1)%n];
          if(next.value!==null){const q=point((i+1)%n,next.value*radius);group.append(el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:color,'stroke-width':2,'stroke-dasharray':c.includes('vanilla')?'4 3':'none',class:'radar-outline'}));group.append(el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'transparent','stroke-width':12,class:'radar-hit'}));}
          const dot=el('circle',{cx:p[0],cy:p[1],r:3.5,fill:color,stroke:'var(--paper)','stroke-width':1});
          dot.setAttribute('aria-label',`${series.find(s=>s.id===c).label} · ${axes[i].label}: ${pct(v.value)} · ${v.count}/${v.total} tasks · ${v.trials} trials`);
          dot.classList.add('radar-point');bindMark(dot,{series:c,family,axis:axes[i].id});group.append(dot);
        });
      });
      axes.forEach((a,i)=>{
        const p=point(i,radius+32), words=a.label.split(' '), lines=a.label_lines || (words.length>1?[words.slice(0,-1).join(' '),words.at(-1)]:words);
        const g=el('g',{tabindex:0,role:'button','aria-label':`Inspect ${a.label}`,'aria-pressed':selectedAxis.family===family&&selectedAxis.id===a.id,class:'radar-axis'});
        g.append(el('rect',{x:p[0]-64,y:p[1]-20,width:128,height:42,rx:3,fill:'transparent'}));
        lines.forEach((line,j)=>g.append(el('text',{x:p[0],y:p[1]-4+(j*14),'text-anchor':'middle'},line)));
        const select=()=>{selectedAxis={family,id:a.id};drawDetails();host.querySelectorAll('.radar-axis').forEach(x=>x.setAttribute('aria-pressed',x===g?'true':'false'));};
        g.addEventListener('click',select);g.addEventListener('focus',select);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});svg.append(g);
      });
      host.querySelector(`#radar-${family}`).replaceChildren(svg);
    }
    function drawDetails() {
      const a = data.axes[selectedAxis.family].find(x=>x.id===selectedAxis.id);
      host.querySelector('#benchmark-axis-detail').innerHTML = `<strong>${escape(a.label)}</strong><span class="benchmark-axis-hint">Select an axis for coverage</span><div>${active.map(c=>{
        const s=series.find(x=>x.id===c), v=getStats(selectedAxis.family,a.id,c);
        const names=v.tasks.map(id=>data.tasks.find(t=>t.id===id).label).join(', ');
        return `<p data-highlight-series="${escape(c)}" style="--series:${escape(s.color)}"><span>${escape(s.label)}</span><b>${v.value===null?'—':pct(v.value)}</b><small>${v.count}/${v.total} tasks · ${v.trials} trials</small><span class="axis-task-list">${escape(names || 'No scored tasks')}</span></p>`;
      }).join('')}</div>`;
    }
    function drawCharts() {
      drawRadar('capabilities');drawRadar('objects');drawDetails();
    }
    function taskLabels(t) {
      const object=data.axes.objects.find(a=>a.id===t.objects[0]);
      const capabilities=t.capabilities.map(a=>escape(data.axes.capabilities.find(x=>x.id===a).label)).join(' · ');
      return `${capabilities?`<small>${capabilities}</small>`:''}<small class="benchmark-object" title="${escape(object.description||'Primary interaction object')}">Object: ${escape(object.label)}</small>`;
    }
    function drawTable() {
      const query=host.querySelector('#benchmark-search').value.trim().toLowerCase();
      const rows=data.tasks.filter(t=>(t.label+' '+t.id+' '+t.capabilities.concat(t.objects).join(' ')+' '+data.axes.objects.find(a=>a.id===t.objects[0]).label).toLowerCase().includes(query));
            host.querySelector('#benchmark-bars-measure').textContent='Success / trials';
      const barHtml = rows.map(t=>{
        const measured=active.some(c=>t.results[c].successes!==null);
        return `<div class="benchmark-task-bars"><div class="benchmark-task-name"><strong>${escape(t.label)}</strong>${taskLabels(t)}</div><div class="benchmark-task-series">${!measured?'<div class="benchmark-empty-task">'+(active.length?'Results awaiting entry':'Select a series to compare')+'</div>':active.map(c=>{
          const r=t.results[c], condition=series.find(s=>s.id===c);
          const value=r.successes!==null && r.trials!==null?r.successes/r.trials*100:null;
          const label=condition.label.replace(' · ',' ').replace('final harness','final');
          const text=value===null?'':`${r.successes}/${r.trials} <small>${pct(value/100)}</small>`;
          const description=value===null?'Not supplied':`${Math.round(value)} percent${`, ${r.successes} of ${r.trials} trials`}${r.status==='pending'?', awaiting confirmation':''}`;
          return `<div data-task="${escape(t.id)}" data-condition="${escape(c)}" class="benchmark-bar-row ${value===null?'is-missing':''} ${r.status==='pending'?'is-pending':''}" style="--series:${escape(condition.color)}" aria-label="${escape(condition.label+': '+description)}"><span class="benchmark-bar-series">${escape(label)}</span><div class="benchmark-bar-track">${value===null?'':`<span class="benchmark-bar-fill ${value===0?'is-zero':''}" style="width:${value}%"></span>`}</div><span class="benchmark-bar-value">${text}${value!==null&&r.status==='pending'?'<sup>†</sup>':''}</span></div>`;
        }).join('')}</div></div>`;
      }).join('');
      host.querySelector('#benchmark-bars').innerHTML=barHtml||'<p class="benchmark-note">No matching tasks.</p>';
      host.querySelectorAll('.benchmark-bar-row:not(.is-missing)').forEach(node=>bindMark(node,{series:node.dataset.condition,task:node.dataset.task}));
      updateHighlight();
      host.querySelector('#benchmark-count').textContent=`${rows.length} tasks · successful episodes / trials`;
      host.querySelector('#benchmark-rows').innerHTML=rows.length ? rows.map(t=>`<tr><th scope="row" title="${escape(t.note||'')}">${escape(t.label)}${taskLabels(t)}</th>${series.map(c=>{
        const r=t.results[c.id], measured=r.successes!==null&&r.trials!==null;
        if(!measured)return '<td class="benchmark-missing" aria-label="Not supplied"></td>';
        const text=`${r.successes}/${r.trials} <small>${pct(r.successes/r.trials)}</small>`;
        const note=[data.sources[r.source]?.label,r.note].filter(Boolean).join('. ');
        return `<td class="${r.status==='pending'?'benchmark-pending':''}" title="${escape(note)}">${text}${r.status==='pending'?'<sup aria-label="Awaiting confirmation">†</sup>':''}</td>`;
      }).join('')}</tr>`).join(''):`<tr><td colspan="${series.length+1}">No matching tasks.</td></tr>`;
    }
    host.querySelectorAll('[data-series]').forEach(b=>{
      marks.set(b,{series:b.dataset.series,legend:true});
      b.dataset.highlightSeries=b.dataset.series;
      const enter=()=>{if(active.includes(b.dataset.series)){hoverMark=b;updateHighlight();}};
      const leave=()=>{if(hoverMark===b)hoverMark=null;updateHighlight();};
      b.addEventListener('pointerenter',enter);b.addEventListener('pointerleave',leave);
      b.addEventListener('focus',enter);b.addEventListener('blur',leave);
    });
    host.querySelectorAll('[data-series]').forEach(b=>b.addEventListener('click',()=>{
      clearHighlight();
      const id=b.dataset.series;
      if(active.includes(id))active=active.filter(x=>x!==id);else active=series.map(x=>x.id).filter(x=>active.includes(x)||x===id);
      host.querySelectorAll('[data-series]').forEach(button=>button.setAttribute('aria-pressed',active.includes(button.dataset.series)));drawCharts();drawTable();
      if(active.includes(id)){hoverMark=b;updateHighlight();}
    }));
    host.querySelector('#benchmark-search').addEventListener('input',()=>{clearHighlight();drawTable();});
    drawCharts();drawTable();
  }
  init().catch(error => {
    host.innerHTML = root.location.protocol === 'file:'
      ? '<p class="error-message">This page was opened as a local file. Your browser blocks automatic JSON loading. Double-click <code>start.command</code> in this folder to open the local preview.</p>'
      : `<p class="error-message">Results could not be loaded: ${escape(error.message)}. Check <a href="benchmark-results.json">benchmark-results.json</a> and reload the page.</p>`;
    console.error('Benchmark:', error);
  });
})(typeof window === 'undefined' ? globalThis : window);
