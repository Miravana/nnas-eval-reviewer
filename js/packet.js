import {canonical, hashObject, sha256, sliceUnicode} from './canonical.js';

export const VERSIONS = Object.freeze({packet:'nnas-eval-reviewer-packet/1',projection:'nnas-eval-review-projection/1',procedure:'nnas-eval-human-review/1',submission:'nnas-eval-human-submission/1'});
const id = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(s);
const digest = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
function requireValue(ok,message) { if (!ok) throw Error(message); }
export function deepFreeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; }
export async function validatePacket(packet) {
  requireValue(packet && !Array.isArray(packet) && typeof packet === 'object','Packet must be a JSON object.');
  requireValue(Object.keys(packet).sort().join('|') === ['schema_version','assignment_id','reviewer_id','binding','reviewer_view','hidden_annotation','procedure_text','packet_fingerprint'].sort().join('|'),'Packet has missing or unexpected top-level fields.');
  requireValue(packet.schema_version === VERSIONS.packet,`Unsupported packet version: ${String(packet.schema_version)}.`);
  requireValue(id(packet.assignment_id) && id(packet.reviewer_id),'Packet assignment or reviewer ID is invalid.');
  const b=packet.binding, v=packet.reviewer_view, a=packet.hidden_annotation;
  requireValue(b && v && a && typeof packet.procedure_text === 'string','Packet is missing binding, reviewer view, annotation, or procedure.');
  const bindingKeys=['task_id','task_fingerprint','model_visible_task_fingerprint','projection_version','projection_fingerprint','evaluation_record_fingerprint','run_id','response_fingerprint','procedure_version','procedure_document_sha256','rubric_version','rubric_fingerprint','annotation_version','annotation_fingerprint','scoring_fingerprint'];
  requireValue(Object.keys(b).sort().join('|')===bindingKeys.sort().join('|'),'Packet binding has missing or unexpected fields.');
  const viewKeys=['model_visible_task','model_visible_task_raw_text','model_visible_system_prompt','model_visible_context','answer_available_for_semantic_review','raw_visible_output','structured_output','raw_structured_relationship','recorded_response','claim_inventory','reference_inventory','recorded_citations'];
  requireValue(Object.keys(v).sort().join('|')===viewKeys.sort().join('|'),'Reviewer view has missing or unexpected fields.');
  requireValue(b.projection_version === VERSIONS.projection && b.procedure_version === VERSIONS.procedure,'Unsupported projection or review procedure version.');
  requireValue(a.schema_version === 'nnas-pilot-annotation/1','Unsupported annotation version.');
  for (const key of ['task_fingerprint','model_visible_task_fingerprint','projection_fingerprint','evaluation_record_fingerprint','response_fingerprint','procedure_document_sha256','rubric_fingerprint','annotation_fingerprint','scoring_fingerprint']) requireValue(digest(b[key]),`Invalid or missing binding.${key}.`);
  requireValue(id(b.task_id) && id(b.run_id) && id(b.rubric_version),'Invalid task, run, or rubric ID.');
  const copy={...packet}; delete copy.packet_fingerprint;
  requireValue(digest(packet.packet_fingerprint) && await hashObject(copy) === packet.packet_fingerprint,'Packet fingerprint mismatch.');
  requireValue(await hashObject(a) === b.annotation_fingerprint,'Annotation fingerprint mismatch.');
  requireValue(await hashObject(a.rubric) === b.rubric_fingerprint && a.rubric.version === b.rubric_version,'Rubric binding mismatch.');
  requireValue(await sha256(packet.procedure_text) === b.procedure_document_sha256,'Procedure text fingerprint mismatch.');
  requireValue(a.task_id === b.task_id && a.task_fingerprint === b.task_fingerprint,'Annotation task binding mismatch.');
  requireValue(v.answer_available_for_semantic_review === true && typeof v.raw_visible_output === 'string' && v.structured_output && typeof v.structured_output === 'object','No successful delivered answer is available for semantic review.');
  requireValue(v.model_visible_task && v.model_visible_task.task_id === b.task_id,'Visible task ID mismatch.');
  requireValue(await hashObject(v.model_visible_task) === b.model_visible_task_fingerprint,'Visible task fingerprint mismatch.');
  requireValue(typeof v.model_visible_task_raw_text === 'string' && canonical(JSON.parse(v.model_visible_task_raw_text)) === canonical(v.model_visible_task),'Exact visible task receipt differs from parsed task.');
  requireValue(Array.isArray(v.model_visible_context) && Array.isArray(v.claim_inventory) && Array.isArray(v.reference_inventory) && Array.isArray(v.recorded_citations),'Reviewer view inventories are missing.');
  requireValue(v.recorded_response && Array.isArray(v.recorded_response.claims),'Recorded response inventory is missing.');
  requireValue(v.raw_visible_output.length>0 || v.claim_inventory.some(c=>c.model_claim && typeof c.model_claim.text==='string') || typeof v.structured_output.reason==='string','The answer has no bindable occurrence for a human submission.');
  requireValue(v.claim_inventory.every((c,i)=>c.position===i && (c.record_claim_id===null || id(c.record_claim_id)) && (c.model_claim===null || typeof c.model_claim==='object')),'Claim inventory has invalid positions or IDs.');
  requireValue(v.reference_inventory.every(r=>['model_structure','evaluation_record','evaluation_record_citation_event'].includes(r.representation) && ['none','not_provided','malformed','unresolvable','provided'].includes(r.state) && (r.claim_position===null || Number.isInteger(r.claim_position) && r.claim_position>=0 && r.claim_position<v.claim_inventory.length)),'Reference inventory has invalid linkage.');
  const docs=v.model_visible_task.documents;
  requireValue(Array.isArray(docs) && docs.length === v.model_visible_context.length && docs.every((d,i) => ['document_id','version','text'].every(k => d[k] === v.model_visible_context[i][k])),'Visible context differs from task documents.');
  const response={}; for (const key of ['raw_visible_output','structured_output','recorded_response','claim_inventory','reference_inventory','recorded_citations']) response[key]=v[key];
  requireValue(await hashObject(response) === b.response_fingerprint,'Response fingerprint mismatch.');
  requireValue(Array.isArray(a.spans) && Array.isArray(a.source_states) && Array.isArray(a.abstentions) && a.rubric && a.authority,'Annotation structure is incomplete.');
  for (const [i,s] of a.spans.entries()) {
    const d=docs.find(x=>x.document_id===s.document_id && x.version===s.version);
    requireValue(d && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start<s.end && sliceUnicode(d.text,s.start,s.end)===s.quote,`Annotation span ${i+1} differs from visible source text.`);
  }
  requireValue(Array.isArray(a.claims) && Array.isArray(a.question_targets || []),'Annotation claims or targets missing.');
  requireValue(new Set(a.spans.map(s=>s.span_id)).size===a.spans.length && new Set(a.claims.map(c=>c.claim_id)).size===a.claims.length,'Annotation IDs are duplicated.');
  requireValue((a.question_targets||[]).every(t=>id(t.target_id) && Array.isArray(t.candidate_claim_ids) && t.candidate_claim_ids.every(c=>a.claims.some(x=>x.claim_id===c))),'Question target linkage is invalid.');
  return deepFreeze(packet);
}

export async function loadPacketText(text) { return validatePacket(JSON.parse(text)); }
