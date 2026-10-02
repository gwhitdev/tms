import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

// Amend this reviewed baseline deliberately when scope changes; never infer it
// from the mutable traceability mappings being checked.
const BASELINE_SHA256='afe7d69a4c95e455b1615437f9dbf755e5286a900d2ad77b5027d9b769a3258a';
const DOTNET_COMMAND='dotnet run --project tests/Tms.Contracts.Tests/Tms.Contracts.Tests.csproj --configuration Release';
const EXAMPLE_SOURCE='tests/Tms.Contracts.Tests/Program.cs';
const layers=new Set(['design_review','contract_example','domain_unit','architecture','real_api','postgres_runtime_roles','provider_contract','integration_failure','mobile_real_device','ux_browser','accessibility_review','container_rehearsal','restore_rehearsal','performance','traceability']);
const policy={phase:'m01_design',futureImplementation:'not_started',examplesAreProductionEvidence:false,verificationMode:'external_criterion_assessment',autoVerification:false};
const requiredRuntimeLayers={
 'M02-T01':['container_rehearsal','real_api'],
 'M02-T02':['real_api','postgres_runtime_roles'],
 'M04-T04':['real_api','postgres_runtime_roles'],
 'M06-T01':['mobile_real_device','real_api'],
 'M06-T02':['mobile_real_device','real_api'],
 'M06-T03':['mobile_real_device','integration_failure'],
 'M06-T04':['mobile_real_device','real_api'],
 'M06-T05':['provider_contract'],
 'M07-T03':['postgres_runtime_roles','integration_failure'],
 'M09-T04':['restore_rehearsal','container_rehearsal'],
 'M10-T02':['real_api','postgres_runtime_roles','integration_failure'],
 'M10-T03':['mobile_real_device','performance'],
 'M10-T04':['restore_rehearsal','container_rehearsal'],
};

function fail(code,message){throw Object.assign(new Error(message),{code});}
function ensure(condition,code,message){if(!condition)fail(code,message);}
function canonical(value){return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
export function baselineDigest(baseline){return createHash('sha256').update(canonical({requirements:baseline.requirements,milestones:baseline.milestones})).digest('hex');}
function record(value,code,label){ensure(value&&typeof value==='object'&&!Array.isArray(value),code,`${label} must be an object`);}
function exactKeys(value,keys,code,label){record(value,code,label);ensure(canonical(Object.keys(value).sort())===canonical([...keys].sort()),code,`${label} has unexpected or missing fields`);}
function list(value,code,label){ensure(Array.isArray(value),code,`${label} must be an array`);return value;}
function indexed(records,expected,code,label){
 list(records,code,label);const ids=records.map(item=>item?.id);
 ensure(ids.length===new Set(ids).size&&ids.every(id=>typeof id==='string')&&canonical([...ids].sort())===canonical([...expected].sort()),code,`${label} must retain every unique baseline ID`);
 return new Map(records.map(item=>[item.id,item]));
}
function criteria(record,acceptance,code,label){
 list(record.criteria,code,label);ensure(record.criteria.length===acceptance.length,code,`${label} has missing acceptance criteria`);
 record.criteria.forEach((item,index)=>{
  exactKeys(item,['index','scenarioIds'],code,`${label} criterion`);
  ensure(item.index===index,code,`${label} criteria must use exact zero-based indices`);
  list(item.scenarioIds,'SCENARIO_REFERENCE',label);
  ensure(item.scenarioIds.length>0,'ORPHAN_CRITERION',`${label} criterion ${index} is unlinked`);
  ensure(item.scenarioIds.length===new Set(item.scenarioIds).size,'SCENARIO_REFERENCE',`${label} duplicates a scenario link`);
 });
}
function emptyEvidence(value,label){ensure(Array.isArray(value)&&value.length===0,'FABRICATED_EVIDENCE',`${label} cannot contain evidence claims in the M01 design inventory`);}
function verifyExecutable(executable,repositoryRoot){
 for(const path of [executable.source,'tests/Tms.Contracts.Tests/Tms.Contracts.Tests.csproj']){
  const full=resolve(repositoryRoot,path),relation=relative(repositoryRoot,full);
  ensure(relation&&!relation.startsWith('..')&&!isAbsolute(relation),'EXAMPLE_SCOPE','Executable path escapes the repository');
  let content;try{content=readFileSync(full,'utf8');}catch{fail('EXAMPLE_SOURCE',`Declared example source is missing: ${path}`);}
  if(path===executable.source)ensure(content.includes(executable.caseId),'EXAMPLE_SOURCE',`Example ID ${executable.caseId} is absent from its declared harness`);
 }
}

/** Pure inventory validation. This checks traceability and rejects progress
 * claims; it cannot attest external test outcomes or verify product acceptance.
 */
export function validateTraceability(document,{repositoryRoot=null}={}){
 exactKeys(document,['schemaVersion','baselineId','repository','baseline','policies','requirements','tasks','scenarios','evidence'],'SCHEMA','Traceability document');
 ensure(document.schemaVersion===1&&document.baselineId==='freight-tms-baseline-01'&&document.repository==='gwhitdev/tms','SCHEMA','Unknown traceability schema, baseline or repository');
 exactKeys(document.baseline,['source','sha256','requirements','milestones'],'BASELINE_DRIFT','Baseline snapshot');
 ensure(document.baseline.sha256===BASELINE_SHA256&&baselineDigest(document.baseline)===BASELINE_SHA256,'BASELINE_DRIFT','The reviewed baseline changed; update scope and its pinned digest explicitly');
 ensure(canonical(document.policies)===canonical(policy),'EVIDENCE_POLICY','M01 cannot enable automatic verification or production evidence from examples');
 emptyEvidence(document.evidence,'Traceability document');
 const baseRequirements=document.baseline.requirements;
 const baseTasks=document.baseline.milestones.flatMap(milestone=>milestone.tasks);
 ensure(baseRequirements.length===63&&baseTasks.length===46,'BASELINE_DRIFT','The pinned baseline counts changed');
 const requirementMap=indexed(document.requirements,baseRequirements.map(r=>r.id),'REQUIREMENT_SET','Requirement mappings');
 const taskMap=indexed(document.tasks,baseTasks.map(t=>t.id),'TASK_SET','Task mappings');
 const requirementsById=new Map(baseRequirements.map(r=>[r.id,r]));
 const tasksById=new Map(baseTasks.map(t=>[t.id,t]));
 for(const requirement of document.requirements){
  exactKeys(requirement,['id','implementationStatus','criteria'],'REQUIREMENT_SET','Requirement mapping');
  ensure(requirement.implementationStatus==='not_started','FABRICATED_PROGRESS',`${requirement.id} has no assessed production implementation evidence`);
  criteria(requirement,requirementsById.get(requirement.id).acceptance,'REQUIREMENT_CRITERIA',requirement.id);
 }
 for(const task of document.tasks){
  exactKeys(task,['id','implementationStatus','deliveryStatus','criteria'],'TASK_SET','Task mapping');
  ensure(task.implementationStatus==='not_started','FABRICATED_PROGRESS',`${task.id} has no production implementation claim in this design inventory`);
  ensure(task.deliveryStatus===(task.id.startsWith('M01-')?'design_candidate':'not_started'),'FABRICATED_PROGRESS',`${task.id} cannot advance without external acceptance assessment`);
  criteria(task,tasksById.get(task.id).acceptance,'TASK_CRITERIA',task.id);
 }
 list(document.scenarios,'SCENARIO_SET','Scenarios');
 const scenarioMap=new Map(document.scenarios.map(scenario=>[scenario?.id,scenario]));
 ensure(scenarioMap.size===document.scenarios.length&&document.scenarios.every(s=>typeof s.id==='string'&&s.id.length>0),'SCENARIO_SET','Scenario IDs must be unique and explicit');
 // Resolve inventory pointers first so orphan references cannot be skipped.
 for(const mapping of [...document.requirements,...document.tasks]){
  for(const criterion of mapping.criteria)for(const id of criterion.scenarioIds)ensure(scenarioMap.has(id),'SCENARIO_REFERENCE',`${mapping.id} points to unknown scenario ${id}`);
 }
 let examples=0,planned=0;
 for(const scenario of document.scenarios){
  const keys=['id','kind','taskId','taskAcceptanceIndex','requirementCriteria','layers','executionStatus','arrange','act','assert','evidence'];
  if(scenario.kind==='contract_example')keys.push('executable');
  if(scenario.kind==='planned_acceptance'&&scenario.executable)fail('PLANNED_EXECUTABLE','A future runtime scenario cannot be substituted with an example command');
  exactKeys(scenario,keys,'SCENARIO_SET',`Scenario ${scenario.id}`);
  ensure(taskMap.has(scenario.taskId)&&Number.isInteger(scenario.taskAcceptanceIndex)&&scenario.taskAcceptanceIndex>=0&&scenario.taskAcceptanceIndex<tasksById.get(scenario.taskId).acceptance.length,'TASK_REFERENCE',`${scenario.id} has an invalid task criterion`);
  list(scenario.requirementCriteria,'REQUIREMENT_REFERENCE',scenario.id);
  ensure(scenario.requirementCriteria.length>0,'REQUIREMENT_REFERENCE',`${scenario.id} has no requirement criterion`);
  const seenRefs=new Set();
  for(const ref of scenario.requirementCriteria){
   exactKeys(ref,['requirementId','index'],'REQUIREMENT_REFERENCE',scenario.id);
   ensure(requirementMap.has(ref.requirementId)&&Number.isInteger(ref.index)&&ref.index>=0&&ref.index<requirementsById.get(ref.requirementId).acceptance.length,'REQUIREMENT_REFERENCE',`${scenario.id} has an unknown requirement criterion`);
   const identity=`${ref.requirementId}:${ref.index}`;ensure(!seenRefs.has(identity),'REQUIREMENT_REFERENCE',`${scenario.id} repeats a requirement criterion`);seenRefs.add(identity);
   ensure(requirementMap.get(ref.requirementId).criteria[ref.index].scenarioIds.includes(scenario.id),'RECIPROCAL_LINK',`${scenario.id} is missing its requirement backlink`);
  }
  ensure(taskMap.get(scenario.taskId).criteria[scenario.taskAcceptanceIndex].scenarioIds.includes(scenario.id),'RECIPROCAL_LINK',`${scenario.id} is missing its task backlink`);
  list(scenario.layers,'TEST_LAYER',scenario.id);ensure(scenario.layers.length>0&&new Set(scenario.layers).size===scenario.layers.length&&scenario.layers.every(layer=>layers.has(layer)),'TEST_LAYER',`${scenario.id} has unsupported or duplicate test layers`);
  for(const name of ['arrange','act','assert'])ensure(typeof scenario[name]==='string'&&scenario[name].trim().length>0,'SCENARIO_TEXT',`${scenario.id} has no ${name} definition`);
  emptyEvidence(scenario.evidence,scenario.id);
  if(scenario.kind==='contract_example'){
   examples++;
   ensure(scenario.taskId==='M01-T02'&&canonical(scenario.layers)===canonical(['contract_example'])&&scenario.executionStatus==='example_available','EXAMPLE_SCOPE',`${scenario.id} is a domain contract example, not production assurance`);
   exactKeys(scenario.executable,['command','source','caseId'],'EXAMPLE_SCOPE',`${scenario.id} executable`);
   ensure(scenario.executable.command===DOTNET_COMMAND&&scenario.executable.source===EXAMPLE_SOURCE&&scenario.executable.caseId===scenario.id,'EXAMPLE_SCOPE',`${scenario.id} must reference the declared .NET contract harness`);
   if(repositoryRoot)verifyExecutable(scenario.executable,repositoryRoot);
  }else{
   ensure(scenario.kind==='planned_acceptance','SCENARIO_SET',`${scenario.id} has an unknown scenario kind`);planned++;
   ensure(scenario.executionStatus==='not_started','FABRICATED_PROGRESS',`${scenario.id} has no executed production acceptance evidence`);
   ensure(!scenario.layers.includes('contract_example'),'EXAMPLE_SCOPE',`${scenario.id} cannot replace required runtime assurance with a contract example`);
   ensure((requiredRuntimeLayers[scenario.taskId]||[]).every(layer=>scenario.layers.includes(layer)),'TEST_LAYER',`${scenario.id} is missing a required runtime assurance layer`);
   ensure(scenario.assert===tasksById.get(scenario.taskId).acceptance[scenario.taskAcceptanceIndex],'SCENARIO_TEXT',`${scenario.id} no longer states its exact baseline task expectation`);
  }
 }
 // Backlinks must have the same semantics, not merely point to an existing ID.
 for(const requirement of document.requirements)for(const criterion of requirement.criteria){
  ensure(criterion.scenarioIds.some(id=>scenarioMap.get(id).kind==='planned_acceptance'),'ORPHAN_CRITERION',`${requirement.id} criterion ${criterion.index} cannot rely only on contract examples`);
  for(const id of criterion.scenarioIds)ensure(scenarioMap.get(id).requirementCriteria.some(ref=>ref.requirementId===requirement.id&&ref.index===criterion.index),'RECIPROCAL_LINK',`${requirement.id} criterion ${criterion.index} has a false scenario backlink`);
 }
 for(const task of document.tasks)for(const criterion of task.criteria){
  ensure(criterion.scenarioIds.some(id=>scenarioMap.get(id).kind==='planned_acceptance'),'ORPHAN_CRITERION',`${task.id} criterion ${criterion.index} needs its own planned acceptance scenario`);
  for(const id of criterion.scenarioIds){const scenario=scenarioMap.get(id);ensure(scenario.taskId===task.id&&scenario.taskAcceptanceIndex===criterion.index,'RECIPROCAL_LINK',`${task.id} criterion ${criterion.index} has a false scenario backlink`);}
 }
 if(repositoryRoot){
  const source=readFileSync(resolve(repositoryRoot,EXAMPLE_SOURCE),'utf8');
  const declared=[...source.matchAll(/scenarios\.Add\(\("([A-Z0-9-]+)"/g)].map(match=>match[1]);
  const mapped=document.scenarios.filter(scenario=>scenario.kind==='contract_example').map(scenario=>scenario.id);
  ensure(declared.length>0&&declared.length===new Set(declared).size&&canonical(declared.sort())===canonical(mapped.sort()),'EXAMPLE_SOURCE','Every declared .NET harness case must have one traceability mapping');
 }
 return {requirements:requirementMap.size,requirementCriteria:document.requirements.reduce((n,r)=>n+r.criteria.length,0),tasks:taskMap.size,taskCriteria:document.tasks.reduce((n,t)=>n+t.criteria.length,0),planned,examples,verified:0};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const repositoryRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
  const path=process.argv[2]?resolve(process.argv[2]):resolve(repositoryRoot,'docs/m01/traceability.json');
  const summary=validateTraceability(JSON.parse(readFileSync(path,'utf8')),{repositoryRoot});
  console.log(`PASS traceability requirements=${summary.requirements} requirementCriteria=${summary.requirementCriteria} tasks=${summary.tasks} taskCriteria=${summary.taskCriteria} planned=${summary.planned} examples=${summary.examples} verified=0`);
 }catch(error){console.error(`FAIL ${error.code||'TRACEABILITY'}: ${error.message}`);process.exitCode=1;}
}
