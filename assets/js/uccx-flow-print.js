(function(){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function wrap(value,width){return String(value??'').split(/\r?\n/).flatMap(line=>{const out=[];while(line.length>width){let cut=line.lastIndexOf(' ',width);if(cut<width/2)cut=width;out.push(line.slice(0,cut));line=line.slice(cut).trimStart();}return [...out,line];});}
function graph(model){
 const records=[],byId=new Map();
 function sequence(nodes,after){for(let i=0;i<nodes.length;i++){const node=nodes[i];if(!node.step)continue;const next=nodes[i+1]?.step?.id??after;const record={step:node.step,node,next,edges:[]};records.push(record);byId.set(node.step.id,record);for(const group of node.groups||[])sequence(group.nodes,next);}}
 sequence(model.tree.groups.flatMap(g=>g.nodes),null);
 const labels=new Map();for(const r of records){if(r.step.label&&!labels.has(r.step.label))labels.set(r.step.label,r.step.id);if(r.step.type==='StepLabel'&&!labels.has(r.step.values[0]))labels.set(r.step.values[0],r.step.id);}
 for(const r of records){const s=r.step;if(s.type==='StepEnd'||s.type==='TerminateStep')continue;if(s.type==='StepGoto'){const label=s.values[0];r.edges=[{label:'Goto '+label,target:labels.get(label),unresolved:!labels.has(label)}];}else if(r.node.groups?.length){r.edges=r.node.groups.map(g=>({label:g.name||(r.node.groups.length===1?'Next':'Continue'),target:g.nodes[0]?.step?.id??r.next}));}else if(r.next!==null&&r.next!==undefined)r.edges=[{label:'Next',target:r.next}];}
 return {records,byId};
}
function build(model,options={}){
 if(!model?.tree||!model.steps.length)throw Error('Open a script first.');
 const {records,byId}=graph(model);if(records.length!==model.steps.length||byId.size!==records.length)throw Error('The saved script tree is incomplete; a complete flow diagram cannot be printed.');let included=new Set(records.map(r=>r.step.id));
 if(options.scope==='selected'){const record=byId.get(options.selectedId);if(!record)throw Error('Select a step first.');included=new Set();const visit=n=>{if(n.step)included.add(n.step.id);for(const g of n.groups||[])g.nodes.forEach(visit);};visit(record.node);}
 const chosen=records.filter(r=>included.has(r.step.id));const pages=[],pageFor=new Map();let rows=[],y=80;
 for(const record of chosen){const chunks=[];for(let i=0;i<record.edges.length;i+=8)chunks.push(record.edges.slice(i,i+8));if(!chunks.length)chunks.push([]);
 chunks.forEach((edges,index)=>{const height=Math.max(130,edges.length*37+32);if(y+height>605){pages.push({rows});rows=[];y=80;}if(!pageFor.has(record.step.id))pageFor.set(record.step.id,pages.length+1);rows.push({record,edges,continuation:index>0,y,height});y+=height;});}
 if(rows.length)pages.push({rows});
 const number=new Map(records.map((r,index)=>[r.step.id,index+1]));
 const text=(x,y,value,size=12,extra='')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" '+extra+'>'+esc(value)+'</text>';
 const line=(d)=>'<path d="'+d+'" fill="none" stroke="#667b91" stroke-width="1.5" marker-end="url(#arrow)"/>';
 const summary=s=>String(options.summary?options.summary(s):s.summary||'');
 const svgs=pages.map((page,pageIndex)=>{
 let svg='';page.rows.forEach((row,rowIndex)=>{const {record:r,edges,continuation,y,height}=row,s=r.step,cy=y+58;const decision=['StepIf','StepSwitch','MenuStep','DayOfWeekStep','TimeStep'].includes(s.type)||r.edges.length>1,terminal=['StepStart','StepEnd','TerminateStep'].includes(s.type);
 let title=wrap(s.title,decision?30:45).slice(0,2),detail=wrap(summary(s),decision?35:48);if(detail.length>3)detail=[...detail.slice(0,2),detail[2].slice(0,44)+'...'];
 svg+=text(60,y-5,'S'+number.get(s.id)+(s.label?' · '+s.label:'')+(continuation?' · branches continued':''),11,'fill="#425976"');
 if(decision)svg+='<polygon points="60,'+cy+' 275,'+y+' 490,'+cy+' 275,'+(y+116)+'" fill="#fff7df" stroke="#b28b31"/>';
 else svg+='<rect x="60" y="'+y+'" width="430" height="116" rx="'+(terminal?48:7)+'" fill="'+(terminal?'#e6f5ee':'#eef5fc')+'" stroke="'+(terminal?'#3e876b':'#7393b4')+'"/>';
 const lines=[...title,...detail];const first=cy-(lines.length-1)*7;
 lines.forEach((value,index)=>{svg+=text(275,first+index*14,value,index<title.length?13:11,'text-anchor="middle" '+(index<title.length?'font-weight="600"':''));});
 const nextRow=page.rows[rowIndex+1];const direct=edges.length===1&&edges[0].label==='Next'&&nextRow&&!nextRow.continuation&&edges[0].target===nextRow.record.step.id;
 if(direct){svg+=line('M275 '+(y+116)+' V'+nextRow.y);return;}
 edges.forEach((edge,index)=>{const ey=y+index*37;const target=byId.get(edge.target),targetPage=pageFor.get(edge.target);let label=edge.unresolved?'Unresolved destination':edge.target===null||edge.target===undefined?'End of this path':target?'S'+number.get(edge.target)+' · '+target.step.title+(targetPage?' · p. '+targetPage:' · outside section'):'Unknown destination';
 svg+=line('M490 '+cy+' H530 V'+(ey+26)+' H565');svg+=text(570,ey+10,wrap(edge.label,54)[0],11,'fill="#6c4d16"');svg+='<rect x="565" y="'+(ey+15)+'" width="370" height="22" rx="11" fill="#fff" stroke="#b1bfce"/>';svg+=text(576,ey+30,wrap(label,58)[0],11);});
 });return {title:'Flow diagram',svg};});
 function appendix(title,lines){for(let i=0;i<lines.length;i+=36){const chunk=lines.slice(i,i+36);svgs.push({title,svg:chunk.map((value,index)=>text(60,90+index*14,value,11,'font-family="monospace"')).join('')});}}
 if(options.notes){const lines=[];for(const {step:s} of chosen){const note=s.comment||(s.type==='StepComment'?s.values[0]:'');lines.push('S'+number.get(s.id)+' · '+s.title+(s.label?' · '+s.label:''));lines.push(...wrap(summary(s),112));if(note)lines.push(...wrap(note,112));lines.push('');}appendix('Step details and comments',lines);}
 if(options.variables){const lines=[];for(const v of model.variables)lines.push(...wrap(v.name+' ('+v.type+') = '+v.value,112),'');appendix('Variables · saved values',lines);}
 const name=model.name||'UCCX script';const sheets=svgs.map((page,index)=>'<section class="sheet"><svg viewBox="0 0 1000 650" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+esc(page.title)+' page '+(index+1)+'"><rect width="1000" height="650" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#667b91"/></marker></defs><g fill="#24374c" font-family="Arial, sans-serif">'+text(40,29,wrap(name,85)[0],18,'font-weight="700"')+text(40,52,page.title+' · '+(options.scope==='selected'?'Selected step and branches':'Full script'),12)+page.svg+'<path d="M40 622 H960" stroke="#c6d0da"/>'+text(40,639,'S = step reference · p. = destination page · arrows show saved branches and continuation',10)+text(960,639,'Page '+(index+1)+' / '+svgs.length,10,'text-anchor="end"')+'</g></svg></section>').join('');
 const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(name)+' - Printable flow</title><style>body{margin:0;background:#e7edf3;color:#24374c;font:14px Arial,sans-serif}.tools{padding:16px;position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;z-index:1;display:flex;gap:16px;align-items:center}.tools button{padding:10px 16px;border:1px solid #7a91aa;background:#eef5fc;border-radius:6px;cursor:pointer}.sheet{width:min(1000px,100%);margin:20px auto;background:white;box-shadow:0 3px 16px #0002}.sheet svg{width:100%;display:block}@page{size:letter landscape;margin:8mm}@media print{body{background:white}.tools{display:none}.sheet{width:100%;margin:0;box-shadow:none;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet svg{width:100%;height:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="tools"><button type="button" onclick="window.print()">Print / Save PDF</button><span>Landscape · choose Save as PDF in the print dialog. '+svgs.length+' pages. Reference arrows keep large flows readable.</span></div>'+sheets+'</body></html>';
 return {html,pages:svgs.length,flowPages:pages.length,records:chosen,pageFor,graph:{records,byId}};
}
window.UCCXFlowPrint={build,graph};
})();
