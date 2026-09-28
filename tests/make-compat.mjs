import fs from 'node:fs';
import {validatePacket} from '../js/packet.js';
import {newDraft,units,unitKey,makeSubmission} from '../js/review-state.js';
const p=await validatePacket(JSON.parse(fs.readFileSync(new URL('../fixtures/FABRICATED_valid_packet.json',import.meta.url))));
const d=newDraft(p);d.reviewerId=p.reviewer_id;d.readAnswer=d.inventoryLocked=d.referencesOpened=true;d.uncertainty='some_uncertainty';d.uncertaintyNote='Fabricated structural test.';d.reason='Fabricated structural test.';
d.rawSpans.push({start:0,end:codepoints(p.reviewer_view.raw_visible_output),kind:'raw_text'});
for(const s of p.hidden_annotation.spans)d.spanReviews[s.span_id]={admissibility:s.admissibility,reason:'Fabricated eligibility review.',state:'current',temporal:'applicable',dependenceGroup:'',complete:true};
for(const t of p.hidden_annotation.question_targets||[])d.targetReviews[t.target_id]={reason:'Fabricated target confirmation.',complete:true};
for(const u of units(p)){
  let payload;
  if(u.kind==='claim')payload={alignment:'one_reference',reference_ids:['ref-blue'],normalized_interpretation:null,atomicity:'atomic',support:'supported',support_mode:'direct',evidence_span_ids:['blue'],premise_sets:[],selected_premise_set:null,cited_set_sufficiency:'none'};
  else if(u.kind==='coverage')payload={outcome:u.id==='ref-blue'?'covered':'omitted',claim_ids:u.id==='ref-blue'?['claim-1']:[]};
  else {d.entries[unitKey(u)]={applicability:'not_applicable',scopeReason:'Fabricated structural test only.',complete:true};continue;}
  d.entries[unitKey(u)]={payload,reason:'Fabricated structural test.',occurrenceIds:['claim-0'],complete:true};
}
d.discrepancies.push({discrepancy_id:'fabricated-disc-1',kind:'raw_only_caveat',left_occurrence_id:'raw-1',right_occurrence_id:null,description:'Fabricated discrepancy binding test.'});
process.stdout.write(JSON.stringify(await makeSubmission(d)));
function codepoints(s){return [...s].length;}
