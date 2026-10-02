import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export async function runFoundationRelease({stateDirectory}) {
  const args=['compose','--project-name','tms-foundation','--file','/release/deploy/foundation.compose.yaml','--env-file',stateDirectory+'/runtime.env'];
  const options={timeout:900000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,DOCKER_CONFIG:stateDirectory+'/docker-config',HOME:stateDirectory}};
  await execute('docker',[...args,'build','--pull'],options);
  await execute('docker',[...args,'up','--detach','--wait','--wait-timeout','180'],options);
}
export async function inspectFoundationRelease({stateDirectory}) {
  const {stdout}=await execute('docker',['compose','--project-name','tms-foundation','--file','/release/deploy/foundation.compose.yaml','--env-file',stateDirectory+'/runtime.env','ps','--all','--format','json'],{timeout:15000,maxBuffer:262144,env:{PATH:process.env.PATH,DOCKER_CONFIG:stateDirectory+'/docker-config',HOME:stateDirectory}});
  const trimmed=stdout.trim();const rows=trimmed.startsWith('[')?JSON.parse(trimmed):trimmed.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  return ['database','storage','migrate','api','worker','web'].map(name=>{const row=rows.find(item=>item.Service===name);const state=name==='migrate'&&row?.State==='exited'&&row.ExitCode===0?'completed':row?.State==='running'&&row.Health==='healthy'?'healthy':row?.State==='running'?'running':'failed';return {name,state};});
}
