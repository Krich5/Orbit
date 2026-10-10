(function () {
'use strict';
/* Structural Java serialization reader for UCCX AEF files.
 * Parses data only; never instantiates or executes Java classes.
 * Cisco writeObject payloads remain custom annotations; modelAEF maps
 * the saved workflow tree, expressions, and variable records.
 * Unrecognized serialization layouts may need additional support.
 */
class AEFParser {
 constructor(buffer){this.d=new DataView(buffer);this.p=0;this.handles=[];this.objects=[];this.depth=0;}
 u8(){return this.d.getUint8(this.p++);} u16(){let v=this.d.getUint16(this.p);this.p+=2;return v;} i32(){let v=this.d.getInt32(this.p);this.p+=4;return v;} i64(){let v=this.d.getBigInt64(this.p);this.p+=8;return v.toString();}
 utf(n=this.u16()){if(n<0||this.p+n>this.d.byteLength)throw Error('Invalid string length');let bytes=new Uint8Array(this.d.buffer,this.p,n);this.p+=n;let out='';for(let i=0;i<bytes.length;){let b=bytes[i++];if(b<128)out+=String.fromCharCode(b);else if((b&224)===192)out+=String.fromCharCode(((b&31)<<6)|(bytes[i++]&63));else if((b&240)===224)out+=String.fromCharCode(((b&15)<<12)|((bytes[i++]&63)<<6)|(bytes[i++]&63));else throw Error('Invalid modified UTF-8');}return out;}
 handle(o){this.handles.push(o);return o;}
 primitive(t){switch(t){case 'Z':return !!this.u8();case 'B':{let v=this.d.getInt8(this.p);this.p++;return v;}case 'C':return String.fromCharCode(this.u16());case 'S':{let v=this.d.getInt16(this.p);this.p+=2;return v;}case 'I':return this.i32();case 'J':return this.i64();case 'F':{let v=this.d.getFloat32(this.p);this.p+=4;return v;}case 'D':{let v=this.d.getFloat64(this.p);this.p+=8;return v;}default:return this.read();}}
 annotations(){let a=[];while(this.d.getUint8(this.p)!==0x78)a.push(this.read());this.p++;return a;}
 read(){if(++this.depth>600)throw Error('Object nesting too deep');try{return this.content();}finally{this.depth--;}}
 content(){let t=this.u8();switch(t){case 0x70:return null;case 0x71:{let h=this.i32()-0x7e0000;if(h<0||h>=this.handles.length)throw Error('Invalid object reference');return this.handles[h];}case 0x72:{let c={kind:'classdesc',name:this.utf(),uid:this.i64()};this.handle(c);c.flags=this.u8();let n=this.u16();c.fields=[];for(let i=0;i<n;i++){let type=String.fromCharCode(this.u8()),name=this.utf();let signature=(type==='L'||type==='[')?this.read():null;c.fields.push({type,name,signature});}c.annotations=this.annotations();c.super=this.read();return c;}
 case 0x73:{let c=this.read();let o={kind:'object',class:c.name,fields:{},annotations:{},id:this.objects.length};this.objects.push(o);this.handle(o);let chain=[];for(let x=c;x;x=x.super)chain.unshift(x);for(let x of chain){if(x.flags&2){if(!((x.flags&1)&&x.name.startsWith('com.cisco.')))for(let f of x.fields)o.fields[f.name]=this.primitive(f.type);if(x.flags&1)o.annotations[x.name]=this.annotations();}else if(x.flags&4){if(!(x.flags&8))throw Error('Unsupported externalizable object '+x.name);o.annotations[x.name]=this.annotations();}}return o;}
 case 0x74:return this.handle(this.utf());case 0x7c:{let n=Number(this.i64());return this.handle(this.utf(n));}
 case 0x75:{let c=this.read();let o={kind:'array',class:c.name,values:[],id:this.objects.length};this.objects.push(o);this.handle(o);let n=this.i32();if(n<0||n>1000000)throw Error('Invalid array length');for(let i=0;i<n;i++)o.values.push(this.primitive(c.name[1]));return o;}
 case 0x76:return this.handle({kind:'class',descriptor:this.read()});
 case 0x77:case 0x7a:{let n=t===0x77?this.u8():this.i32();if(n<0||this.p+n>this.d.byteLength)throw Error('Invalid block length');let b={kind:'block',hex:Array.from(new Uint8Array(this.d.buffer,this.p,n),v=>v.toString(16).padStart(2,'0')).join('')};this.p+=n;return b;}
 case 0x7e:{let c=this.read();let o=this.handle({kind:'enum',class:c.name});o.name=this.read();return o;}
 default:throw Error('Unsupported serialization token 0x'+t.toString(16)+' at '+(this.p-1));}}
 parse(){if(this.u16()!==0xaced||this.u16()!==5)throw Error('This is not a Java-serialized AEF file');let root=this.read();if(this.p!==this.d.byteLength)throw Error('Unparsed trailing data at '+this.p);return {root,objects:this.objects};}
}


function modelAEF(parsed,name){
 const objects=parsed.objects, short=o=>o?.class?.split('.').pop()||'', ann=(o,c=short(o))=>Object.entries(o?.annotations||{}).find(([k])=>k.endsWith('.'+c))?.[1]||[];
 const list=o=>!o?[]:o.kind==='array'?o.values:o.class==='java.util.Vector'?o.fields.elementData.values.slice(0,o.fields.elementCount):['java.util.ArrayList','java.util.LinkedList'].includes(o.class)?ann(o).filter(v=>v?.kind!=='block'):[];
 function readable(v,depth=0,seen=new Set()){
  if(v===null||v===undefined)return 'null';if(typeof v!=='object')return String(v);if(depth>8||seen.has(v))return '['+short(v)+']';seen=new Set(seen);seen.add(v);
  if(v.kind==='block')return '[binary: '+v.hex+']';if(v.kind==='class')return v.descriptor.name;if(v.kind==='enum')return v.name;
  if(short(v)==='TimeRange'){let r=range(v);return r?clock(r.start)+'–'+clock(r.end):'[undecoded time range]';}
  if(short(v)==='TextExpression')return ann(v).find(x=>typeof x==='string')??'[empty expression]';
  if(['StringBuffer','StringBuilder'].includes(short(v))){
   const chars=v.fields?.value?.values,count=v.fields?.count;
   if(chars)return chars.slice(0,Number.isInteger(count)?count:chars.length).join('');
   return Object.values(v.annotations||{}).flat().filter(x=>typeof x==='string').join('');
  }
  if('value'in(v.fields||{}))return readable(v.fields.value,depth+1,seen);
  if(v.kind==='array'||['Vector','ArrayList','LinkedList'].includes(short(v)))return '['+list(v).map(x=>readable(x,depth+1,seen)).join(', ')+']';

  let a=ann(v).filter(x=>x?.kind!=='block');if(a.length)return short(v)+'('+a.map(x=>readable(x,depth+1,seen)).join(', ')+')';
  return short(v)+(Object.keys(v.fields||{}).length?' '+JSON.stringify(v.fields):'');
 }
 function clock(ms){return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0');}
 function pairs(o){const a=ann(o).filter(v=>v?.kind!=='block');let result=[];for(let i=0;i<a.length;i+=2)result.push([readable(a[i]),a[i+1]]);return result;}
 function range(o){let hex=ann(o).filter(v=>v?.kind==='block').map(v=>v.hex).join('');if(hex.length!==40||hex.slice(0,8)!=='00000003')return null;let start=Number(BigInt('0x'+hex.slice(8,24))),end=Number(BigInt('0x'+hex.slice(24,40)));if(start<0||end<0||start>86400000||end>86400000)return null;return {start,end};}
 function configuration(bean,args){let type=short(bean),c={};
  if(type==='DayOfWeekStep'){c.timezone=readable(args[0]);let map=args.find(v=>v?.class==='java.util.HashMap');c.days=pairs(map).map(([name,v])=>({name,days:list(v)}));}
  if(type==='TimeStep'){c.timezone=readable(args[0]);c.times=list(args[1]).map(o=>{let a=ann(o).filter(v=>v?.kind!=='block');return {name:a[0],ranges:list(a[1]).map(range)};});}
  if(type==='MenuStep'){let map=args.find(v=>v?.class==='java.util.HashMap');c.menu=pairs(map).map(([name,v])=>({name,digits:readable(v)}));}
  if(bean?.class==='com.cisco.wf.steps.ivr.GetSessionInfoStep'||type==='GetCallContactInfoStep'){
   let a=args.find(v=>v?.kind==='array'),variables=list(a);c.callerVariable=readable(variables[0]);c.calledVariable=readable(variables[1]);
   c.contactAttributes=['Calling Number','Called Number','Arrival Type','Last Redirected Number','Original Called Number','Dialed Number'].map((name,i)=>({name,variable:readable(variables[i]??'')}));
  }
  if(type==='StepCallSubflow'&&args.slice(1,5).every(v=>v?.kind==='array')&&args.length>=5){
   const inputValues=list(args[1]),inputNames=list(args[2]),outputNames=list(args[3]),outputVariables=list(args[4]);
   if(inputValues.length===inputNames.length&&outputNames.length===outputVariables.length)c.subflow={
    inputs:inputNames.map((v,i)=>({name:readable(v),value:readable(inputValues[i])})),
    outputs:outputNames.map((v,i)=>({name:readable(v),variable:readable(outputVariables[i])}))
   };
  }
  if(type==='StepSwitch'&&args[1]?.kind==='array'&&args[2]?.kind==='array'){
   const values=list(args[1]),names=list(args[2]);
   if(values.length===names.length)c.switch={expression:readable(args[0]),type:readable(args[3])==='0'?'String':null,cases:names.map((v,i)=>({name:readable(v),value:readable(values[i])}))};
  }
  if(type==='SetGED125DataStep'&&args.slice(1,8).every(v=>v?.kind==='array')&&args.length>=8){
   const arrays=args.slice(1,8).map(list);
   if(arrays[0].length===arrays[1].length&&arrays[0].length===arrays[2].length&&arrays[3].length===arrays[4].length&&arrays[3].length===arrays[5].length&&arrays[3].length===arrays[6].length)c.enterprise={
    contact:readable(args[0]),fields:arrays[0].map((v,i)=>({value:readable(v),name:readable(arrays[1][i]),token:readable(arrays[2][i])})),
    expanded:arrays[3].map((v,i)=>({value:readable(v),name:readable(arrays[4][i]),type:readable(arrays[5][i]),token:readable(arrays[6][i])}))
   };
  }
  if(type==='RedirectStep'&&args.length>=3){
   const blocks=ann(bean).filter(v=>v?.kind==='block'),flag=blocks.at(-1)?.hex;
   c.redirect={contact:readable(args[0]),destination:readable(args[1]),resetAddress:readable(args[2]),calledAddressMode:flag==='01'?'Reset To':flag==='00'?'Preserve':null};
  }
  if(type==='HandledSessionStep'&&args[1]?.kind==='array'&&list(args[1]).length===3){
   const values=list(args[1]);
   c.contactSettings={contact:readable(args[0]),attributes:['Language','Handled','Session'].map((name,i)=>({name,value:readable(values[i])}))};
  }
  if(type==='SetPriorityStep'){
   const blocks=ann(bean).filter(v=>v?.kind==='block'),code=blocks.at(-1)?.hex;
   c.priority={contact:readable(args[0]),value:readable(args[1]),operation:code==='00000000'?'Assign':null,code};
  }
  if(type==='ParseInputStep'){let a=args.filter(v=>short(v)==='TextExpression');c.inputVariable=readable(a[0]);}
  if(type==='GetReportingStatStep'){let a=args.filter(v=>short(v)==='TextExpression');c.resultVariable=readable(a[0]);}
  return c;
 }
 const beans=objects.filter(o=>short(o)==='WFBeanStep');
 const steps=beans.map((o,index)=>{let a=ann(o),bean=a.find(x=>x?.kind==='object'&&x.class!==o.class),raw=ann(bean),args=raw.filter(x=>x?.kind!=='block');
 let config=configuration(bean,args);let type=short(bean), title=({StepAssign:'Set',StepIf:'If',StepGoto:'Goto',StepStart:'Start',StepEnd:'End',StepDelay:'Delay',StepLabel:'Label',OutputStep:'Play Prompt',ParseInputStep:'Get Digit String',SelectResourceStep:'Select Resource',StepCallSubflow:'Call Subflow',RedirectStep:'Call Redirect',TerminateStep:'Terminate',TimeStep:'Time of Day',DayOfWeekStep:'Day of Week',StepComment:'Annotate',ConsultTransferStep:'Call Consult Transfer'})[type]||type.replace(/^Step/,'').replace(/Step$/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
 if(config.contactAttributes)title='Get Call Contact Info';
 if(config.enterprise)title='Set Enterprise Call Info';
 if(config.contactSettings)title='Set Contact Info';
 if(config.switch?.type)title='Switch '+config.switch.type;
 title=({HoldStep:'Call Hold',UnholdStep:'Call Unhold',StepInc:'Increment',StepDec:'Decrement'})[type]||title;
 let values=args.map(x=>readable(x));let summary=type==='StepAssign'?values[0]+' = '+values[1]:values.join(' · ');
 let idBlock=ann(o,'WFStep')[0];let ciscoId=idBlock?.hex?.length>=32?BigInt('0x'+idBlock.hex.slice(16,32)).toString():null;
 return {id:o.id,ciscoId,index,type,className:bean?.class,title,config,summary,values,comment:typeof a[3]==='string'?a[3]:'',label:typeof a[4]==='string'?a[4]:'',branches:list(ann(bean,'WFJBStep')[2]),raw:raw.map(x=>readable(x)),children:[]};});
 const stepById=new Map(steps.map(s=>[s.id,s]));let trees=objects.filter(o=>short(o)==='WFTreeWorkflow');let rootNode=ann(trees[0])[2];let rootA=ann(rootNode), mapA=ann(rootA[3]), branches=new Map();for(let i=1;i<mapA.length;i+=2)branches.set(mapA[i]?.id,list(mapA[i+1]).map(list));
 const seen=new Set(), order=[];function walk(node,depth=0){let a=ann(node),step=stepById.get(a[1]?.id);if(step){if(seen.has(step.id))throw Error('Repeated step in script tree');seen.add(step.id);step.order=order.length+1;step.depth=depth;order.push(step);}if(depth>100)throw Error('Script tree too deep');let groups=branches.get(node?.id)||[];return {step,groups:groups.map((nodes,i)=>({name:step?.branches[i]??(step?'':'Script'),nodes:nodes.map(n=>walk(n,step?depth+1:depth))}))};}
 const tree=rootNode?walk(rootNode):null;let warnings=[];if(order.length!==steps.length)warnings.push('Tree contains '+order.length+' of '+steps.length+' steps; remaining steps appear separately.');for(let s of steps)if(!seen.has(s.id)){s.order=order.length+1;s.depth=0;order.push(s);}
 const vars=objects.filter(o=>short(o)==='WFExpressionVariable').map(o=>{let a=ann(o);return {name:a.find(x=>typeof x==='string')||'?',type:a.find(x=>x?.kind==='class')?.descriptor.name||'Unknown',value:readable(a[4]),raw:a.map(x=>readable(x))};});
 const expressions=[...new Set(objects.filter(o=>short(o)==='TextExpression').map(o=>readable(o)))];
 const workflowName=ann(parsed.root).find(v=>typeof v==='string'&&v.endsWith('.aef'))||name;
 return {name,workflowName,steps:order,variables:vars,expressions,tree,warnings,objects,readable};
}


window.UCCXAEF = { parse(buffer, name) { return modelAEF(new AEFParser(buffer).parse(), name); } };

})();
