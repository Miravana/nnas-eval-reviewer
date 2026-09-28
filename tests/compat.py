"""Read-only Python ↔ JavaScript conformance against the normative NNAS validator."""
import copy
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(os.environ.get('NNAS_MAIN', '/Users/owenebersole/Downloads/NNAS_v0.5_Prototype1_Candidate'))
sys.path.insert(0, str(root))
from evaluations.v1.pilot.contracts import PilotTask, PilotAnnotation
from evaluations.v1.review.human_submission import HumanSubmission, ReviewerPacket, make_reviewer_packet, project_pilot_artifact, validate_submission
from evaluations.v1.review_projection import canonical_bytes

repo = Path(__file__).resolve().parents[1]
legacy = json.loads((root / 'evaluations/v1/scoring/fixtures/reviewed_input_smoke.json').read_text())
dry = json.loads((root / 'evaluations/v1/review/fixtures/procedure_dry_runs.json').read_text())
task = PilotTask.model_validate_json(json.dumps(legacy['task']))
annotation = PilotAnnotation.model_validate_json(json.dumps(legacy['annotation']))
inputs = copy.deepcopy(dry['projection_inputs'])
inputs['visible_context'] = [{k:s[k] for k in ('source_event_id','document_id','version','text')} for s in inputs['visible_context']]
inputs['model_visible_task_raw_text'] = canonical_bytes(inputs['model_visible_task']).decode()
projection = project_pilot_artifact(task, {'schema_version':'nnas-eval-pilot-execution-artifact/1',**inputs})
packet = make_reviewer_packet(task,annotation,projection,reviewer_id='fictional-reviewer-1',assignment_id='FABRICATED-assignment-1')
saved = ReviewerPacket.model_validate_json((repo/'fixtures/FABRICATED_valid_packet.json').read_text())
assert saved == packet, 'Public fixture differs from normative constructor'
js = subprocess.run(['node',str(repo/'tests/make-compat.mjs')],check=True,capture_output=True,text=True,cwd=repo)
submission = HumanSubmission.model_validate_json(js.stdout)
validate_submission(submission,packet,projection)
assert submission.schema_version == 'nnas-eval-human-submission/1'
assert submission.occurrences[-1].surface == 'raw_visible_output'
print('Python validated the JavaScript submission and exact occurrence bindings.')
