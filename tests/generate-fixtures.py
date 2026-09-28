"""Generate public FABRICATED packets using the read-only normative Python implementation."""
import copy
import json
import os
import sys
from pathlib import Path

root = Path(os.environ.get('NNAS_MAIN', '/Users/owenebersole/Downloads/NNAS_v0.5_Prototype1_Candidate'))
sys.path.insert(0, str(root))
from evaluations.v1.pilot.contracts import PilotTask, PilotAnnotation
from evaluations.v1.review.human_submission import make_reviewer_packet, project_pilot_artifact
from evaluations.v1.review_projection import canonical_bytes

legacy = json.loads((root / 'evaluations/v1/scoring/fixtures/reviewed_input_smoke.json').read_text())
dry = json.loads((root / 'evaluations/v1/review/fixtures/procedure_dry_runs.json').read_text())
task = PilotTask.model_validate_json(json.dumps(legacy['task']))
annotation = PilotAnnotation.model_validate_json(json.dumps(legacy['annotation']))
inputs = copy.deepcopy(dry['projection_inputs'])
inputs['visible_context'] = [{key: row[key] for key in ('source_event_id','document_id','version','text')} for row in inputs['visible_context']]
inputs['model_visible_task_raw_text'] = canonical_bytes(inputs['model_visible_task']).decode()
artifact = {'schema_version':'nnas-eval-pilot-execution-artifact/1', **inputs}
projection = project_pilot_artifact(task, artifact)
packet = make_reviewer_packet(task, annotation, projection, reviewer_id='fictional-reviewer-1', assignment_id='FABRICATED-assignment-1')
out = Path(__file__).resolve().parents[1] / 'fixtures'
out.mkdir(exist_ok=True)
(out / 'FABRICATED_valid_packet.json').write_text(json.dumps(packet.model_dump(mode='json'), ensure_ascii=False, indent=2) + '\n')

def variant(name, claims, raw, reason='Fabricated answer; no generation.', outcome='answered'):
    values = copy.deepcopy(inputs)
    values['run_id'] = f'fabricated-{name}'
    values['evaluation_record']['identity']['run_id'] = values['run_id']
    response = next(e for e in values['evaluation_record']['events'] if e['kind'] == 'response')
    response['outcome'] = outcome
    response['reason'] = reason
    response['claims'] = [{'claim_id':c['claim_id'],'text':c['text'],'sources':c.get('source_refs',[]),
                           'evidence_ids':[],'inference_ids':[],
                           'status_at_answer':[{'target':{'layer':'source','id':s['source_event_id']},
                                                'state':'active','as_of_event_id':s['source_event_id']}
                                               for s in c.get('source_refs',[])]} for c in claims]
    values['structured_output'] = {'claims':claims,'reason':reason}
    values['raw_visible_output'] = raw
    p = project_pilot_artifact(task, {'schema_version':'nnas-eval-pilot-execution-artifact/1', **values})
    packet = make_reviewer_packet(task, annotation, p, reviewer_id='fictional-reviewer-1', assignment_id=f'FABRICATED-{name}')
    (out / f'FABRICATED_{name}_packet.json').write_text(json.dumps(packet.model_dump(mode='json'), ensure_ascii=False, indent=2) + '\n')

blue = {'claim_id':'blue-claim','text':'Valve V is blue.','source_refs':[]}
weight = {'claim_id':'weight-claim','text':'Valve V weighs two kilograms.','source_refs':[]}
variant('multiple_claims',[blue,weight],'Valve V is blue. Valve V weighs two kilograms.')
variant('abstention',[],'The exact mass of Parcel Z cannot be determined from the supplied snapshot.',
        'No retained exact mass reading is supplied.',outcome='abstained')
variant('conflict',[{'claim_id':'copper-claim','text':'Sample Q contains copper.','source_refs':[]}],
        'Lab Alpha reports copper, while Lab Beta reports no copper. The sources conflict.')
source_ref={'source_event_id':'fixture-source-0','document_id':'facts','version':'1','start':0,'end':16,'quote':'Valve V is blue.'}
variant('citation',[{'claim_id':'cited-blue','text':'Valve V is blue.','source_refs':[source_ref]}],
        'Valve V is blue [facts, version 1].')
variant('discrepancy',[blue],'Valve V is red.')
variant('temporal',[{'claim_id':'time-claim','text':'Art Club holds Room 1 before noon.','source_refs':[]}],
        'Art Club holds Room 1 before noon at the query time.')
bad = packet.model_dump(mode='json')
bad['schema_version'] = 'nnas-eval-reviewer-packet/999'
(out / 'FABRICATED_unsupported_packet.json').write_text(json.dumps(bad, ensure_ascii=False, indent=2) + '\n')
print('Generated eight fabricated packet fixtures')
