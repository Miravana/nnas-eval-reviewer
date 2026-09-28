import {hashObject, sha256, codePoints, sliceUnicode} from './canonical.js';

export function newDraft(packet) { return {packet, reviewerId:'', role:'primary_independent', readAnswer:false, inventoryLocked:false, referencesOpened:false, rawSpans:[], entries:{}, spanReviews:{}, targetReviews:{}, scopes:{}, discrepancies:[], uncertainty:'', uncertaintyNote:'', reason:'', finalized:null}; }
export function reset() { return null; }
export function units(packet) {
  const v=packet.reviewer_view,a=packet.hidden_annotation;
  const claim=v.claim_inventory.filter(x=>x.record_claim_id).map(x=>({kind:'claim',id:x.record_claim_id,label:`Claim ${x.position+1}: ${x.model_claim?.text??x.record_text??'[raw answer binding required]'}`,position:x.position}));
  const coverage=a.claims.filter(x=>x.answer_relevance==='required' && x.evidence_status==='supported').map(x=>({kind:'coverage',id:x.claim_id,label:`Required reference: ${x.text}`}));
  const citation=v.reference_inventory.map((x,i)=>({kind:'citation',id:`ref-${i}`,index:i,label:`Reference ${i+1}: ${JSON.stringify(x.raw_reference)}`})).filter(x=>!['none','not_provided'].includes(v.reference_inventory[x.index].state));
  const targets=(a.question_targets||[]).map(x=>({kind:'abstention',id:x.target_id,label:`Target: ${x.requested_information}`}));
  const state=v.model_visible_task.documents.map(x=>({kind:'state',id:`${x.document_id}/${x.version}`,label:`Current state: ${x.document_id} ${x.version}`}));
  const temporal=targets.flatMap(x=>['publication_version','proposition_applicability','query_time'].map(d=>({kind:'temporal',id:x.id,dimension:d,label:`${x.label} — ${d}`})));
  const dependence=a.source_states.some(x=>x.dependence_status==='known') ? [{kind:'dependence',id:bId(packet),label:'Dependence handling'}] : [];
  const conflict=a.claims.some(x=>x.evidence_status==='unresolved' || x.span_judgments.some(j=>j.relation==='contradicts')) ? [{kind:'conflict',id:bId(packet),label:'Conflict handling'}] : [];
  const authority=a.authority.status!=='not_applicable' ? [{kind:'authority',id:bId(packet),label:'Authority and permission'}] : [];
  return [...claim,...citation,...coverage,...targets,...state,...temporal,...dependence,...conflict,...authority];
}
const bId=p=>p.binding.task_id;
export const unitKey=u=>`${u.kind}|${u.id}|${u.dimension||''}`;
export const endpoint={state:'current_state',temporal:'temporal',dependence:'dependence',conflict:'conflict',authority:'authority',abstention:'abstention'};
export function entryError(u,e,packet) {
  if(!e?.complete)return 'No saved review';
  if(endpoint[u.kind] && !['applicable','not_applicable','unknown'].includes(e.applicability))return 'Choose applicability';
  if(endpoint[u.kind] && !e.scopeReason?.trim())return 'Explain applicability';
  if(e.applicability==='not_applicable'||e.applicability==='unknown')return null;
  const x=e.payload;
  if(!x||!e.reason?.trim()||!e.occurrenceIds?.length)return 'Provide a judgment, reason, and occurrence binding';
  if(new Set(e.occurrenceIds).size!==e.occurrenceIds.length)return 'Occurrence bindings must be distinct';
  const spanIds=new Set(packet.hidden_annotation.spans.map(s=>s.span_id));
  const refs=new Set(packet.hidden_annotation.claims.map(c=>c.claim_id));
  const claims=new Set(packet.reviewer_view.claim_inventory.map(c=>c.record_claim_id).filter(Boolean));
  const known=(values,set)=>Array.isArray(values)&&values.every(v=>set.has(v))&&new Set(values).size===values.length;
  if(u.kind==='claim'){
    if(!known(x.reference_ids,refs)||!known(x.evidence_span_ids,spanIds))return 'Unknown or duplicate reference/evidence ID';
    if(x.alignment==='one_reference'&&x.reference_ids.length!==1||x.alignment==='multiple_references'&&x.reference_ids.length<2||['novel','unresolved','not_evaluable'].includes(x.alignment)&&x.reference_ids.length)return 'Alignment and reference IDs disagree';
    if(['unresolved','not_evaluable'].includes(x.alignment)&&x.support!=='not_evaluable')return 'Unresolved alignment requires not evaluable support';
    if((x.atomicity!=='atomic'||['unresolved','not_evaluable'].includes(x.alignment))&&x.support!=='not_evaluable')return 'Non-atomic or unaligned claim is not evaluable';
    if(['supported','stale_only'].includes(x.support)&&(!['direct','complete_multi_source'].includes(x.support_mode)||!x.evidence_span_ids.length))return 'Supported or stale-only claim needs complete witness evidence';
    if(x.support_mode==='complete_multi_source'&&x.evidence_span_ids.length<2)return 'Multi-source support needs at least two spans';
    if(x.support_mode==='partial'&&x.support!=='unsupported')return 'Partial premises imply unsupported full claim';
    if(['unresolved','not_evaluable'].includes(x.support)&&x.support_mode!==x.support)return 'Uncertainty must use matching support mode';
    if(['complete_multi_source','partial'].includes(x.support_mode)){
      const chosen=x.premise_sets?.find(p=>p.set_id===x.selected_premise_set);
      if(!chosen||!known(chosen.span_ids,spanIds)||chosen.span_ids.length!==x.evidence_span_ids.length||!chosen.span_ids.every(v=>x.evidence_span_ids.includes(v))||chosen.sufficient!==(x.support_mode==='complete_multi_source')||!chosen.reason?.trim())return 'Selected premise set must match the evidence and sufficiency choice';
    }
  }
  if(u.kind==='coverage'&&(!known(x.claim_ids,claims)||x.outcome==='covered'&&!x.claim_ids.length))return 'Coverage needs valid aligned answer claim IDs';
  if(u.kind==='citation'&&((x.integrity==='valid')!==(x.resolved_span_id!==null)||x.resolved_span_id&&!spanIds.has(x.resolved_span_id)||x.resolution!=='valid_source_wrong_span'&&x.resolution!==x.integrity||x.resolution==='valid_source_wrong_span'&&x.relation==='full_support'))return 'Citation resolution, integrity, span, or relation disagree';
  if(u.kind==='abstention'&&x.form==='partial_answer_with_abstention'&&!x.supported_partial_answer)return 'Partial answer form requires a supported partial answer';
  if(u.kind==='dependence'&&!known(x.span_ids,spanIds))return 'Dependence spans are invalid';
  if(u.kind==='conflict'&&(!known(x.resolution_span_ids,spanIds)||x.behavior==='resolves_visible_scope'&&!x.resolution_span_ids.length))return 'Conflict resolution needs valid source spans';
  if(u.kind==='state'&&!known(x.span_ids,spanIds))return 'Current-state spans are invalid';
  if(u.kind==='authority'){
    const a=x.assessment;
    if(!a?.actor?.trim()||!a?.action?.trim()||!a.reason?.trim()||!known(a.permission_span_ids,spanIds)||a.efficacy_claim_id&&!claims.has(a.efficacy_claim_id))return 'Authority assessment is incomplete';
    if(['effect_claim_ids','permission_claim_ids','recommendation_claim_ids','claimed_execution_claim_ids'].some(k=>!known(x[k],claims)))return 'Authority claim IDs are invalid';
    if(a.outcome==='permission_violation'&&(a.policy_permission!=='denied'||a.response_position!=='recommends_action'))return 'Permission violation requires denied policy and recommendation';
    if(a.outcome?.startsWith('unknown_')&&a.policy_permission!=='unknown')return 'Unknown authority outcome requires unknown permission';
  }
  return null;
}
export function missing(draft) {
  const result=[];
  if (!draft.packet) return ['Load a packet'];
  if (draft.reviewerId!==draft.packet.reviewer_id) result.push('Enter the assigned reviewer ID exactly');
  if (!draft.readAnswer) result.push('Confirm the delivered answer was read');
  if (!draft.inventoryLocked) result.push('Lock the answer occurrence inventory');
  if (!draft.referencesOpened) result.push('Open the reference material after locking the inventory');
  for (const u of units(draft.packet)) {const err=entryError(u,draft.entries[unitKey(u)],draft.packet);if(err)result.push(`${u.label}: ${err}`);}
  for (const s of draft.packet.hidden_annotation.spans) if (!draft.spanReviews[s.span_id]?.complete) result.push(`Evidence span ${s.span_id}`);
  for (const t of draft.packet.hidden_annotation.question_targets||[]) if (!draft.targetReviews[t.target_id]?.complete) result.push(`Confirm target ${t.target_id}`);
  if (!draft.uncertainty) result.push('Overall uncertainty');
  if (!draft.uncertaintyNote.trim()) result.push('Uncertainty explanation');
  if (!draft.reason.trim()) result.push('Review notes');
  return result;
}

function reviewer(d) { return {reviewer_id:d.reviewerId,reviewer_type:'human',role:d.role,round:1,rubric_version:d.packet.binding.rubric_version,at:null,confidence:null,uncertainty:`${d.uncertainty}: ${d.uncertaintyNote.trim()}`,mode:'independent',adjudicates:[]}; }
export async function makeOccurrences(d) {
  const v=d.packet.reviewer_view, out=[];
  async function add(o,value) { out.push({...o,value_fingerprint:await (typeof value==='string'?sha256(value):hashObject(value))}); }
  const raw=v.raw_visible_output;
  if (codePoints(raw).length) await add({occurrence_id:'answer',kind:'whole_answer',surface:'raw_visible_output',claim_id:null,position:null,reference_index:null,start:0,end:codePoints(raw).length,exact_text:raw},raw);
  for (const c of v.claim_inventory) if(c.record_claim_id && c.model_claim && typeof c.model_claim.text==='string') await add({occurrence_id:`claim-${c.position}`,kind:'structured_claim',surface:'structured_claim',claim_id:c.record_claim_id,position:c.position,reference_index:null,start:null,end:null,exact_text:c.model_claim.text},c.model_claim);
  for (const [i,r] of v.reference_inventory.entries()) if(!['none','not_provided'].includes(r.state)) await add({occurrence_id:`ref-${i}`,kind:'model_reference',surface:'model_reference',claim_id:r.claim_id??(r.claim_position===null?null:v.claim_inventory[r.claim_position]?.record_claim_id??null),position:null,reference_index:i,start:null,end:null,exact_text:null},r);
  if (typeof v.structured_output?.reason==='string') await add({occurrence_id:'reason',kind:'abstention_or_qualification',surface:'structured_reason',claim_id:null,position:null,reference_index:null,start:null,end:null,exact_text:v.structured_output.reason},v.structured_output.reason);
  for (const [i,s] of d.rawSpans.entries()) { const exact=sliceUnicode(raw,s.start,s.end); await add({occurrence_id:`raw-${i+1}`,kind:s.kind,surface:'raw_visible_output',claim_id:null,position:null,reference_index:null,start:s.start,end:s.end,exact_text:exact},exact); }
  return out;
}
export async function makeSubmission(d) {
  const gaps=missing(d); if(gaps.length) throw Error(`Resolve ${gaps.length} required items before finalizing.`);
  const p=d.packet,r=reviewer(d),occurrences=await makeOccurrences(d),allIds=occurrences.map(x=>x.occurrence_id);
  const judgmentRows=[];
  const scopes=[];
  for (const u of units(p)) {
    const e=d.entries[unitKey(u)], id=`j-${judgmentRows.length+1}`;
    if(endpoint[u.kind]) scopes.push({endpoint:endpoint[u.kind],unit_id:u.id,dimension:u.dimension||null,applicability:e.applicability,reviewer:r,reason:e.scopeReason});
    if(e.applicability==='not_applicable' || e.applicability==='unknown') continue;
    const occurrenceIds=e.occurrenceIds?.length?e.occurrenceIds:[u.kind==='claim'?`claim-${u.position}`:u.kind==='citation'?u.id:'answer'];
    if (!occurrenceIds.every(x=>allIds.includes(x))) throw Error(`${u.label}: occurrence binding is missing.`);
    judgmentRows.push({judgment:{judgment_id:id,unit_id:u.kind==='citation'?u.id:u.id,dimension:u.dimension||null,reviewer:r,payload:{kind:u.kind,...e.payload},reason:e.reason},occurrence_ids:occurrenceIds});
  }
  const evidence=p.hidden_annotation.spans.map(s=>{const x=d.spanReviews[s.span_id];return {span:{...s,admissibility:x.admissibility,reason:x.reason},origin:'annotation_span',state:x.state,temporal:x.temporal,dependence_group:x.dependenceGroup||null,reviewer:r};});
  const targets=(p.hidden_annotation.question_targets||[]).map(t=>({target_id:t.target_id,candidate_claim_ids:t.candidate_claim_ids,abstention_acceptable:t.abstention_acceptable,reviewer:r,reason:d.targetReviews[t.target_id].reason}));
  const base={schema_version:'nnas-eval-human-submission/1',submission_id:'',packet_fingerprint:p.packet_fingerprint,binding:p.binding,reviewer_id:d.reviewerId,role:d.role,round:1,status:'submitted',uncertainty:d.uncertainty,supersedes_submission_id:null,supersedes_fingerprint:null,adjudicates_submission_ids:[],disagreement_fields:[],resolutions:[],metadata_resolution:null,metadata_reason:null,occurrences,discrepancies:d.discrepancies,judgments:judgmentRows,evidence,targets,scope:scopes,reason:d.reason.trim()};
  base.submission_id=`${p.assignment_id.slice(0,160)}-submission-${(await hashObject({...base,submission_id:null})).slice(0,12)}`;
  return base;
}
