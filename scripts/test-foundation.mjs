import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CONTROL='http://127.0.0.1:8740';
const APPLICATION='http://127.0.0.1:8180';
const NODE_IMAGE='node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43';
const PROJECTS=Object.freeze({foundation:'tms-foundation',installer:'tms-installer'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(condition,code,message)=>{if(!condition)throw Object.assign(new Error(message),{code});};

export function composeArguments(project,operation,environmentFile){
 check(Object.hasOwn(PROJECTS,project),'FND-SCOPE','Only the two fixed acceptance projects are permitted.');
 check(Array.isArray(operation)&&operation.length>0&&!operation.some(value=>['down','rm','prune','--volumes','-v'].includes(value)),'FND-SCOPE','Destructive cleanup is not permitted.');
 return ['compose','--project-name',PROJECTS[project],'--file',path.join(ROOT,'deploy',`${project}.compose.yaml`),'--env-file',environmentFile,...operation];
}
export function requireMissingMigrationRed(result,migrationAbsent){
 check(result.code!==0&&migrationAbsent===true&&/^FAIL FND-PG-01 \| Foundation boundary expectation failed\.$/m.test(result.output)&&!result.output.includes('FND-PG-CONNECTION'),'FND-RED','Expected missing-migration RED was not observed. Existing data and volumes were preserved.');
}
export function smokeLines(output){return output.split(/\r?\n/).filter(line=>/^(?:PASS|FAIL) FND-PG-(?:\d{2}|CONNECTION) \| /.test(line)||/^RESULT passed=\d+ failed=\d+$/.test(line)||line.startsWith('LIMITATION: foundation privileges/readiness/persistence only;')).join('\n');}

function selfTest(){
 const fixture={code:1,output:'FAIL FND-PG-01 | Foundation boundary expectation failed.'};
 requireMissingMigrationRed(fixture,true);
 for(const [result,absent] of [[{...fixture,code:0},true],[fixture,false],[{code:1,output:'FAIL FND-PG-CONNECTION | Foundation boundary unavailable.'},true]])assert.throws(()=>requireMissingMigrationRed(result,absent),error=>error.code==='FND-RED');
 assert.throws(()=>composeArguments('other',['up'],'fixture.env'),error=>error.code==='FND-SCOPE');
 assert.throws(()=>composeArguments('foundation',['down','--volumes'],'fixture.env'),error=>error.code==='FND-SCOPE');
 assert.equal(composeArguments('foundation',['run','--rm','--no-deps','smoke','--verify'],'fixture.env')[2],'tms-foundation');
 assert.equal(smokeLines('secret=must-not-report\nPASS FND-PG-06 | Durable current worker heartbeat\nRESULT passed=6 failed=0'),'PASS FND-PG-06 | Durable current worker heartbeat\nRESULT passed=6 failed=0');
 console.log('PASS foundation acceptance-runner self-checks: scoped projects, no destructive cleanup, exact RED cause, safe smoke reports. No Docker operations.');
}

async function acceptance(options){
 const reportDirectory=path.resolve(process.env.TMS_FOUNDATION_REPORT_DIR||path.join(ROOT,'test-results','foundation'));
 await mkdir(reportDirectory,{recursive:true});
 const dockerConfiguration=path.join(reportDirectory,'empty-docker-config');
 await mkdir(dockerConfiguration,{recursive:true});
 const environmentFile=path.join(reportDirectory,'runtime.env');
 await writeFile(environmentFile,'TMS_APP_PORT=8180\n');
 check(!process.env.DOCKER_HOST||/^(?:unix:\/\/\/var\/run\/docker\.sock|npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine))$/.test(process.env.DOCKER_HOST),'FND-SCOPE','Use the local Docker engine for this isolated acceptance run.');
 const childEnvironment=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP','HOME','HOMEDRIVE','HOMEPATH','DOCKER_HOST','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramData'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
 childEnvironment.DOCKER_CONFIG=dockerConfiguration;
 childEnvironment.TMS_APP_PORT='8180';
 const candidateSha=process.env.TMS_TESTED_SHA||process.env.GITHUB_SHA||null;
 check(candidateSha===null||/^[a-f0-9]{40}$/.test(candidateSha),'FND-SHA','The supplied tested SHA must be a full immutable commit.');
 const report={schemaVersion:1,baselineId:'freight-tms-baseline-01',taskId:'M02-T01',repository:'gwhitdev/tms',candidateSha,classification:'foundation_container_acceptance_only',automaticVerification:false,tenantIsolation:'not_assessed',identity:'not_implemented',businessOperations:'not_implemented',blobProof:'private_filer_fixture_only',startedAt:new Date().toISOString(),status:'running',steps:[]};
 let cookie='',csrf='',outage=null,successfulDeployment=false;
 const deadline=Date.now()+25*60*1000;
 const save=()=>writeFile(path.join(reportDirectory,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
 const mark=async(id,detail)=>{report.steps.push({id,result:'passed',detail,observedAt:new Date().toISOString()});console.log(`PASS ${id} | ${detail}`);await save();};
 function docker(args,timeout=180000){
  check(Date.now()<deadline,'FND-TIMEOUT','Acceptance run exceeded its bounded duration.');
  return new Promise(resolve=>execFile('docker',args,{cwd:ROOT,env:childEnvironment,timeout:Math.min(timeout,Math.max(1000,deadline-Date.now())),maxBuffer:16*1024*1024,windowsHide:true},(error,stdout='',stderr='')=>resolve({code:error?(typeof error.code==='number'?error.code:1):0,output:stdout+'\n'+stderr})));
 }
 const compose=(project,args,timeout)=>docker(composeArguments(project,args,environmentFile),timeout);
 async function must(project,args,timeout){const result=await compose(project,args,timeout);check(result.code===0,'FND-COMPOSE',`The fixed ${project} ${args[0]} operation failed. Raw engine output was withheld; inspect the release locally.`);return result;}
 async function request(origin,route,body,authenticated=false){
  const headers=body?{'Content-Type':'application/json',Origin:origin}:{};
  if(authenticated)headers.Cookie=cookie;
  try{const response=await fetch(origin+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});return {status:response.status,body:await response.json(),setCookie:response.headers.get('set-cookie')};}
  catch{throw Object.assign(new Error('The fixed local HTTP endpoint was unavailable or returned an invalid response.'),{code:'FND-HTTP'});}
 }
 async function eventually(checker,description,milliseconds=180000){
  const until=Math.min(deadline,Date.now()+milliseconds);let result;
  while(Date.now()<until){try{result=await checker();if(result)return result;}catch(error){if(['FND-DEPLOY','FND-SCOPE'].includes(error.code))throw error;}await pause(1000);}
  throw Object.assign(new Error(description),{code:'FND-WAIT'});
 }
 async function appStatus(status){const response=await request(APPLICATION,'/health/ready');return response.status===status&&response.body.status===(status===200?'ready':'not_ready');}
 async function smoke(mode){return compose('foundation',['--profile','test','run','--rm','--no-deps','smoke',mode],90000);}
 async function requireSmoke(mode,caseId,file){
  const result=await smoke(mode);const safe=smokeLines(result.output);await writeFile(path.join(reportDirectory,file),safe+'\n');
  check(result.code===0&&safe.includes(`PASS ${caseId} |`)&&/^RESULT passed=\d+ failed=0$/m.test(safe)&&!/^FAIL /m.test(safe),'FND-SMOKE','The actual database/runtime/heartbeat smoke did not pass.');
 }
 async function blob(mode,value){
  const script=`const expected=${JSON.stringify(value)};const url='http://storage:8888/foundation-proof/marker.txt';${mode==='write'?"const written=await fetch(url,{method:'PUT',headers:{'Content-Type':'text/plain'},body:expected,signal:AbortSignal.timeout(10000)});if(!written.ok)throw Error('fixture write failed');":''}const read=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!read.ok||await read.text()!==expected)throw Error('fixture persistence failed');console.log('PASS FND-BLOB-${mode==='write'?'01':'02'} | Private filer fixture ${mode==='write'?'written and read':'retained after recreation'}');`;
  const result=await docker(['run','--rm','--network','tms-foundation_backend','--label','com.docker.compose.project=tms-foundation','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534',NODE_IMAGE,'node','--input-type=module','-e',script],120000);
  check(result.code===0&&result.output.includes(`PASS FND-BLOB-${mode==='write'?'01':'02'}`),'FND-BLOB','Private filer fixture persistence did not pass; this is not authorised POD assurance.');
 }
 try{
  await save();
  await must('foundation',['config','--quiet']);await must('installer',['config','--quiet']);
  const existing=await must('foundation',['ps','--all','--quiet']);
  check(!existing.output.trim(),'FND-CLEAN','Foundation containers already exist. Use a clean isolated stack; this runner does not erase or reset existing installations.');
  await mark('FND-CFG-01','Both fixed Compose configurations validate; foundation container project is initially empty.');
  await must('installer',['up','--detach','--build','--wait','--wait-timeout','180','installer'],900000);
  await eventually(async()=>{const response=await request(CONTROL,'/health/live');return response.status===200&&response.body.ready===true;},'Installer did not become reachable.');
  const protectedState=await request(CONTROL,'/api/control');check(protectedState.status===401,'FND-CONTROL','Unpaired installer state must be denied.');
  let codeResult=await must('installer',['exec','-T','installer','node','/release/deploy/control/access-code.mjs']);
  let operatorCode=codeResult.output.trim();codeResult.output='';
  if(!/^[a-f0-9]{64}$/.test(operatorCode)&&options.ciReset){
   check(process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true','FND-SCOPE','Access reset is permitted only for explicitly disposable GitHub CI.');
   await must('installer',['exec','-T','installer','node','/release/deploy/control/access-code.mjs','--reset']);
   await must('installer',['restart','installer']);
   await eventually(async()=>{const response=await request(CONTROL,'/health/live');return response.status===200;},'Installer did not restart.');
   codeResult=await must('installer',['exec','-T','installer','node','/release/deploy/control/access-code.mjs']);operatorCode=codeResult.output.trim();codeResult.output='';
  }
  check(/^[a-f0-9]{64}$/.test(operatorCode),'FND-PAIRED','The operator code was already consumed. Existing operator access was preserved; use a fresh isolated installer or its paired browser.');
  const unlocked=await request(CONTROL,'/api/control/unlock',{code:operatorCode});operatorCode='';
  check(unlocked.status===200&&typeof unlocked.body.csrfToken==='string','FND-CONTROL','The local operator code did not unlock the installer.');
  cookie=/\btms_operator=[a-f0-9]{64}/.exec(unlocked.setCookie||'')?.[0]||'';csrf=unlocked.body.csrfToken;
  check(cookie&&/HttpOnly/.test(unlocked.setCookie||'')&&/SameSite=Strict/.test(unlocked.setCookie||''),'FND-CONTROL','Installer session boundary is missing.');
  const configured=await request(CONTROL,'/api/control/configure',{appPort:8180,csrfToken:csrf},true);
  check(configured.status===200&&configured.body.state==='configured'&&configured.body.appPort===8180,'FND-CONTROL','Validated installer configuration did not persist.');
  await mark('FND-SETUP-01','Actual operator unlock, strict HttpOnly session and validated port8180 configuration succeeded; credentials stayed in memory.');
  await must('foundation',['--profile','test','build','--pull'],900000);
  await must('foundation',['up','--detach','--wait','--wait-timeout','180','database','storage']);
  const missing=await must('foundation',['exec','-T','database','psql','-U','postgres','-d','tms','--tuples-only','--no-align','--command',"SELECT current_database() = 'tms' AND to_regrole('tms_worker') IS NOT NULL AND to_regrole('tms_migrator') IS NOT NULL AND to_regclass('foundation.schema_migrations') IS NULL;"]);
  const red=await smoke('--verify');requireMissingMigrationRed(red,missing.output.trim()==='t');
  await writeFile(path.join(reportDirectory,'database-red.log'),smokeLines(red.output)+'\n');
  await mark('FND-PG-RED','Genuine pre-migration smoke failed FND-PG-01; PostgreSQL independently confirmed the correct database, existing runtime/migrator roles and absent migration table.');
  for(let attempt=0;attempt<2;attempt++)await must('foundation',['run','--rm','--no-deps','migrate'],90000);
  await must('foundation',['up','--detach','--no-deps','--wait','--wait-timeout','180','worker']);
  await requireSmoke('--write-marker','FND-PG-07','database-green.log');
  await mark('FND-PG-GREEN','Two migration executions, restricted runtime privileges, current worker heartbeat and committed retention marker passed.');
  const deployment=await request(CONTROL,'/api/control/deploy',{csrfToken:csrf},true);
  check(deployment.status===202&&deployment.body.state==='deploying','FND-DEPLOY','The actual control API did not start its fixed release.');
  await eventually(async()=>{const response=await request(CONTROL,'/api/control',undefined,true);if(response.body.state==='failed')throw Object.assign(new Error('Fixed release deployment failed.'),{code:'FND-DEPLOY'});return response.status===200&&response.body.state==='ready'&&response.body.job?.state==='succeeded';},'Control deployment did not reach ready.',900000);
  successfulDeployment=true;
  await eventually(()=>appStatus(200),'Foundation gateway readiness did not pass.');
  const summary=await request(APPLICATION,'/api/foundation');
  check(summary.status===200&&summary.body.stage==='foundation'&&summary.body.release==='m02-foundation'&&summary.body.ready===true&&summary.body.identityAndTenancy==='not_implemented'&&summary.body.businessOperations==='not_implemented','FND-API','The real foundation API summary is missing or exaggerates implemented scope.');
  await mark('FND-DEPLOY-01','Actual control deployment reached ready; gateway readiness and honest foundation API summary passed.');
  const fixture='m02-foundation-private-filer-'+randomUUID();await blob('write',fixture);
  await mark('FND-BLOB-01','Private internal filer accepted a controlled fixture write and identical read; no POD authorisation claim.');
  await must('foundation',['up','--detach','--force-recreate','--wait','--wait-timeout','180']);
  await requireSmoke('--verify-marker','FND-PG-08','database-recreation.log');await blob('read',fixture);await eventually(()=>appStatus(200),'Recreated application readiness did not recover.');
  await mark('FND-PERSIST-01','Container recreation preserved database marker and private filer object; worker heartbeat and gateway readiness passed.');
  for(const dependency of ['storage','database']){
   outage=dependency;await must('foundation',['stop',dependency]);
   await eventually(()=>appStatus(503),`${dependency} outage did not produce real API503.`,60000);
   const unavailable=await request(APPLICATION,'/api/foundation');check(unavailable.status===503&&unavailable.body.ready===false,'FND-DEGRADED','Foundation summary must report unavailable dependencies.');
   const independent=await request(CONTROL,'/api/control',undefined,true);check(independent.status===200&&independent.body.configured===true,'FND-CONTROL','Installer state depends on the stopped TMS dependency.');
   await must('foundation',['start',dependency]);await eventually(()=>appStatus(200),`${dependency} recovery did not restore readiness.`);
   await requireSmoke('--verify-marker','FND-PG-08',`database-after-${dependency}-recovery.log`);outage=null;
   await mark(`FND-OUTAGE-${dependency.toUpperCase()}`,`Stopping ${dependency} produced API503; independent control remained available; recovery restored readiness and retained database marker.`);
  }
  report.status='passed';report.completedAt=new Date().toISOString();await save();console.log('PASS M02-T01 foundation container acceptance completed; product verification requires separate criterion assessment.');
 }catch(error){
  report.status='failed';report.failure={code:error.code||'FND-RUNNER',message:error.code?error.message:'Acceptance runner failed; raw diagnostics withheld.'};report.completedAt=new Date().toISOString();await save();throw error;
 }finally{
  cookie='';csrf='';
  if(outage&&successfulDeployment){
   const recovery=await compose('foundation',['start',outage]);
   let ready=false;if(recovery.code===0){try{await eventually(()=>appStatus(200),'Dependency recovery failed.',180000);ready=true;}catch{}}
   report.recovery={dependency:outage,ready,volumesPreserved:true};await save();
   console.log(ready?'RECOVERED foundation dependency readiness.':'RECOVERY REQUIRED: foundation dependency remains unavailable; volumes were preserved.');
  }
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flags=process.argv.slice(2);
 try{
  check(flags.every(flag=>['--self-test','--ci-disposable-access-reset'].includes(flag)),'FND-ARGUMENT','Unknown acceptance runner option.');
  if(flags.includes('--self-test'))selfTest();
  else await acceptance({ciReset:flags.includes('--ci-disposable-access-reset')});
 }catch(error){console.error(`FAIL ${error.code||'FND-RUNNER'} | ${error.code?error.message:'Acceptance runner failed; raw diagnostics withheld.'}`);process.exitCode=1;}
}
