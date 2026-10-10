(function () {
'use strict';
let model=null,tab='script',selected=null;const root=document.getElementById('uccx-viewer');if(!root)return;const $=id=>document.getElementById('uccx-'+id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pagePositionDepth=0,pageRestoreFrame=null,pageScrollIntent=0;
// Honor deliberate scrolling while avoiding anchoring/focus jumps from DOM updates.
document.addEventListener('wheel',()=>{pageScrollIntent++;},{passive:true,capture:true});
document.addEventListener('touchmove',()=>{pageScrollIntent++;},{passive:true,capture:true});
document.addEventListener('keydown',event=>{if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))pageScrollIntent++;},true);
function preservePagePosition(update){
 if(pagePositionDepth)return update();
 const left=window.scrollX||0,top=window.scrollY||0,intent=pageScrollIntent;
 const restore=()=>{if(pageScrollIntent===intent&&((window.scrollX||0)!==left||(window.scrollY||0)!==top))window.scrollTo?.({left,top,behavior:'instant'});};
 pagePositionDepth++;
 try{return update();}finally{
  pagePositionDepth--;restore();
  if(window.requestAnimationFrame){
   if(pageRestoreFrame!==null)window.cancelAnimationFrame(pageRestoreFrame);
   pageRestoreFrame=window.requestAnimationFrame(()=>{pageRestoreFrame=null;restore();});
  }
 }
}
const matches=s=>[s.title,s.summary,s.label,s.comment].join(' ').toLowerCase().includes($('search').value.toLowerCase());
function editorSummary(s){
 const v=s.values;
 switch(s.type){
  case 'StepStart':case 'StepEnd':case 'StepComment':case 'DayOfWeekStep':case 'TimeStep':return '';
  case 'StepLabel':return (v[0]||s.label||'')+':';
  case 'StepGoto':return v[0]||'';
  case 'StepCallSubflow':return '('+[v[0],...(s.config.subflow?.outputs||[]).map(p=>p.name)].filter(Boolean).join(', ')+')';
  case 'StepAssign':return v[0]+' = '+v[1];
  case 'StepIf':return '('+v[0]+') Then';
  case 'StepDelay':return v[0]?v[0]+' sec':'';
  case 'AcceptStep':case 'TerminateStep':return v.length?'('+v[0]+')':'';
  case 'OutputStep':return v.length?'('+v.slice(0,2).join(', ')+')':'';
  case 'SelectResourceStep':return v.length>=4?'('+v[0]+' from '+v[3]+')':s.summary;
  case 'RedirectStep':return v.length>=2?'('+v[0]+' to '+v[1]+')':s.summary;
  case 'StepSwitch':return s.config.switch?'('+s.config.switch.expression+')':s.summary;
  case 'SetGED125DataStep':return s.config.enterprise?'('+s.config.enterprise.contact+') Variables Used: '+[...s.config.enterprise.fields,...s.config.enterprise.expanded].map(p=>p.value).join(', '):s.summary;
  case 'HandledSessionStep':return s.config.contactSettings?'('+[s.config.contactSettings.contact,...s.config.contactSettings.attributes.filter(a=>a.value!=='').map(a=>a.name.toLowerCase())].join(', ')+')':s.summary;
  case 'SetPriorityStep':return s.config.priority?'('+s.config.priority.contact+', '+(s.config.priority.operation||'Operation not decoded')+': '+s.config.priority.value+')':s.summary;
  case 'HoldStep':case 'UnholdStep':return v.length?'('+v[0]+')':'';
  default:{const attributes=s.config.contactAttributes?.filter(a=>a.variable&&a.variable!=='null');return attributes?'('+[v[0],...(attributes.length===1?[attributes[0].name]:[])].join(', ')+')':s.summary;}
 }
}
function editorType(v){const type=v.type.split('.').pop();return ({Integer:'int',Boolean:'boolean',Long:'long',Float:'float',Double:'double',Playable:'Prompt'})[type]||type;}
function sortedVariables(rows){return [...rows].sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase())||a.name.localeCompare(b.name));}
function stepHTML(s){
 let decision=['StepIf','StepSwitch','MenuStep','TimeStep','DayOfWeekStep'].includes(s.type),call=['AcceptStep','RedirectStep','CreateCallStep','SelectResourceStep','TerminateStep','OutputStep'].includes(s.type);
 let icon=decision?'◇':s.type==='StepGoto'?'↪':s.type==='StepStart'?'⚑':s.type==='StepEnd'?'■':s.type==='StepAssign'?'=':s.type==='StepLabel'?'⚑':s.type==='StepCallSubflow'?'⇢':call?'☎':'·';
 const cisco=window.UCCXStepIcons?.resolve(s.config.contactSettings?'SetContactInfoStep':s.type,s.className);
 const notes=[s.comment,s.type==='StepComment'?s.values[0]:''].filter(Boolean);
 const annotation=[...new Set(notes)].map(note=>'<span class="step-annotation">'+esc(/^\s*\/\*/.test(note)?note:'/* '+note+' */')+'</span>').join('');
 const summary=s.type==='StepIf'?'('+esc(s.values[0])+') <span class="step-keyword">Then</span>':esc(editorSummary(s));
 const label=s.label&&s.type!=='StepLabel'?'<span class="step-label">'+esc(s.label)+':</span>':'';
 const outputs=(s.config.subflow?.outputs||[]).filter(p=>p.variable&&p.variable!=='null');
 const contactVariables=(s.config.contactAttributes||[]).filter(a=>a.variable&&a.variable!=='null').map(a=>a.variable);
 const contactAssignment=contactVariables.length?'<span class="inline-assignment">'+esc(contactVariables.join(', '))+' =</span>':'';
 const assignment=outputs.length?'<span class="step-assignment">'+outputs.map(p=>esc(p.variable)+' =').join('<br>')+'</span>':'';
 if(s.type==='StepStart')icon='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 15 7 1" fill="none" stroke="#45596b" stroke-width="1.2"/><path d="m7 1 7 3-2 6-7-3Z" fill="#4ddddb" stroke="#087b83" stroke-width=".8"/><path d="m8 2 5 2-1 2-5-2Z" fill="#d7ffff"/></svg>';
 return '<button type="button" class="step'+(selected===s.id?' active':'')+(s.type==='StepLabel'?' label-step':s.type==='StepGoto'?' goto-step':s.type==='StepStart'?' start-step':s.type==='StepComment'?' annotation-step':'')+(simulation?.current===s.id?' running':'')+'" data-step="'+s.id+'" title="'+esc([s.title,s.label,editorSummary(s)].filter(Boolean).join(' — '))+'"><span class="stepicon '+(decision?'decision':call?'call':s.type==='StepLabel'?'label-icon':'')+'"'+(cisco?' data-cisco-icon="'+esc(cisco)+'"':'')+' aria-hidden="true">'+icon+'</span><span class="steptext">'+annotation+label+assignment+'<span class="step-line">'+contactAssignment+'<span class="stepname">'+esc(s.title)+'</span><span class="summary">'+summary+'</span></span></span>'+'</button>';
}
function treeList(nodes){return '<ul class="tree-list">'+nodes.map(n=>'<li class="tree-node">'+treeHTML(n)+'</li>').join('')+'</ul>';}
function branchIcon(){return '<svg class="branch-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m5 1 8 4-5 10-7-4Z" fill="#ffe59b" stroke="#a77813" stroke-width=".8"/><path d="m5 1 1 3 7 1" fill="#fff4cb" stroke="#a77813" stroke-width=".7"/></svg>';}
function treeHTML(n){

 const groups=n.groups.filter(g=>g.name);
 const unnamed=n.groups.filter(g=>!g.name).flatMap(g=>g.nodes);
 let branches=groups.length?'<ul class="tree-list tree-branches">'+groups.map(g=>{
  const label=branchIcon()+'<span>'+esc(g.name)+'</span>';
  return '<li class="tree-node branch-node">'+(g.nodes.length?'<details class="branch" open><summary>'+label+'</summary>'+treeList(g.nodes)+'</details>':'<div class="branch-label">'+label+'</div>')+'</li>';
 }).join('')+'</ul>':'';
 if(n.step&&branches)return '<details class="step-group" data-step-group="'+n.step.id+'" open><summary>'+stepHTML(n.step)+'</summary>'+branches+(unnamed.length?treeList(unnamed):'')+'</details>';
 return (n.step?'<div class="step-leaf">'+stepHTML(n.step)+'</div>':'')+branches+(unnamed.length?treeList(unnamed):'');
}
function render(){if(!model)return;let q=$('search').value.toLowerCase();let html='';
 if(tab==='script'){let steps=model.steps.filter(matches);$('result').textContent=steps.length+' steps';html=q||!model.tree?steps.map(stepHTML).join(''):treeList(model.tree.groups.flatMap(g=>g.nodes));}
 if(tab==='variables'){let vars=sortedVariables(model.variables.filter(v=>[v.name,v.type,v.value].join(' ').toLowerCase().includes(q)));$('result').textContent=vars.length+' variables';html='<table class="table"><thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead><tbody>'+vars.map(v=>'<tr><td title="'+esc(v.name)+'">'+esc(v.name)+'</td><td title="'+esc(v.type)+'">'+esc(editorType(v))+'</td><td title="'+esc(v.value)+'">'+esc(v.value)+'</td></tr>').join('')+'</tbody></table>';}
 if(tab==='expressions'){let e=model.expressions.filter(v=>v.toLowerCase().includes(q));$('result').textContent=e.length+' unique expressions';html='<div class="empty">'+e.map(v=>'<div class="param">'+esc(v)+'</div>').join('')+'</div>';}
 if(tab==='subflows'){let s=model.steps.filter(s=>s.type==='StepCallSubflow'&&matches(s));$('result').textContent=s.length+' calls';html='<div class="empty muted">Referenced scripts are separate files. Open those .aef files to inspect their logic.</div>'+s.map(stepHTML).join('');}
 $('content').innerHTML=html||'<div class="empty">No matches.</div>';if(!selected) $('inspector').innerHTML='<h2>Step properties</h2><p class="muted">Select a step in the design tree to inspect it.</p><p class="muted">Expand branch names to follow the flow. Select a Goto step to jump to its label. Saved variable values are listed below the tree.</p>';
 window.UCCXStepIcons?.decorate($('content'));
 $('content').querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>activateStep(Number(b.dataset.step)));
}
function selectStep(id){return preservePagePosition(()=>selectStepContents(id));}
function selectStepContents(id){let s=model.steps.find(s=>s.id===id);if(!s)return;selected=id;root.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===id));let jump=findGotoTarget(s);
 $('inspector').innerHTML='<div class="muted small">Step '+s.order+' · Saved ID '+esc(s.ciscoId)+'</div><h2>'+esc(s.title)+'</h2>'+(s.label?'<span class="label">'+esc(s.label)+'</span>':'')+(jump?'<div><button class="btn secondary jump" id="uccx-goto">Jump to '+esc(s.values[0])+' →</button></div>':'')+'<h3>Properties</h3>'+propertyHTML(s)+''+(s.comment?'<h3>Comment</h3><pre>'+esc(s.comment)+'</pre>':'')+(s.branches.some(Boolean)?'<h3>Branch names</h3><p>'+esc(s.branches.filter(Boolean).join(' / '))+'</p>':'');
 if(jump)$('goto').onclick=()=>navigateToStep(jump.id);}
function findGotoTarget(step){
 if(step?.type!=='StepGoto'||!step.values[0])return null;
 return model.steps.find(candidate=>candidate.label===step.values[0]||(candidate.type==='StepLabel'&&candidate.values[0]===step.values[0]))||null;
}
function activateStep(id){
 const step=model.steps.find(candidate=>candidate.id===id);
 if(!step)return;
 const target=findGotoTarget(step);
 if(target){navigateToStep(target.id);return;}
 selectStep(id);
 if(step.type==='StepGoto'){
  $('notice').textContent='The target label "'+step.values[0]+'" was not found in this script.';
  $('notice').classList.remove('hidden');
 }
}
function revealStepInPane(button,pane){
 if(!button)return;
 const frame=pane.getBoundingClientRect(),row=button.getBoundingClientRect();
 const top=frame.top+pane.clientTop,bottom=top+pane.clientHeight;
 // Change only this pane's scroll position, and only enough to expose the row.
 if(row.top<top)pane.scrollTop-=top-row.top;
 else if(row.bottom>bottom)pane.scrollTop+=row.bottom-bottom;
}
function navigateToStep(id){return preservePagePosition(()=>navigateToStepContents(id));}
function navigateToStepContents(id){
 const pane=$('content');
 if(tab!=='script'||$('search').value){
  const top=pane.scrollTop,left=pane.scrollLeft;
  tab='script';$('search').value='';updateTabs();render();
  pane.scrollTop=top;pane.scrollLeft=left;
 }
 const button=pane.querySelector('[data-step="'+id+'"]');
 for(let parent=button?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 selectStep(id);
 // Keep focus on Play/Step or the clicked control; moving focus can move the page.
 revealStepInPane(button,pane);
}
function updateTabs(){$('content').setAttribute('aria-labelledby','uccx-tab-'+tab);root.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',b.dataset.tab===tab);b.tabIndex=b.dataset.tab===tab?0:-1;});}
const tabs=Array.from(root.querySelectorAll('[data-tab]'));
tabs.forEach((button,index)=>{
 button.onclick=()=>{tab=button.dataset.tab;$('search').value='';selected=null;updateTabs();render();};
 button.onkeydown=event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].click();tabs[next].focus();};
});$('search').oninput=render;
function load(buffer,name){try{if(buffer.byteLength>20*1024*1024)throw Error('File exceeds the 20 MB prototype limit');let next=window.UCCXAEF.parse(buffer,name);if(!next.steps.length)throw Error('No UCCX script steps found');resetSimulation();model=next;selected=null;tab='script';$('search').value='';$('variable-search').value='';updateTabs();$('filename').textContent=name;$('meta').innerHTML='<span><strong>'+model.steps.length+'</strong> steps</span><span><strong>'+model.variables.length+'</strong> variables</span><span><strong>'+model.expressions.length+'</strong> unique expressions</span><span class="muted">'+esc(model.workflowName!==model.name?'Internal name: '+model.workflowName:'')+'</span>';$('notice').textContent=model.warnings.join(' ');$('notice').classList.toggle('hidden',!model.warnings.length);$('loaded').hidden=false;$('upload').hidden=true;render();renderVariablePane();selectStep(model.steps[0].id);}catch(e){$('notice').textContent='Could not read this file: '+e.message+'. Other AEF versions or custom step formats may need additional support.';$('notice').classList.remove('hidden');}}
$('open').onclick=()=>$('file').click();
async function openFile(f){try{if(f.size>20*1024*1024)throw Error('Choose an AEF file smaller than 20 MB');if(!/\.aef$/i.test(f.name))throw Error('Choose a file with the .aef extension');$('open').disabled=true;$('open').textContent='Reading script…';load(await f.arrayBuffer(),f.name);}catch(e){$('notice').textContent=e.message;$('notice').classList.remove('hidden');}finally{$('open').disabled=false;$('open').textContent='Open .aef file';}}
$('file').onchange=async e=>{let f=e.target.files[0];if(f)await openFile(f);e.target.value='';};document.addEventListener('dragover',e=>{if(!Array.from(e.dataTransfer?.types||[]).includes('Files'))return;e.preventDefault();root.classList.add('is-dragging');});document.addEventListener('dragleave',()=>root.classList.remove('is-dragging'));document.addEventListener('drop',async e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();root.classList.remove('is-dragging');let f=e.dataTransfer.files[0];if(f)await openFile(f);});


function propertyName(s,i){let names={StepAssign:['Variable','Value'],StepIf:['Condition'],StepGoto:['Target label'],StepLabel:['Label'],StepDelay:['Delay expression'],StepCallSubflow:['Script'],RedirectStep:['Call Contact','Destination','Called Address'],ConsultTransferStep:['Call Contact','Destination','Output Digits','Timeout'],OutputStep:['Call Contact','Prompt'],AcceptStep:['Call Contact'],StepComment:['Annotation']};return names[s.type]?.[i]||'Saved value '+(i+1);}
function propertyField(name,value){return '<div class="param"><span class="property-name">'+esc(name)+'</span>'+esc(value)+'</div>';}
function scheduleClock(ms){const hour=Math.floor(ms/3600000)%24;return (hour%12||12)+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+' '+(hour<12?'AM':'PM');}
function bindingTable(title,rows,valueKey,valueTitle){return '<h3>'+esc(title)+'</h3><table class="table"><thead><tr><th>Parameter</th><th>'+esc(valueTitle)+'</th></tr></thead><tbody>'+rows.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p[valueKey]||'—')+'</td></tr>').join('')+'</tbody></table>';}
function propertyHTML(s){
 if(s.config.redirect){const r=s.config.redirect;return propertyField('Call Contact',r.contact)+propertyField('Destination',r.destination)+propertyField('Called Address',r.calledAddressMode||'Not decoded')+(r.calledAddressMode!=='Preserve'?propertyField('Reset To',r.resetAddress):'');}

 if(s.config.contactSettings)return propertyField('Contact',s.config.contactSettings.contact)+'<table class="table contact-attributes"><thead><tr><th>Names</th><th>Values</th></tr></thead><tbody>'+s.config.contactSettings.attributes.map(a=>'<tr><td>'+esc(a.name)+'</td><td>'+esc(a.value||'—')+'</td></tr>').join('')+'</tbody></table>';

 if(s.config.switch)return propertyField('Expression',s.config.switch.expression)+propertyField('Type',s.config.switch.type||'Not decoded')+'<table class="table"><thead><tr><th>Connection</th><th>Value</th></tr></thead><tbody>'+s.config.switch.cases.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.value)+'</td></tr>').join('')+'</tbody></table>';
 if(s.config.priority)return propertyField('Contact',s.config.priority.contact)+propertyField('Operation',s.config.priority.operation||'Not decoded ('+s.config.priority.code+')')+propertyField(s.config.priority.operation==='Assign'?'Assign Priority':'Priority expression',s.config.priority.value);
 if(s.config.enterprise){const e=s.config.enterprise;return propertyField('Contact',e.contact)+'<h3>Fields</h3><table class="table"><thead><tr><th>Values</th><th>Names</th><th>Tokens</th></tr></thead><tbody>'+e.fields.map(p=>'<tr><td>'+esc(p.value)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.token)+'</td></tr>').join('')+'</tbody></table><h3>Expanded Call Variables</h3><table class="table"><thead><tr><th>Values</th><th>Names</th><th>Type</th><th>Tokens</th></tr></thead><tbody>'+e.expanded.map(p=>'<tr><td>'+esc(p.value)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.type)+'</td><td>'+esc(p.token)+'</td></tr>').join('')+'</tbody></table>';}

 if(s.config.days)return propertyField('Time Zone',s.config.timezone)+'<table class="table schedule-properties"><thead><tr><th>Connection</th><th>Days</th></tr></thead><tbody>'+s.config.days.map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+g.days.map((on,i)=>on?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]:null).filter(Boolean).map(esc).join(', ')+'</td></tr>').join('')+'</tbody></table>';
 if(s.config.times)return propertyField('Time Zone',s.config.timezone)+'<table class="table schedule-properties"><thead><tr><th>Connection</th><th>Time Ranges</th></tr></thead><tbody>'+s.config.times.map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+(!g.ranges.length?'The rest':g.ranges.map(r=>r?esc(scheduleClock(r.start)+' – '+scheduleClock(r.end)):'Not decoded').join('<br>'))+'</td></tr>').join('')+'</tbody></table>';
 if(s.config.subflow)return propertyField('Script',s.values[0])+bindingTable('Input Parameters',s.config.subflow.inputs,'value','Value')+bindingTable('Output Parameters',s.config.subflow.outputs,'variable','Variable')+s.values.slice(5).map((v,i)=>propertyField(propertyName(s,i+5),v)).join('');
 if(s.config.contactAttributes)return '<div class="param"><span class="property-name">Call Contact</span>'+esc(s.values[0])+'</div><table class="table contact-attributes"><thead><tr><th>Attribute</th><th>Variable</th></tr></thead><tbody>'+s.config.contactAttributes.map(a=>'<tr><td>'+esc(a.name)+'</td><td>'+esc(a.variable||'—')+'</td></tr>').join('')+'</tbody></table>';
 return s.values.length?s.values.map((v,i)=>'<div class="param"><span class="property-name">'+esc(propertyName(s,i))+'</span>'+esc(v)+'</div>').join(''):'<p class="muted">No expression properties for this step.</p>';
}
function renderVariablePane(){if(!model)return;let q=$('variable-search').value.toLowerCase();let rows=sortedVariables(model.variables.filter(v=>[v.name,v.type,v.value].join(' ').toLowerCase().includes(q)));$('variable-list').innerHTML='<table class="table"><thead><tr><th>Name</th><th>Type</th><th>Value</th>'+(simulation?'<th>Simulated value</th>':'')+'</tr></thead><tbody>'+rows.map(v=>'<tr><td title="'+esc(v.name)+'">'+esc(v.name)+'</td><td title="'+esc(v.type)+'">'+esc(editorType(v))+'</td><td title="'+esc(v.value)+'">'+esc(v.value)+'</td>'+(simulation?'<td><input class="runtime-value" data-runtime-var="'+esc(v.name)+'" aria-label="Simulated '+esc(v.name)+'" placeholder="Unknown" value="'+esc(simulation.variables.has(v.name)?JSON.stringify(simulation.variables.get(v.name)):'')+'" /></td>':'')+'</tr>').join('')+'</tbody></table>';
 $('variable-list').querySelectorAll('[data-runtime-var]').forEach(input=>input.onchange=()=>{try{simulation.set(input.dataset.runtimeVar,runtimeValue(input.value));$('sim-status').textContent='Simulated value updated for '+input.dataset.runtimeVar;}catch(e){$('sim-status').textContent=e.message;}});
}
$('variable-search').oninput=renderVariablePane;
updateTabs();
// Pointer capture keeps the divider attached to the drag even outside the panel.
const variableDivider=$('variable-divider'),variablePane=$('variable-pane');
let variableDrag=null;
function variablePanelMaximum(){const design=$('design');return Math.max(100,design.clientHeight-design.querySelector('.pane-heading').offsetHeight-variableDivider.offsetHeight-140);}
function sizeVariablePanel(height){const maximum=variablePanelMaximum(),size=Math.round(Math.max(100,Math.min(maximum,height)));variablePane.style.height=size+'px';variableDivider.setAttribute('aria-valuemax',String(maximum));variableDivider.setAttribute('aria-valuenow',String(size));}
variableDivider.onpointerdown=event=>{if(event.button!==0||variableDrag)return;event.preventDefault();variableDrag={pointerId:event.pointerId,y:event.clientY,height:variablePane.getBoundingClientRect().height};variableDivider.setPointerCapture(event.pointerId);root.classList.add('is-resizing-variables');};
variableDivider.onpointermove=event=>{if(variableDrag?.pointerId!==event.pointerId)return;sizeVariablePanel(variableDrag.height+variableDrag.y-event.clientY);};
function finishVariableDrag(event){if(variableDrag?.pointerId!==event.pointerId)return;variableDrag=null;root.classList.remove('is-resizing-variables');if(variableDivider.hasPointerCapture(event.pointerId))variableDivider.releasePointerCapture(event.pointerId);}
variableDivider.onpointerup=finishVariableDrag;
variableDivider.onpointercancel=finishVariableDrag;
variableDivider.onlostpointercapture=finishVariableDrag;
variableDivider.onfocus=()=>sizeVariablePanel(variablePane.getBoundingClientRect().height);
variableDivider.onkeydown=event=>{const height=variablePane.getBoundingClientRect().height;if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();sizeVariablePanel(event.key==='Home'?100:event.key==='End'?variablePanelMaximum():height+(event.key==='ArrowUp'?20:-20));};

let simulation=null,playing=false,playTimer=null,resumeAfterChoice=false;
const scenarioFields=['sim-datetime','sim-zone','sim-caller','sim-called'];
function initScenario(){let now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000);$('sim-datetime').value=local.toISOString().slice(0,19);$('sim-zone').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
function resetSimulation(){resumeAfterChoice=false;if($('debug').open)$('debug').close();playing=false;clearTimeout(playTimer);simulation=null;scenarioFields.forEach(id=>$(id).disabled=false);$('sim-play').textContent='▶ Play';$('sim-pending').innerHTML='';$('sim-trace').innerHTML='';$('sim-status').textContent='Set the clock and caller, then Play or Step.';root.querySelectorAll('.running').forEach(b=>b.classList.remove('running'));if(model)renderVariablePane();}
function ensureSimulation(){if(simulation)return simulation;if(!model)throw Error('Open a script first');simulation=new window.UCCXSimulation.Simulator(model,{datetime:$('sim-datetime').value,timezone:$('sim-zone').value.trim(),caller:$('sim-caller').value,called:$('sim-called').value});scenarioFields.forEach(id=>$(id).disabled=true);renderVariablePane();return simulation;}
function debugOpen(){root.classList.add('is-debugging');$('sim-actions').hidden=false;$('debug-toggle').setAttribute('aria-expanded','true');}
function simulationUpdate(result){return preservePagePosition(()=>simulationUpdateContents(result));}
function simulationUpdateContents(result){
 $('sim-play').textContent=playing?'Ⅱ Pause':'▶ Play';
 if(!simulation)return;
 if(result?.step)navigateToStep(result.step.id);
 root.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('running',Number(b.dataset.step)===simulation.current));
 const current=simulation.steps.get(simulation.current);
 let clock=new Intl.DateTimeFormat(undefined,{timeZone:simulation.options.timezone,dateStyle:'medium',timeStyle:'medium'}).format(simulation.now);
 $('sim-status').textContent=(simulation.finished?'Finished':simulation.pending?'Waiting for your input':playing?'Playing':'Paused')+(current?' · Next: '+current.title:'')+' · '+clock+' ('+simulation.options.timezone+')';
 $('sim-trace').innerHTML=simulation.trace.map(t=>'<li><strong>'+esc(t.title)+'</strong> — '+esc(t.message)+'</li>').join('');$('sim-trace').scrollTop=$('sim-trace').scrollHeight;
 renderVariablePane();renderPending();
}
function runSimulationStep(){return preservePagePosition(()=>runSimulationStepContents());}
function runSimulationStepContents(){try{debugOpen();const engine=ensureSimulation();let result=engine.step();if(result.status==='paused'){resumeAfterChoice=playing||resumeAfterChoice;playing=false;clearTimeout(playTimer);}if(result.status==='finished'){resumeAfterChoice=false;playing=false;clearTimeout(playTimer);}simulationUpdate(result);if(result.status==='paused'||result.status==='finished')showDebugDialog();return result.status;}catch(e){playing=false;$('sim-status').textContent=e.message;$('sim-play').textContent='▶ Play';showDebugDialog();return 'error';}}
function tickSimulation(){if(!playing)return;let status=runSimulationStep();if(playing&&status==='stepped')playTimer=setTimeout(tickSimulation,playbackDelay());}
function runtimeValue(text){try{return JSON.parse(text);}catch{return text;}}
function renderPending(){
 const pending=simulation?.pending;if(!pending){$('sim-pending').innerHTML='';if($('debug').open)$('debug').close();return;}
 const s=pending.step;
 const choices=pending.branches.map((name,index)=>{let item=(s.config.menu||[]).find(v=>v.name===name);let digits=item?.digits&&item.digits!=='null'?item.digits:'';return '<button class="btn secondary uccx-choice" data-sim-branch="'+index+'" type="button">'+esc((digits?digits+' · ':'')+(name||'Continue'))+'</button>';}).join('');
 const digits=pending.kind==='digits'?'<label class="uccx-result-label">Digits<input class="uccx-result-input" id="uccx-sim-digits" inputmode="numeric" /></label>':'';
 let variable=s.config.resultVariable||'';
 $('sim-pending').innerHTML='<p>'+esc(pending.message)+'</p><p class="muted">'+(resumeAfterChoice?'Playback will continue after you choose an option.':'Choose an option, then use Play or Step to continue.')+'</p>'+digits+'<div>'+choices+'</div>'+(!pending.branches.length?'<button class="btn secondary uccx-choice" id="uccx-sim-skip">Skip this step</button>':'')+(pending.kind==='limit'?'':'<details><summary class="small">Supply a value / override</summary><label class="uccx-result-label">Variable<select class="uccx-result-input" id="uccx-sim-variable"><option value="">Choose a variable…</option>'+model.variables.map(v=>'<option value="'+esc(v.name)+'"'+(v.name===variable?' selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></label><label class="uccx-result-label">Simulated value<input class="uccx-result-input" id="uccx-sim-value" placeholder="0, true, or a string" /></label><button class="btn secondary uccx-choice" id="uccx-sim-apply">Apply value</button><button class="btn secondary uccx-choice" id="uccx-sim-retry">Retry step</button></details>');
 $('sim-pending').querySelectorAll('[data-sim-branch]').forEach(b=>b.onclick=()=>{try{simulation.choose(pending.branches[Number(b.dataset.simBranch)],$('sim-digits')?.value);continueAfterChoice();if(simulation.current!==null)navigateToStep(simulation.current);}catch(e){$('sim-status').textContent=e.message;}});
 if($('sim-skip'))$('sim-skip').onclick=()=>{simulation.skip();continueAfterChoice();if(simulation.current!==null)navigateToStep(simulation.current);};
 if($('sim-retry'))$('sim-retry').onclick=()=>{simulation.pending=null;runSimulationStep();continueAfterChoice();};
 if($('sim-apply'))$('sim-apply').onclick=()=>{try{const name=$('sim-variable').value;if(!name)throw Error('Choose a variable');simulation.set(name,runtimeValue($('sim-value').value));simulation.log(s,'Supplied '+name+' = '+String(simulation.variables.get(name)));if(s.type==='GetReportingStatStep'&&name===s.config.resultVariable){simulation.skip();continueAfterChoice();if(simulation.current!==null)navigateToStep(simulation.current);}else{renderVariablePane();$('sim-status').textContent='Value applied. Retry the step or choose an outcome.';}}catch(e){$('sim-status').textContent=e.message;}};
}
function pauseSimulation(){resumeAfterChoice=false;playing=false;clearTimeout(playTimer);simulationUpdate();}
function playbackDelay(){const speed=Number($('sim-speed').value);return [350,1000,2000,3000,5000].includes(speed)?speed:1000;}
function showDebugDialog(){if(!$('debug').open)$('debug').showModal();}
function continueAfterChoice(){simulationUpdate();if(resumeAfterChoice&&!simulation.pending&&!simulation.finished){resumeAfterChoice=false;playing=true;simulationUpdate();playTimer=setTimeout(tickSimulation,playbackDelay());}}
$('debug-toggle').onclick=()=>{let opening=$('sim-actions').hidden;if(opening){debugOpen();}else{pauseSimulation();if($('debug').open)$('debug').close();$('sim-actions').hidden=true;root.classList.remove('is-debugging');$('debug-toggle').setAttribute('aria-expanded','false');}};
$('debug-close').onclick=()=>{pauseSimulation();$('debug').close();};
$('debug').oncancel=()=>{resumeAfterChoice=false;playing=false;clearTimeout(playTimer);$('sim-play').textContent='▶ Play';};
$('trace-open').onclick=()=>{pauseSimulation();$('settings-dialog').close();showDebugDialog();};
$('sim-settings').onclick=()=>{pauseSimulation();$('settings-dialog').showModal();};
$('settings-close').onclick=()=>$('settings-dialog').close();
$('settings-dialog').onclick=event=>{if(event.target===$('settings-dialog')){const bounds=$('settings-dialog').getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)$('settings-dialog').close();}};
$('sim-play').onclick=()=>{debugOpen();if(playing){playing=false;clearTimeout(playTimer);simulationUpdate();return;}try{ensureSimulation();if(simulation.pending){resumeAfterChoice=true;renderPending();showDebugDialog();return;}if(simulation.finished){$('sim-status').textContent='Reset to begin a new walkthrough.';showDebugDialog();return;}playing=true;tickSimulation();}catch(e){$('sim-status').textContent=e.message;showDebugDialog();}};
$('sim-step').onclick=()=>{resumeAfterChoice=false;playing=false;clearTimeout(playTimer);runSimulationStep();};
$('sim-reset').onclick=resetSimulation;
initScenario();

})();
