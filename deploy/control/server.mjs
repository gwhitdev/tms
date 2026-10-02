import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runFoundationRelease,inspectFoundationRelease} from './release.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const equals=(left,right)=>typeof left==='string'&&typeof right==='string'&&Buffer.byteLength(left)===Buffer.byteLength(right)&&timingSafeEqual(Buffer.from(left),Buffer.from(right));
const services=['database','storage','migrate','api','worker','web'];
const emptyState=()=>({state:'needs_configuration',release:'m02-foundation',configured:false,appPort:null,services:services.map(name=>({name,state:'pending'})),job:null});
async function atomic(file,value){await fs.writeFile(file+'.tmp',value,{mode:0o600});await fs.rename(file+'.tmp',file);}
async function existing(file,fallback){try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}

export async function createControlServer(options={}) {
  const stateDirectory=options.stateDirectory||'/control';
  const secretDirectories=options.secretDirectories||Object.fromEntries(['database','migrator','api','worker','storage'].map(name=>[name,`/secrets/${name}`]));
  await fs.mkdir(stateDirectory,{recursive:true,mode:0o700});
  const stateFile=path.join(stateDirectory,'state.json');
  let state=JSON.parse(await existing(stateFile,JSON.stringify(emptyState())));
  const codeFile=path.join(stateDirectory,'operator-code');
  const sessionFile=path.join(stateDirectory,'operator-session-hash');
  const savedSession=JSON.parse(await existing(sessionFile,'{}'));
  let sessionHash=savedSession.hash||'';let sessionExpiresAt=savedSession.expiresAt||0;
  let code=(await existing(codeFile,'')).trim();
  if(!sessionHash&&!code){code=randomBytes(32).toString('hex');await atomic(codeFile,code);}
  if(state.state==='deploying'){state={...state,state:'failed',job:{...state.job,state:'failed',message:'Installation was interrupted. Review the release and retry.'}};await atomic(stateFile,JSON.stringify(state));}
  let unlockAttempts=0;let unlockWindow=Date.now();let busy=false;let mutationBusy=false;
  const origin=()=>typeof options.origin==='function'?options.origin():options.origin||process.env.CONTROL_ORIGIN||'http://127.0.0.1:8740';
  const save=async()=>atomic(stateFile,JSON.stringify(state));
  const snapshot=token=>({...state,csrfToken:hash('csrf:'+token)});
  const runRelease=options.runRelease||runFoundationRelease;
  const inspectRelease=options.inspectRelease||(options.runRelease?undefined:inspectFoundationRelease);
  const json=(response,status,body,extra={})=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});response.end(JSON.stringify(body));};
  const server=http.createServer(async(request,response)=>{
    let ownsMutation=false;
    try {
      if(request.headers.host!==new URL(origin()).host)return json(response,403,{error:'Installer host is not allowed.'});
      const route=new URL(request.url,origin()).pathname;
      if(route==='/health/live'&&request.method==='GET')return json(response,200,{ready:true});
      if(request.method==='GET'&&!route.startsWith('/api/')){
        const assetRoot=options.assetRoot||'/release/web/dist';
        const requested=route==='/'||route==='/installer'?'index.html':route.slice(1);
        if(requested.includes('..')||requested.includes('\\'))return json(response,404,{error:'Not found.'});
        const file=path.resolve(assetRoot,requested);if(!file.startsWith(path.resolve(assetRoot)+path.sep))return json(response,404,{error:'Not found.'});
        const content=await fs.readFile(file).catch(()=>null);if(!content)return json(response,404,{error:'Not found.'});
        const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
        response.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return response.end(content);
      }
      const token=/\btms_operator=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie||'')?.[1]||'';
      const authorised=Boolean(sessionHash&&Date.now()<sessionExpiresAt&&token&&equals(hash(token),sessionHash));
      if(request.method==='GET'&&route==='/api/control'){
        if(!authorised)return json(response,401,{error:'Unlock this installer with the local operator code.',code:'unlock_required'});
        const readinessFailure=state.state==='failed'&&state.job?.message==='Foundation readiness has changed. Inspect the services locally and retry the approved deployment.';
        if((state.state==='ready'||readinessFailure)&&inspectRelease){try{const current=await inspectRelease({stateDirectory});state={...state,services:current};if(current.some(item=>!['healthy','completed'].includes(item.state)))state={...state,state:'failed',job:{...state.job,state:'failed',message:'Foundation readiness has changed. Inspect the services locally and retry the approved deployment.'}};else if(readinessFailure)state={...state,state:'ready',job:{...state.job,state:'succeeded',message:'Foundation services recovered and passed readiness checks.'}};await save();}catch{return json(response,503,{error:'Current foundation service state is unavailable. Retry the status check.'});}}
        return json(response,200,snapshot(token));
      }
      if(request.method!=='POST'||!['/api/control/unlock','/api/control/configure','/api/control/deploy'].includes(route))return json(response,404,{error:'Not found.'});
      if(request.headers.origin!==origin())return json(response,403,{error:'Installer origin is not allowed.'});
      if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))return json(response,415,{error:'JSON is required.'});
      let input='';for await(const chunk of request){input+=chunk;if(Buffer.byteLength(input)>4096)return json(response,413,{error:'Request is too large.'});}
      let body;try{body=JSON.parse(input);}catch{return json(response,400,{error:'Invalid JSON.'});}
      if(!body||Array.isArray(body)||typeof body!=='object')return json(response,422,{error:'Invalid request.'});
      if(mutationBusy)return json(response,409,{error:'An installer operation is already running.'});
      mutationBusy=true;ownsMutation=true;
      if(route==='/api/control/unlock'){
        if(Object.keys(body).some(key=>key!=='code'))return json(response,422,{error:'Unknown settings are not allowed.'});
        if(Date.now()-unlockWindow>60000){unlockAttempts=0;unlockWindow=Date.now();}
        if(unlockAttempts>=5)return json(response,429,{error:'Too many attempts. Retry in one minute.'});
        unlockAttempts++;
        if(!code||typeof body.code!=='string'||!equals(body.code.trim(),code))return json(response,401,{error:'The code is invalid or has already been used.',code:'unlock_required'});
        const issued=randomBytes(32).toString('hex');sessionHash=hash(issued);sessionExpiresAt=Date.now()+2592000000;await atomic(sessionFile,JSON.stringify({hash:sessionHash,expiresAt:sessionExpiresAt}));code='';await atomic(codeFile,'');
        return json(response,200,snapshot(issued),{'Set-Cookie':`tms_operator=${issued}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${origin().startsWith('https:')?'; Secure':''}`});
      }
      if(!authorised)return json(response,401,{error:'Unlock this installer with the local operator code.',code:'unlock_required'});
      if(!equals(body.csrfToken,hash('csrf:'+token)))return json(response,403,{error:'Installer session changed. Reload and retry.'});
      const allowed=route.endsWith('configure')?['appPort','csrfToken']:['csrfToken'];
      if(Object.keys(body).some(key=>!allowed.includes(key)))return json(response,422,{error:'Unknown settings are not allowed.'});
      if(busy)return json(response,409,{error:'An installation is already running.'});
      if(route.endsWith('configure')){
        if(!Number.isInteger(body.appPort)||body.appPort<1024||body.appPort>65535||body.appPort===Number(new URL(origin()).port))return json(response,422,{error:'Choose a whole-number application port from 1024 to 65535, different from the installer port.',field:'appPort'});
        for(const [name,file] of Object.entries({database:'db_password',migrator:'migrator_password',api:'api_password',worker:'worker_password'})){
          await fs.mkdir(secretDirectories[name],{recursive:true,mode:0o700});const target=path.join(secretDirectories[name],file);if(!await existing(target,''))await atomic(target,randomBytes(32).toString('hex'));
        }
        await fs.mkdir(secretDirectories.storage,{recursive:true,mode:0o700});
        const storageFile=path.join(secretDirectories.storage,'s3_config.json');
        if(!await existing(storageFile,''))await atomic(storageFile,JSON.stringify({identities:[{name:'foundation',credentials:[{accessKey:randomBytes(16).toString('hex'),secretKey:randomBytes(32).toString('hex')}],actions:['Admin','Read','Write','List','Tagging']}]}));
        // Secret volumes are explicitly read-only to consumers; files must be readable by their non-root service UID.
        for(const [name,file] of Object.entries({database:'db_password',migrator:'migrator_password',api:'api_password',worker:'worker_password',storage:'s3_config.json'})){await fs.chmod(secretDirectories[name],0o755);await fs.chmod(path.join(secretDirectories[name],file),0o444);}
        await atomic(path.join(stateDirectory,'runtime.env'),`TMS_APP_PORT=${body.appPort}\n`);
        state={...state,configured:true,appPort:body.appPort,state:'configured',job:null};await save();return json(response,200,snapshot(token));
      }
      if(!state.configured)return json(response,409,{error:'Save installation settings first.'});
      busy=true;state={...state,state:'deploying',services:services.map(name=>({name,state:'pending'})),job:{id:randomBytes(12).toString('hex'),state:'running',message:'Building and installing the approved foundation release.'}};await save();json(response,202,snapshot(token));
      try{await runRelease({appPort:state.appPort,stateDirectory});state={...state,state:'ready',services:services.map(name=>({name,state:name==='migrate'?'completed':'healthy'})),job:{...state.job,state:'succeeded',message:'Foundation services passed readiness checks.'}};}
      catch{state={...state,state:'failed',job:{...state.job,state:'failed',message:'Installation did not pass build or readiness checks. Inspect the fixed Compose release locally, then retry.'}};}
      finally{busy=false;await save();}
    } catch {if(!response.headersSent)json(response,500,{error:'Installer could not complete this operation. Retry or inspect the local control volume.'});}
    finally {if(ownsMutation)mutationBusy=false;}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await createControlServer();server.listen(8740,'0.0.0.0',()=>process.stdout.write('TMS local installer listening; retrieve the one-use code with the local access-code command.\n'));
}
