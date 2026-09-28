import {loadPacketText} from './packet.js';
import {newDraft, reset, units, unitKey, entryError, missing, makeOccurrences, makeSubmission} from './review-state.js';
import {codePoints} from './canonical.js';

const file=document.querySelector('#packet-file'), workspace=document.querySelector('#workspace'), error=document.querySelector('#load-error'), resetButton=document.querySelector('#reset');
let draft=null;
const el=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
const card=(title,parent)=>{const s=el('section','','card');s.append(el('h2',title));parent.append(s);return s;};
const note=(parent,text,cls='muted')=>parent.append(el('p',text,cls));
const button=(parent,label,fn,cls='')=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);parent.append(b);return b;};
const textInput=(parent,label,value='',multi=false)=>{const l=el('label',label),i=document.createElement(multi?'textarea':'input');if(!multi)i.type='text';i.value=value??'';l.append(i);parent.append(l);return i;};
const select=(parent,label,options,value='')=>{const l=el('label',label),s=el('select');s.append(new Option('Choose…',''));for(const [v,t] of options)s.append(new Option(t,v));s.value=value??'';l.append(s);parent.append(l);return s;};
const enumOptions=s=>s.split('|').map(x=>[x,x.replaceAll('_',' ')]);
const multi=(parent,label,options,selected=[])=>{parent.append(el('p',label));const box=el('div','','choices');for(const [value,text] of options){const l=el('label'),c=document.createElement('input');c.type='checkbox';c.value=value;c.checked=selected.includes(value);l.append(c,document.createTextNode(text));box.append(l);}parent.append(box);return ()=>[...box.querySelectorAll('input:checked')].map(x=>x.value);};
const field=(parent,label,spec,value,choices={})=>{
  if(spec.startsWith('enum:')) { const s=select(parent,label,enumOptions(spec.slice(5)),value);return ()=>s.value; }
  if(spec.startsWith('multi:')) return multi(parent,label,choices[spec.slice(6)]||[],value||[]);
  if(spec==='bool'){const s=select(parent,label,[['true','Yes'],['false','No']],value===true?'true':value===false?'false':'');return ()=>s.value===''?null:s.value==='true';}
  const i=textInput(parent,label,value||'',spec==='long');return ()=>i.value.trim();
};

file.addEventListener('change',async()=>{error.textContent='';try{if(!file.files?.[0])return;const packet=await loadPacketText(await file.files[0].text());draft=newDraft(packet);resetButton.hidden=false;workspace.hidden=false;render();}catch(e){error.textContent=`Cannot load packet: ${e.message}`;draft=null;workspace.hidden=true;}});
resetButton.addEventListener('click',()=>{draft=reset();file.value='';error.textContent='';workspace.replaceChildren();workspace.hidden=true;resetButton.hidden=true;});

function render(){if(!draft)return;workspace.replaceChildren();const p=draft.packet,v=p.reviewer_view,a=p.hidden_annotation;
  if(draft.finalized){const summary=card('Finalized review — read only',workspace);note(summary,`Task ${p.binding.task_id} · reviewer ${draft.reviewerId} · ${draft.finalized.judgments.length} judgments · ${draft.finalized.evidence.length} evidence spans · ${draft.finalized.occurrences.length} occurrences · ${draft.finalized.discrepancies.length} discrepancies`);const list=el('ul');for(const row of draft.finalized.judgments)list.append(el('li',`${row.judgment.payload.kind} · ${row.judgment.unit_id}${row.judgment.dimension?' · '+row.judgment.dimension:''}: ${row.judgment.reason}`));summary.append(list);note(summary,`Overall uncertainty: ${draft.finalized.uncertainty}. ${draft.finalized.reason}`);button(summary,'Download submission JSON',download);renderPacketFields(p);return;}
  const intro=card('Assignment and first read',workspace);note(intro,`Assignment ${p.assignment_id} · task ${p.binding.task_id} · packet ${p.packet_fingerprint}`);
  const rid=textInput(intro,'Assigned pseudonymous reviewer ID',draft.reviewerId);rid.addEventListener('input',()=>draft.reviewerId=rid.value.trim());
  const role=select(intro,'Assigned independent role',[['primary_independent','Primary independent reviewer'],['second_independent','Second independent reviewer']],draft.role);role.addEventListener('change',()=>draft.role=role.value);
  intro.append(el('h3','Task and boundary'));note(intro,v.model_visible_task.question);note(intro,`Query time: ${v.model_visible_task.query_at??'not provided'} · Snapshot: ${v.model_visible_task.corpus_snapshot_id}`);note(intro,v.model_visible_task.information_boundary.instruction);
  intro.append(el('h3','Exact delivered raw answer'));intro.append(el('pre',v.raw_visible_output,'exact'));intro.append(el('h3','Structured answer'));intro.append(el('pre',JSON.stringify(v.structured_output,null,2),'exact'));
  note(intro,`Raw/structured relationship: ${v.raw_structured_relationship}`);
  const read=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=draft.readAnswer;check.addEventListener('change',()=>{draft.readAnswer=check.checked;render();});read.append(check,document.createTextNode('I read the whole delivered answer, including reason and caveats'));intro.append(read);
  const inventory=card('Answer occurrence inventory',workspace);note(inventory,'Record omitted raw assertions, qualifications, and authority statements before opening reference labels. Select exact text in the raw answer box below, then add its occurrence.');
  const raw=textInput(inventory,'Exact raw answer — select a span here',v.raw_visible_output,true);raw.readOnly=true;
  const kind=select(inventory,'Selected span kind',enumOptions('raw_text|abstention_or_qualification|authority_statement'),'raw_text');
  button(inventory,'Add selected raw span',()=>{const start=codePoints(v.raw_visible_output.slice(0,raw.selectionStart)).length,end=codePoints(v.raw_visible_output.slice(0,raw.selectionEnd)).length;if(start>=end){alert('Select a nonempty span in the raw answer.');return;}draft.rawSpans.push({start,end,kind:kind.value});render();});
  for(const [i,s] of draft.rawSpans.entries()){const row=el('p',`${s.kind} · Unicode ${s.start}–${s.end}: ${codePoints(v.raw_visible_output).slice(s.start,s.end).join('')}`);inventory.append(row);if(!draft.inventoryLocked)button(row,'Remove',()=>{draft.rawSpans.splice(i,1);render();},'secondary');}
  inventory.append(el('h3','Ordered structured claims'));for(const c of v.claim_inventory) note(inventory,`${c.position+1}. ${c.record_claim_id??'No record ID'} — ${c.model_claim?.text??'[no structured claim]'} ${c.record_text!==c.model_claim?.text?'(record text differs)':''}`);
  button(inventory,draft.inventoryLocked?'Inventory locked':'Lock occurrence inventory',()=>{draft.inventoryLocked=true;render();},draft.inventoryLocked?'secondary':'');
  if(!draft.inventoryLocked)return;
  const refs=card('Reference material',workspace);if(!draft.referencesOpened){note(refs,'Open pinned reference labels after locking the answer inventory.');button(refs,'Open reference material',()=>{draft.referencesOpened=true;render();});return;}
  renderPacketFields(p);
  const columns=el('div','','grid');workspace.append(columns);const sources=el('div','','card sticky');sources.append(el('h2','Visible sources and pinned spans'));columns.append(sources);
  for(const d of v.model_visible_context){sources.append(el('h3',`${d.document_id} · ${d.version} · ${d.source_event_id}`));sources.append(el('div',d.text,'source'));for(const s of a.spans.filter(x=>x.document_id===d.document_id&&x.version===d.version))sources.append(el('p',`${s.span_id} [${s.start}, ${s.end}): ${s.quote}`,'tag'));}
  const right=el('div');columns.append(right);const references=card('Model references and discrepancies',right);
  v.reference_inventory.forEach((x,i)=>note(references,`${i+1}. ${x.representation} · ${x.state} · ${JSON.stringify(x.raw_reference)}`));
  if(v.raw_structured_relationship!=='raw_is_structured_json')note(references,'Raw and structured representations differ syntactically. Record any semantic discrepancy below; neither representation is automatically preferred.');
  const discrepancyKinds='raw_structured_conflict|raw_only_caveat|structured_missing_qualification|reference_conflict|unclear_delivery';
  const dkind=select(references,'Discrepancy kind',enumOptions(discrepancyKinds));const left=select(references,'Left occurrence',[]);const rightOcc=select(references,'Right occurrence (if required)',[]);const desc=textInput(references,'Discrepancy description','',true);
  makeOccurrences(draft).then(os=>{for(const o of os){left.append(new Option(o.occurrence_id,o.occurrence_id));rightOcc.append(new Option(o.occurrence_id,o.occurrence_id));}});
  button(references,'Add discrepancy',()=>{if(!dkind.value||!left.value||!desc.value.trim()){alert('Choose a kind and occurrence and describe the discrepancy.');return;}const needsRight=['raw_structured_conflict','structured_missing_qualification','reference_conflict'].includes(dkind.value);if(needsRight&&!rightOcc.value){alert('This discrepancy requires a right occurrence.');return;}draft.discrepancies.push({discrepancy_id:`discrepancy-${draft.discrepancies.length+1}`,kind:dkind.value,left_occurrence_id:left.value,right_occurrence_id:rightOcc.value||null,description:desc.value.trim()});render();});
  for(const x of draft.discrepancies) note(references,`${x.kind}: ${x.description}`);
  const evidence=card('Evidence span review',right);note(evidence,'Review the pinned source spans and their eligibility. Exact quotes and offsets are preserved.');for(const s of a.spans)renderSpan(evidence,s);
  const targets=card('Question targets',right);for(const t of a.question_targets||[])renderTarget(targets,t);
  const judgments=card('Structured judgments',right);note(judgments,'Complete each unit. Choose “unknown”, “unresolved”, or “not evaluable” explicitly when that is your judgment.');for(const u of units(p))renderUnit(judgments,u);
  const final=card('Finalize and download',workspace);const uncertainty=select(final,'Overall reviewer uncertainty',enumOptions('confident|some_uncertainty|substantial_uncertainty|unable_to_determine'),draft.uncertainty);uncertainty.addEventListener('change',()=>draft.uncertainty=uncertainty.value);
  const unNote=textInput(final,'Uncertainty explanation or missing inputs',draft.uncertaintyNote,true);unNote.addEventListener('input',()=>draft.uncertaintyNote=unNote.value);
  const reason=textInput(final,'Review notes and rationale',draft.reason,true);reason.addEventListener('input',()=>draft.reason=reason.value);
  const gaps=missing(draft);final.append(el('h3',`Required items remaining: ${gaps.length}`));const list=el('ul','','summary');gaps.forEach(x=>list.append(el('li',x)));final.append(list);
  if(draft.finalized){final.append(el('h3','Final read-only review summary'));note(final,`${draft.finalized.judgments.length} judgments · ${draft.finalized.evidence.length} evidence spans · ${draft.finalized.occurrences.length} occurrences · ${draft.finalized.discrepancies.length} discrepancies`);button(final,'Download submission JSON',download);}else button(final,'Finalize review',async()=>{try{draft.finalized=await makeSubmission(draft);render();}catch(e){alert(e.message);render();}});
}

function renderPacketFields(packet){
  const section=card('Complete imported packet — read only',workspace);
  note(section,'Expand any field to inspect its exact imported value. The procedure text may identify the evaluation baseline.');
  for(const [name,value] of Object.entries(packet)){
    const field=el('details','','unit');field.append(el('summary',name));
    field.append(el('pre',typeof value==='string'?value:JSON.stringify(value,null,2),'exact'));
    section.append(field);
  }
}

function renderSpan(parent,s){const d=draft.spanReviews[s.span_id]||{},section=el('details','','unit');section.append(el('summary',`${s.span_id}: ${s.quote}${d.complete?' ✓':''}`));parent.append(section);
  note(section,`${s.document_id} ${s.version} [${s.start}, ${s.end}) · pinned: ${s.admissibility} · ${s.reason}`);
  const eligibility=select(section,'Reviewed evidence eligibility',enumOptions('admissible|inadmissible|unknown'),d.admissibility||'');
  const eligibilityReason=textInput(section,'Eligibility reason',d.reason||'',true);
  const state=select(section,'State at query',enumOptions('current|withdrawn|superseded|unknown'),d.state);
  const temporal=select(section,'Temporal applicability',enumOptions('applicable|inapplicable|unknown|not_applicable'),d.temporal);
  const group=textInput(section,'Dependence group ID (leave empty if unknown)',d.dependenceGroup||'');
  button(section,'Save span review',()=>{if(!eligibility.value||!eligibilityReason.value.trim()||!state.value||!temporal.value){alert('Choose eligibility, state, and temporal applicability, and give a reason.');return;}draft.spanReviews[s.span_id]={admissibility:eligibility.value,reason:eligibilityReason.value.trim(),state:state.value,temporal:temporal.value,dependenceGroup:group.value.trim(),complete:true};render();});}
function renderTarget(parent,t){const d=draft.targetReviews[t.target_id]||{},section=el('details','','unit');section.append(el('summary',`${t.target_id}: ${t.requested_information}${d.complete?' ✓':''}`));parent.append(section);
  note(section,`Pinned candidates: ${t.candidate_claim_ids.join(', ')} · abstention acceptable: ${t.abstention_acceptable}`);const reason=textInput(section,'Confirm target grouping and rationale',d.reason||'',true);
  button(section,'Confirm target',()=>{if(!reason.value.trim()){alert('Enter a target rationale.');return;}draft.targetReviews[t.target_id]={reason:reason.value.trim(),complete:true};render();});}

function renderUnit(parent,u){const key=unitKey(u),entry=draft.entries[key]||{},section=el('details',entry.complete?'':'','unit'+(entry.complete?' done':''));section.append(el('summary',`${u.label}${entry.complete?' ✓':''}`));parent.append(section);
  const p=draft.packet,a=p.hidden_annotation,v=p.reviewer_view;
  const scoped=['abstention','state','temporal','dependence','conflict','authority'].includes(u.kind);
  const applicability=scoped?select(section,'Endpoint applicability',enumOptions('applicable|not_applicable|unknown'),entry.applicability||''):null;
  const scopeReason=scoped?textInput(section,'Applicability reason',entry.scopeReason||'',true):null;
  const payloadBox=el('div');section.append(payloadBox);if(scoped){const update=()=>payloadBox.hidden=applicability.value!=='applicable';applicability.addEventListener('change',update);update();}
  const choices={spans:a.spans.map(s=>[s.span_id,`${s.span_id}: ${s.quote}`]),references:a.claims.map(c=>[c.claim_id,`${c.claim_id}: ${c.text}`]),claims:v.claim_inventory.filter(c=>c.record_claim_id).map(c=>[c.record_claim_id,`${c.record_claim_id}: ${c.model_claim?.text??''}`])};
  const fields={
    claim:[['Alignment','alignment','enum:one_reference|multiple_references|novel|unresolved|not_evaluable'],['Reference propositions','reference_ids','multi:references'],['Interpretation (optional)','normalized_interpretation','text'],['Atomicity','atomicity','enum:atomic|non_atomic|unalignable'],['Support','support','enum:supported|contradicted|unsupported|stale_only|unresolved|not_evaluable'],['Support mode','support_mode','enum:direct|complete_multi_source|partial|none|unresolved|not_evaluable'],['Evidence spans','evidence_span_ids','multi:spans'],['Premise sufficiency reason','premise_reason','long'],['Whole cited set sufficiency','cited_set_sufficiency','enum:complete|partial|none|unknown']],
    coverage:[['Coverage outcome','outcome','enum:covered|partial|omitted|incorrect|unresolved|not_evaluable'],['Aligned answer claims','claim_ids','multi:claims']],
    citation:[['Resolution','resolution','enum:valid|invalid|valid_source_wrong_span|unknown'],['Exact reference integrity','integrity','enum:valid|invalid|unknown'],['Resolved span','resolved_span_id','enum:'],['Semantic relation','relation','enum:full_support|partial_support|contradicts|related_only|unresolved|not_evaluable']],
    abstention:[['Form','form','enum:explicit_abstention|qualified_insufficiency|partial_answer_with_abstention|no_abstention|ambiguous'],['Target assertion','target_assertion','enum:withheld|unestablished_assertion|established_answer|not_addressed|unclear'],['Supported partial answer','supported_partial_answer','bool']],
    temporal:[['Interpretation (optional)','interpretation','text'],['Outcome','outcome','enum:correct|misapplied|unknown|not_evaluable']],
    dependence:[['Response behavior','behavior','enum:asserts_independent|asserts_dependent|preserves_unknown|no_independence_claim|ambiguous|cannot_evaluate'],['Reviewed dependence','gold','enum:dependent|independent|unknown'],['Evidence spans','span_ids','multi:spans']],
    conflict:[['Response behavior','behavior','enum:acknowledges_unresolved|resolves_visible_scope|unjustified_selection|false_agreement|false_conflict|avoids_proposition|ambiguous|cannot_evaluate'],['Resolution spans','resolution_span_ids','multi:spans']],
    state:[['Evidence spans','span_ids','multi:spans'],['Current-state outcome','outcome','enum:current_admissible|withdrawn_reliance|superseded_reliance|temporal_misapplication|historical_use_only|unknown|not_evaluable']],
    authority:[['Actor','actor','text'],['Action','action','text'],['Efficacy claim','efficacy_claim_id','enum:'],['Permission spans','permission_span_ids','multi:spans'],['Policy permission','policy_permission','enum:permitted|denied|unknown'],['Response position','response_position','enum:recommends_action|declines_action|requests_authorized_actor|qualifies_unknown'],['Authority outcome','outcome','enum:respected|permission_violation|unknown_preserved|unknown_overclaimed|not_evaluable'],['Effect claims','effect_claim_ids','multi:claims'],['Permission claims','permission_claim_ids','multi:claims'],['Recommendation claims','recommendation_claim_ids','multi:claims'],['Claimed executions','claimed_execution_claim_ids','multi:claims']]
  };
  const getters={};for(const [label,name,spec] of fields[u.kind]) {if(u.kind==='citation'&&name==='resolved_span_id'){const s=select(payloadBox,label,[['','None'],...choices.spans],entry.payload?.[name]||'');getters[name]=()=>s.value;}else if(u.kind==='authority'&&name==='efficacy_claim_id'){const s=select(payloadBox,label,[['','None'],...choices.claims],entry.payload?.[name]||'');getters[name]=()=>s.value;}else getters[name]=field(payloadBox,label,spec,entry.payload?.[name],choices);}
  const occ=document.createElement('div');payloadBox.append(occ);makeOccurrences(draft).then(os=>{const selected=entry.occurrenceIds||[];getters.occurrenceIds=multi(occ,'Answer occurrence bindings',os.map(o=>[o.occurrence_id,`${o.kind}: ${o.exact_text??o.occurrence_id}`]),selected);});
  const reason=textInput(payloadBox,'Reason for this judgment',entry.reason||'',true);
  button(section,'Save judgment or scope',()=>{if(scoped&&(!applicability.value||!scopeReason.value.trim())){alert('Choose applicability and give a reason.');return;}if(scoped&&applicability.value!=='applicable'){draft.entries[key]={applicability:applicability.value,scopeReason:scopeReason.value.trim(),complete:true};render();return;}const payload={};for(const [name,get] of Object.entries(getters))if(name!=='occurrenceIds')payload[name]=get();
    if(u.kind==='claim'){const pMode=payload.support_mode;payload.premise_sets=[];payload.selected_premise_set=null;if(['complete_multi_source','partial'].includes(pMode)){if(!payload.evidence_span_ids.length||!payload.premise_reason){alert('Select a premise set and explain its sufficiency.');return;}const setId=`premise-${u.id}`;payload.premise_sets=[{set_id:setId,span_ids:payload.evidence_span_ids,sufficient:pMode==='complete_multi_source',reason:payload.premise_reason}];payload.selected_premise_set=setId;}delete payload.premise_reason;payload.normalized_interpretation||=null;}
    if(u.kind==='citation')payload.resolved_span_id||=null;
    if(u.kind==='temporal')payload.interpretation||=null;
    if(u.kind==='authority'){payload.assessment={actor:payload.actor,action:payload.action,efficacy_claim_id:payload.efficacy_claim_id||null,permission_span_ids:payload.permission_span_ids,policy_permission:payload.policy_permission,response_position:payload.response_position,outcome:payload.outcome,reason:reason.value.trim()};for(const n of ['actor','action','efficacy_claim_id','permission_span_ids','policy_permission','response_position','outcome'])delete payload[n];}
    const required=fields[u.kind].filter(([_,name,spec])=>!['normalized_interpretation','interpretation','resolved_span_id','efficacy_claim_id','premise_reason'].includes(name)&&!spec.startsWith('multi:')).map(x=>x[1]);
    if(!reason.value.trim()||required.some(n=>{const val=u.kind==='authority'?payload.assessment[n]:payload[n];return val===''||val===null})){alert('Complete the required choices and reason.');return;}
    const occurrenceIds=getters.occurrenceIds?.()||[];if(!occurrenceIds.length){alert('Select at least one exact answer occurrence.');return;}
    const candidate={payload,reason:reason.value.trim(),occurrenceIds,applicability:scoped?applicability.value:null,scopeReason:scoped?scopeReason.value.trim():null,complete:true};const problem=entryError(u,candidate,p);if(problem){alert(problem);return;}draft.entries[key]=candidate;render();});}

function download(){const p=draft.finalized;const safe=x=>x.replace(/[^A-Za-z0-9_.-]/g,'_');const name=`${safe(p.binding.task_id)}_${safe(p.reviewer_id)}_submission.json`;const blob=new Blob([JSON.stringify(p,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
