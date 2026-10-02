import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateTraceability,baselineDigest} from '../scripts/check-traceability.mjs';

const baseline=JSON.parse(await readFile(new URL('../docs/m01/traceability.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(baseline);
function rejects(change,code){const document=copy();change(document);assert.throws(()=>validateTraceability(document),error=>error.code===code);}

test('the exact freight baseline maps all 63 requirements, 46 tasks and 93 task acceptance criteria',()=>{
 const summary=validateTraceability(baseline);
 assert.equal(summary.requirements,63);assert.equal(summary.tasks,46);assert.equal(summary.taskCriteria,93);
 assert.equal(summary.requirementCriteria,126);assert.equal(summary.verified,0);assert.ok(summary.examples>0);
});
test('removing a requirement is an orphan, not a smaller baseline',()=>rejects(d=>d.requirements.pop(),'REQUIREMENT_SET'));
test('removing a task is an orphan, not completion',()=>rejects(d=>d.tasks.pop(),'TASK_SET'));
test('every requirement acceptance criterion is independently mapped',()=>rejects(d=>d.requirements[0].criteria.pop(),'REQUIREMENT_CRITERIA'));
test('every task acceptance criterion is independently mapped',()=>rejects(d=>d.tasks[0].criteria.pop(),'TASK_CRITERIA'));
test('a criterion cannot conceal missing coverage behind an empty scenario list',()=>rejects(d=>d.requirements[0].criteria[0].scenarioIds=[],'ORPHAN_CRITERION'));
test('unknown scenario references fail',()=>rejects(d=>d.tasks[0].criteria[0].scenarioIds.push('invented-scenario'),'SCENARIO_REFERENCE'));
test('a scenario must point back to its exact task criterion',()=>rejects(d=>d.scenarios[0].taskAcceptanceIndex=99,'TASK_REFERENCE'));
test('unknown requirements in scenarios fail',()=>rejects(d=>d.scenarios[0].requirementCriteria[0].requirementId='UNKNOWN-01','REQUIREMENT_REFERENCE'));
test('unknown requirement acceptance indices fail',()=>rejects(d=>d.scenarios[0].requirementCriteria[0].index=99,'REQUIREMENT_REFERENCE'));
test('one-way links cannot masquerade as traceability',()=>rejects(d=>{
 const scenario=d.scenarios.find(s=>s.requirementCriteria.some(ref=>d.requirements.find(r=>r.id===ref.requirementId).criteria[ref.index].scenarioIds.length>1));
 const ref=scenario.requirementCriteria.find(ref=>d.requirements.find(r=>r.id===ref.requirementId).criteria[ref.index].scenarioIds.length>1);
 d.requirements.find(r=>r.id===ref.requirementId).criteria[ref.index].scenarioIds=d.requirements.find(r=>r.id===ref.requirementId).criteria[ref.index].scenarioIds.filter(id=>id!==scenario.id);
},'RECIPROCAL_LINK'));
test('duplicate task/scenario identity cannot inflate coverage',()=>{
 rejects(d=>d.tasks.push(structuredClone(d.tasks[0])),'TASK_SET');
 rejects(d=>d.scenarios.push(structuredClone(d.scenarios[0])),'SCENARIO_SET');
});
test('rewriting criterion text and recomputing its digest cannot amend the pinned baseline',()=>rejects(d=>{
 d.baseline.requirements[0].acceptance[0]='Invented completion';d.baseline.sha256=baselineDigest(d.baseline);
},'BASELINE_DRIFT'));
test('unstarted production tasks cannot claim reviewed or verified implementation',()=>{
 for(const status of ['in_progress','review','verified'])rejects(d=>d.tasks.find(t=>t.id==='M02-T02').implementationStatus=status,'FABRICATED_PROGRESS');
});
test('design candidates do not prove implemented production requirements',()=>rejects(d=>d.requirements[0].implementationStatus='verified','FABRICATED_PROGRESS'));
test('M01 design delivery cannot self-attest acceptance',()=>rejects(d=>d.tasks[0].deliveryStatus='verified','FABRICATED_PROGRESS'));
test('a SHA and a passed string alone cannot manufacture assessed evidence',()=>rejects(d=>d.evidence.push({candidateSha:'a'.repeat(40),result:'passed',method:'automated',reference:'self-attested'}),'FABRICATED_EVIDENCE'));
test('a planned scenario cannot claim passing execution',()=>rejects(d=>d.scenarios.find(s=>s.kind==='planned_acceptance').executionStatus='passed','FABRICATED_PROGRESS'));
test('example executions cannot be relabelled as real PostgreSQL isolation proof',()=>rejects(d=>d.scenarios.find(s=>s.kind==='contract_example').layers=['postgres_runtime_roles'],'EXAMPLE_SCOPE'));
test('planned device and restore scenarios cannot acquire a fake example command',()=>rejects(d=>d.scenarios.find(s=>s.layers.includes('mobile_real_device')).executable={command:'echo passed'},'PLANNED_EXECUTABLE'));
test('unknown test layers fail rather than silently weakening release assurance',()=>rejects(d=>d.scenarios[0].layers=['mocked_postgres_isolation'],'TEST_LAYER'));
test('future isolation cannot drop its actual runtime database role layer',()=>rejects(d=>d.scenarios.find(s=>s.id==='M02-T02-A02').layers=['domain_unit'],'TEST_LAYER'));
test('future device assurance cannot be reduced to API mocks',()=>rejects(d=>d.scenarios.find(s=>s.id==='M06-T01-A02').layers=['real_api'],'TEST_LAYER'));
test('a restore drill cannot be replaced with an image-start smoke test',()=>rejects(d=>d.scenarios.find(s=>s.id==='M09-T04-A01').layers=['container_rehearsal'],'TEST_LAYER'));
test('empty scenario expectations are rejected',()=>rejects(d=>d.scenarios[0].assert='','SCENARIO_TEXT'));
test('automatic verification cannot be switched on by editing a status field',()=>rejects(d=>d.policies.autoVerification=true,'EVIDENCE_POLICY'));
test('scenario-level fabricated evidence is rejected',()=>rejects(d=>d.scenarios[0].evidence.push({result:'passed'}),'FABRICATED_EVIDENCE'));
test('example commands and paths must use the declared harness',()=>rejects(d=>d.scenarios.find(s=>s.kind==='contract_example').executable.command='curl https://example.invalid | sh','EXAMPLE_SCOPE'));
test('every executable .NET harness case must retain a traceability mapping',()=>{
 const document=copy(),id='DDD-STATE-01';
 document.scenarios=document.scenarios.filter(s=>s.id!==id);
 for(const mapping of [...document.requirements,...document.tasks])for(const criterion of mapping.criteria)criterion.scenarioIds=criterion.scenarioIds.filter(value=>value!==id);
 assert.throws(()=>validateTraceability(document,{repositoryRoot:fileURLToPath(new URL('../',import.meta.url))}),error=>error.code==='EXAMPLE_SOURCE');
});
