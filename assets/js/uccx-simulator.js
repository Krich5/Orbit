(function () {
'use strict';
// Restricted expression interpreter: no eval, Java execution, or network calls.
function expression(source, variables) {
 const text=String(source??'').trim();
 if (/^(P|SCRIPT|DOC|TEXT|TZ)\[/.test(text)) return text;
 const tokens=[];let at=0;
 while(at<text.length){
  const rest=text.slice(at);let match;
  if((match=rest.match(/^\s+/))){at+=match[0].length;continue;}
  if(rest[0]==='"'||rest[0]==="'"){
   const quote=rest[0];let value='',i=1,closed=false;
   for(;i<rest.length;i++){let c=rest[i];if(c===quote){closed=true;i++;break;}if(c==='\\'){i++;let e=rest[i];if(e===undefined)break;value+=({n:'\n',r:'\r',t:'\t','\\':'\\','"':'"',"'":"'"})[e]??('\\'+e);}else value+=c;}
   if(!closed)throw Error('Unterminated string');tokens.push({type:'literal',value});at+=i;continue;
  }
  if((match=rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/))){tokens.push({type:'literal',value:Number(match[0])});at+=match[0].length;continue;}
  if((match=rest.match(/^[A-Za-z_$][\w$]*/))){tokens.push({type:'name',value:match[0]});at+=match[0].length;continue;}
  if((match=rest.match(/^(==|!=|<=|>=|&&|\|\||[+\-*/%<>()!?:.,\[\]])/))){tokens.push({type:match[0],value:match[0]});at+=match[0].length;continue;}
  throw Error('Unsupported expression near '+rest.slice(0,24));
 }
 let pos=0;const peek=()=>tokens[pos]?.type, take=t=>{if(peek()!==t)throw Error('Expected '+t);return tokens[pos++];};
 const priority={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
 function atom(){let node,t=tokens[pos++];if(!t)throw Error('Empty expression');
  if(t.type==='literal')node={kind:'value',value:t.value};
  else if(t.type==='name')node={kind:'name',name:t.value};
  else if(t.type==='('){node=parse(0);take(')');}
  else if(['!','-','+'].includes(t.type))node={kind:'unary',op:t.type,value:atom()};
  else throw Error('Unsupported token '+t.type);
  while(peek()==='.'||peek()==='['){if(peek()==='['){take('[');let index=parse(0);take(']');node={kind:'index',object:node,index};continue;}take('.');let name=take('name').value;if(peek()==='('){take('(');let args=[];if(peek()!==')'){do{args.push(parse(0));if(peek()!==',')break;take(',');}while(true);}take(')');node={kind:'call',object:node,name,args};}else node={kind:'property',object:node,name};}
  return node;
 }
 function parse(min){let left=atom();while(priority[peek()]>=min){let op=tokens[pos++].type;left={kind:'binary',op,left,right:parse(priority[op]+1)};}if(min===0&&peek()==='?'){take('?');let yes=parse(0);take(':');left={kind:'conditional',test:left,yes,no:parse(0)};}return left;}
 let tree=parse(0);if(pos!==tokens.length)throw Error('Unsupported trailing expression');
 const boolean=v=>{if(typeof v!=='boolean')throw Error('A boolean result is required');return v;};
 function visit(n){switch(n.kind){
  case 'value':return n.value;
  case 'name':if(n.name==='true')return true;if(n.name==='false')return false;if(n.name==='null')return null;if(['Integer','Double','String'].includes(n.name))return {static:n.name};if(!variables.has(n.name))throw Error('Set a simulated value for '+n.name);return variables.get(n.name);
  case 'unary':{let v=visit(n.value);if(n.op==='!')return !boolean(v);if(typeof v!=='number')throw Error('A number is required');return n.op==='-'?-v:v;}
  case 'conditional':return visit(boolean(visit(n.test))?n.yes:n.no);
  case 'index':{let obj=visit(n.object),i=visit(n.index);if(!Array.isArray(obj)&&typeof obj!=='string')throw Error('Unsupported indexing');return obj[i];}
  case 'property':{let obj=visit(n.object);if(n.name==='length'&&(Array.isArray(obj)||typeof obj==='string'))return obj.length;throw Error('Unsupported property '+n.name);}
  case 'call':{let obj=visit(n.object),args=n.args.map(visit);if(obj?.static){if(n.name==='parseInt'&&obj.static==='Integer'){if(!/^[+-]?\d+$/.test(String(args[0])))throw Error('Invalid integer');return Number(args[0]);}if(n.name==='parseDouble'&&obj.static==='Double'){let v=Number(args[0]);if(!Number.isFinite(v))throw Error('Invalid number');return v;}if(n.name==='valueOf'&&obj.static==='String')return String(args[0]);throw Error('Unsupported static method');}
   if(n.name==='toString')return String(obj);if(typeof obj!=='string')throw Error('Unsupported method '+n.name);
   switch(n.name){case 'length':return obj.length;case 'equals':return obj===args[0];case 'equalsIgnoreCase':return obj.toLowerCase()===String(args[0]).toLowerCase();case 'startsWith':return obj.startsWith(args[0]);case 'endsWith':return obj.endsWith(args[0]);case 'contains':return obj.includes(args[0]);case 'substring':return obj.substring(...args);case 'charAt':return obj.charAt(args[0]);case 'trim':return obj.trim();case 'toLowerCase':return obj.toLowerCase();case 'toUpperCase':return obj.toUpperCase();case 'indexOf':return obj.indexOf(...args);default:throw Error('Unsupported string method '+n.name);}}
  case 'binary':{let a=visit(n.left);if(n.op==='&&')return boolean(a)&&boolean(visit(n.right));if(n.op==='||')return boolean(a)||boolean(visit(n.right));let b=visit(n.right);switch(n.op){case '==':return a===b;case '!=':return a!==b;case '+':if(typeof a==='string'||typeof b==='string')return String(a)+String(b);break;case '<':case '>':case '<=':case '>=':if(typeof a!=='number'||typeof b!=='number')throw Error('Numeric comparison requires numbers');return n.op==='<'?a<b:n.op==='>'?a>b:n.op==='<='?a<=b:a>=b;}
   if(typeof a!=='number'||typeof b!=='number')throw Error('Numeric operands required');switch(n.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':if(b===0)throw Error('Division by zero');return a/b;case '%':return a%b;}throw Error('Unsupported operator');}
 }
 }
 return visit(tree);
}
function clockParts(instant,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function wallTime(value,zone){let nominal=Date.parse(value+'Z');if(!Number.isFinite(nominal))throw Error('Choose a valid date and time');let instant=nominal;for(let i=0;i<4;i++){let p=clockParts(instant,zone),wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);instant+=nominal-wall;}let p=clockParts(instant,zone);if(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)!==nominal)throw Error('This local time does not exist in the selected time zone');return instant;}
class Simulator {
 constructor(model,options){
  if(!model.tree||model.warnings.length)throw Error('A complete script tree is required for simulation');
  this.model=model;this.options=options;this.now=wallTime(options.datetime,options.timezone);this.variables=new Map();this.trace=[];this.pending=null;this.finished=false;this.next=new Map();this.groups=new Map();this.steps=new Map(model.steps.map(s=>[s.id,s]));this.visits=0;
  const sequence=(nodes,after)=>{for(let i=0;i<nodes.length;i++){let n=nodes[i],next=nodes[i+1]?.step?.id??after;if(!n.step)continue;this.next.set(n.step.id,next);this.groups.set(n.step.id,n.groups);for(let g of n.groups)sequence(g.nodes,next);}};
  const roots=model.tree.groups.flatMap(g=>g.nodes);sequence(roots,null);this.current=roots[0]?.step?.id??null;
  let unresolved=[...model.variables];for(let pass=0;pass<model.variables.length&&unresolved.length;pass++){let left=[];for(let v of unresolved){try{this.variables.set(v.name,expression(v.value,this.variables));}catch{left.push(v);}}if(left.length===unresolved.length)break;unresolved=left;}
 }
 set(name,value){if(!/^[A-Za-z_$][\w$]*$/.test(name))throw Error('Choose a valid variable name');this.variables.set(name,value);}
 evaluate(text){return expression(text,this.variables);}
 log(step,message){this.trace.push({id:step?.id,title:step?.title||'',message});}
 branch(step,name){let group=(this.groups.get(step.id)||[]).find(g=>g.name===name);if(!group)throw Error('Branch '+name+' was not found');this.current=group.nodes[0]?.step?.id??this.next.get(step.id);this.log(step,'Branch: '+name);}
 pause(step,message,kind='result'){this.pending={step,message,kind,branches:(this.groups.get(step.id)||[]).map(g=>g.name)};this.log(step,message);return {status:'paused',step};}
 choose(name,value){let p=this.pending;if(!p)throw Error('No choice is pending');if(p.kind==='digits'){if(!p.step.config.inputVariable)throw Error('Input variable could not be decoded');this.set(p.step.config.inputVariable,String(value??''));}this.log(p.step,'Manual outcome: '+(name||'Continue'));this.pending=null;this.branch(p.step,name);return this.current;}
 skip(){if(!this.pending)return;const s=this.pending.step;this.log(s,'Manually skipped; external behavior was not simulated');this.current=this.next.get(s.id);this.pending=null;}
 parts(step){let raw=step.config.timezone||'TZ[primary]',m=raw.match(/^TZ\[([^\]]+)\]$/);if(!m)throw Error('Time zone expression requires a manual choice');let zone=['primary','local'].includes(m[1])?this.options.timezone:m[1];return clockParts(this.now,zone);}
 step(){
  if(this.pending)return {status:'paused',step:this.pending.step};
  if(this.finished||this.current===null||this.current===undefined){this.finished=true;return {status:'finished'};}
  let s=this.steps.get(this.current);if(!s)throw Error('Step was not found');if(++this.visits>2000)return this.pause(s,'Execution limit reached; possible loop. Reset to begin again.','limit');
  const advance=message=>{this.log(s,message);this.current=this.next.get(s.id);return {status:'stepped',step:s};};
  try{
   switch(s.type){
    case 'StepStart':case 'StepLabel':case 'StepComment':return advance(s.summary||s.title);
    case 'StepEnd':this.log(s,'End');this.current=null;this.finished=true;return {status:'finished',step:s};
    case 'StepGoto':{let target=this.model.steps.find(t=>t.label===s.values[0]||(t.type==='StepLabel'&&t.values[0]===s.values[0]));if(!target)throw Error('Goto target was not found');this.current=target.id;this.log(s,'Goto '+s.values[0]);return {status:'stepped',step:s};}
    case 'StepAssign':{let value=this.evaluate(s.values[1]);this.set(s.values[0],value);return advance(s.values[0]+' = '+String(value));}
    case 'StepInc':{let value=this.evaluate(s.values[0]);if(typeof value!=='number')throw Error('Increment requires a number');this.set(s.values[0],value+1);return advance(s.values[0]+' = '+(value+1));}
    case 'StepIf':{let result=this.evaluate(s.values[0]);if(typeof result!=='boolean')throw Error('Condition did not produce a boolean');this.branch(s,result?'True':'False');return {status:'stepped',step:s};}
    case 'DayOfWeekStep':{let p=this.parts(s),day=(new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()+6)%7;let matches=(s.config.days||[]).filter(g=>g.days.length===7&&g.days[day]===true);if(matches.length!==1)throw Error('Day of week has no unique decoded branch');this.branch(s,matches[0].name);return {status:'stepped',step:s};}
    case 'TimeStep':{let p=this.parts(s),ms=(p.hour*3600+p.minute*60+p.second)*1000,groups=s.config.times||[];if(!groups.length||groups.some(g=>g.ranges.some(r=>!r)))throw Error('Time ranges could not be decoded');let matches=groups.filter(g=>g.ranges.some(r=>r.start<=r.end?ms>=r.start&&ms<r.end:ms>=r.start||ms<r.end));let branch;if(matches.length===1)branch=matches[0].name;else if(matches.length===0){let rest=groups.filter(g=>!g.ranges.length);if(rest.length===1)branch=rest[0].name;}if(!branch)throw Error('Time of day has no unique decoded branch');this.branch(s,branch);return {status:'stepped',step:s};}
    case 'StepDelay':{let seconds=this.evaluate(s.values[0]);if(typeof seconds!=='number'||seconds<0)throw Error('Delay requires a nonnegative number');this.now+=seconds*1000;return advance('Advanced simulated clock by '+seconds+' seconds');}
    case 'MenuStep':return this.pause(s,'Choose a menu option.','menu');
    case 'ParseInputStep':return this.pause(s,'Enter simulated digits, then choose the input outcome.','digits');
    case 'GetSessionInfoStep':{let c=s.config;if(c.callerVariable&&c.callerVariable!=='null'&&c.callerVariable!=='')this.set(c.callerVariable,this.options.caller);if(c.calledVariable&&c.calledVariable!=='null'&&c.calledVariable!=='')this.set(c.calledVariable,this.options.called);return advance('Injected simulated calling and called numbers');}
    case 'AcceptStep':return advance('Simulated contact accepted');
    case 'OutputStep':return advance('Prompt: '+s.values.join(' · '));
    case 'TerminateStep':this.log(s,'Simulated contact terminated');this.finished=true;this.current=null;return {status:'finished',step:s};
    default:return this.pause(s,'Supply a simulated result for '+s.title+'.');
   }
  }catch(error){return this.pause(s,error.message);}
 }
}
window.UCCXSimulation={Simulator,expression,wallTime,clockParts};
})();
