import { useCallback, useEffect, useRef, useState } from 'react';
import { controlCommand, getControl, getFoundation, RELEASE, ServiceError, validPort } from './api';
import type { ControlStatus, ServiceName } from './api';

type Surface = { kind: 'loading' } | { kind: 'foundation' } | { kind: 'installer'; status: ControlStatus } | { kind: 'locked'; message?: string } | { kind: 'error'; message: string };
const errorText = (error: unknown) => error instanceof ServiceError ? error.message : 'The service could not complete this request. Retry the status check.';
const serviceLabels: Record<ServiceName, string> = { database: 'PostgreSQL database', storage: 'Object storage', migrate: 'Database migration', api: '.NET application API', worker: 'Background worker', web: 'React application' };

function Brand({ installer = false }: { installer?: boolean }) {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">T</span><div><strong>TMS</strong><span>{installer ? 'Local installer' : 'Freight & delivery'}</span></div></div>;
}
function Layout({ children, installer = false }: { children: React.ReactNode; installer?: boolean }) {
  return <><a className="skip-link" href="#main">Skip to content</a><header className="masthead"><div className="masthead-inner"><Brand installer={installer} /><span className="release-label">{RELEASE}</span></div></header><main id="main" className="page" tabIndex={-1}>{children}</main><footer className="page-footer">{installer ? 'Independent control plane · local operator access' : 'Application foundation · UK freight & delivery'}</footer></>;
}
function ErrorNotice({ message, retry, busy = false }: { message: string; retry?: () => void; busy?: boolean }) {
  return <div className="notice error" role="alert"><div><strong>Action required</strong><p>{message}</p></div>{retry && <button type="button" className="secondary" disabled={busy} onClick={retry}>Retry status check</button>}</div>;
}
export function App() {
  const [surface, setSurface] = useState<Surface>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setSurface({ kind: 'loading' });
    getControl(controller.signal, true).then(status => {
      if (!controller.signal.aborted) setSurface(status ? { kind: 'installer', status } : { kind: 'foundation' });
    }).catch(error => {
      if (!controller.signal.aborted) setSurface(error instanceof ServiceError && error.unlockRequired ? { kind: 'locked' } : { kind: 'error', message: errorText(error) });
    });
    return () => controller.abort();
  }, [attempt]);
  const locked = (message?: string) => setSurface({ kind: 'locked', message });
  if (surface.kind === 'foundation') return <Foundation />;
  if (surface.kind === 'installer') return <Installer initial={surface.status} onLocked={locked} />;
  if (surface.kind === 'locked') return <Unlock initialMessage={surface.message} onUnlocked={status => setSurface({ kind: 'installer', status })} />;
  return <Layout><div className="intro"><div><p className="eyebrow">Service connection</p><h1>Transport management</h1><p>Connecting to the service on this host.</p></div></div>{surface.kind === 'loading' ? <section className="panel loading-panel" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Checking this service</p></section> : <ErrorNotice message={surface.message} retry={() => setAttempt(value => value + 1)} />}</Layout>;
}
function Foundation() {
  const [result, setResult] = useState<{ ready: boolean; checkedAt: string } | null>(null);
  const [error, setError] = useState(''); const [checking, setChecking] = useState(true); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setChecking(true); setError('');
    getFoundation(controller.signal).then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(failure => { if (!controller.signal.aborted) { setError(errorText(failure)); setResult(null); } })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [attempt]);
  return <Layout><div className="intro"><div><p className="eyebrow">Application · foundation release</p><h1>Transport management foundation</h1><p>Foundation services are checked below. Identity and administration are awaiting implementation.</p></div><span className="badge neutral">Foundation stage</span></div><div className="foundation-grid"><section className="panel readiness-panel"><div className="panel-top"><span className="panel-kicker">Service readiness</span><span className={'status-dot ' + (result?.ready && !checking ? 'good' : 'pending')} aria-hidden="true" /></div><h2>{checking ? 'Checking readiness' : error ? 'Readiness unavailable' : result?.ready ? 'Foundation ready' : 'Foundation is not ready'}</h2><p>{checking ? 'Reading the foundation API and readiness endpoint.' : result?.ready ? 'The foundation API and readiness endpoint responded successfully.' : 'The application cannot be marked ready until both checks pass.'}</p>{error && <div className="field-error" role="alert">{error}</div>}<dl className="facts"><div><dt>Release</dt><dd>{RELEASE}</dd></div><div><dt>Identity / sign-in</dt><dd>Awaiting implementation</dd></div><div><dt>Administration</dt><dd>Awaiting implementation</dd></div><div><dt>Last checked</dt><dd>{result ? <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleTimeString('en-GB')}</time> : 'No successful status check'}</dd></div></dl><button type="button" className="secondary" disabled={checking} onClick={() => setAttempt(value => value + 1)}>{checking ? 'Checking…' : 'Check readiness again'}</button><span className="sr-only" role="status" aria-live="polite">{checking ? 'Checking foundation readiness.' : result?.ready ? 'Readiness check passed.' : 'Readiness check did not pass.'}</span></section><section className="panel next-panel"><p className="panel-kicker">What this release provides</p><h2>A foundation for the transport operation</h2><p>A React application shell connected to the .NET foundation API. Transport workflows will be added after identity, tenancy and administration are implemented and verified.</p><ol className="next-steps"><li><span>01</span><div><strong>Identity and access</strong><p>Authentication, tenant membership and permission enforcement are pending.</p></div></li><li><span>02</span><div><strong>Administration</strong><p>System and tenant administration, including registered role menus, are pending.</p></div></li><li><span>03</span><div><strong>Transport workflows</strong><p>Bookings, dispatch, route planning, delivery and driver tracking are pending.</p></div></li></ol></section></div><p className="boundary-note">This foundation does not yet provide operational transport features or user accounts.</p></Layout>;
}
function Unlock({ initialMessage, onUnlocked }: { initialMessage?: string; onUnlocked: (status: ControlStatus) => void }) {
  const [code, setCode] = useState(''); const [error, setError] = useState(initialMessage || ''); const [busy, setBusy] = useState(false); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (error && !busy) input.current?.focus(); }, [error, busy]);
  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) { setError('Enter the local operator code.'); input.current?.focus(); return; }
    const submittedCode = code.trim(); setCode(''); setError(''); setBusy(true);
    try { onUnlocked(await controlCommand('unlock', { code: submittedCode })); }
    catch (failure) { setError(errorText(failure)); input.current?.focus(); }
    finally { setBusy(false); }
  }
  return <Layout installer><div className="intro"><div><p className="eyebrow">Installer access</p><h1>Unlock this installer</h1><p>Pair this browser with the local deployment control plane.</p></div><span className="badge neutral">Locked</span></div><div className="unlock-grid"><section className="panel"><h2>Local operator access</h2><p>The local operator obtains a one-use code from the prepared host. Enter it here to create this browser’s installer session.</p><form onSubmit={unlock} noValidate><label htmlFor="operator-code">Operator code</label><input ref={input} id="operator-code" type="password" autoComplete="one-time-code" value={code} disabled={busy} onChange={event => setCode(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'operator-code-help operator-code-error' : 'operator-code-help'} /><p id="operator-code-help" className="field-help">The code is cleared after submission. The installer keeps the paired session in an HttpOnly cookie. It expires after 30 days or when the operator resets access.</p>{error && <div id="operator-code-error" className="field-error" role="alert">{error}</div>}<button className="primary" disabled={busy} type="submit">{busy ? 'Unlocking…' : 'Unlock installer'}</button></form></section><section className="panel muted-panel"><p className="panel-kicker">Prepared-host command</p><h2>Obtain an operator code</h2><p>Run this command on the local host using the prepared installer deployment:</p><pre className="command"><code>docker compose -f deploy/installer.compose.yaml exec installer node /release/deploy/control/access-code.mjs</code></pre><p className="field-help">Keep the code private. If it has expired or was already used, reset access and restart the installer using the commands below. Then enter the new code. Resetting access revokes existing paired sessions.</p><pre className="command"><code>{'docker compose -f deploy/installer.compose.yaml exec installer node /release/deploy/control/access-code.mjs --reset\ndocker compose -f deploy/installer.compose.yaml restart installer'}</code></pre><p className="boundary-note">The installer is separate from future TMS user sign-in. It manages only this registered foundation release.</p></section></div></Layout>;
}
function Installer({ initial, onLocked }: { initial: ControlStatus; onLocked: (message?: string) => void }) {
  const [status, setStatus] = useState(initial); const [port, setPort] = useState(String(initial.appPort ?? 8180));
  const [portError, setPortError] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [reviewed, setReviewed] = useState(false);
  const [checkedAt, setCheckedAt] = useState(new Date().toISOString()); const portInput = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (portError && !busy) portInput.current?.focus(); }, [portError, busy]);
  const accept = useCallback((next: ControlStatus, syncPort = false) => { setStatus(next); setError(''); setPortError(''); setCheckedAt(new Date().toISOString()); if (syncPort && next.configured && next.appPort !== null) setPort(String(next.appPort)); }, []);
  const fail = useCallback((failure: unknown) => { if (failure instanceof ServiceError && failure.unlockRequired) onLocked('The installer session expired. Obtain an operator code to pair this browser again.'); else setError(errorText(failure)); }, [onLocked]);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { const next = await getControl(); if (mounted.current && next) accept(next); }
    catch (failure) { if (mounted.current) fail(failure); }
    finally { if (mounted.current) setBusy(false); }
  }, [accept, fail]);
  useEffect(() => {
    if (status.state !== 'deploying' || error || busy) return;
    const timer = window.setTimeout(() => { void refresh(); }, 2000);
    return () => window.clearTimeout(timer);
  }, [status, error, busy, refresh]);
  async function configure(event: React.FormEvent) {
    event.preventDefault(); const value = /^\d+$/.test(port) ? Number(port) : NaN;
    if (!validPort(value)) { setPortError('Enter a whole port number from 1024 to 65535.'); portInput.current?.focus(); return; }
    setBusy(true); setPortError(''); setError(''); setReviewed(false);
    try { accept(await controlCommand('configure', { appPort: value, csrfToken: status.csrfToken }), true); }
    catch (failure) { if (failure instanceof ServiceError && failure.field === 'appPort') { setPortError(failure.message); portInput.current?.focus(); } else fail(failure); }
    finally { setBusy(false); }
  }
  async function deploy() {
    if (!reviewed || busy || error || !status.configured || !['configured', 'failed'].includes(status.state)) return;
    setBusy(true); setError(''); setReviewed(false);
    try { accept(await controlCommand('deploy', { csrfToken: status.csrfToken })); }
    catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }
  const canConfigure = ['needs_configuration', 'configured', 'failed'].includes(status.state);
  const canDeploy = status.configured && ['configured', 'failed'].includes(status.state);
  const titles: Record<ControlStatus['state'], string> = { booting: 'Installer is starting', needs_configuration: 'Configure the foundation', configured: 'Review deployment', deploying: 'Deploying the foundation', ready: 'Foundation is ready', failed: 'Deployment needs attention' };
  const stateLabels: Record<ControlStatus['state'], string> = { booting: 'Starting', needs_configuration: 'Configuration required', configured: 'Awaiting deployment', deploying: 'Deployment running', ready: 'Ready', failed: 'Deployment failed' };
  const applicationReady = status.state === 'ready' && status.configured && validPort(status.appPort) && status.job?.state === 'succeeded' && !error;
  return <Layout installer><div className="intro"><div><p className="eyebrow">Installer · independent control plane</p><h1>{titles[status.state]}</h1><p>Install the registered release on this prepared local host.</p></div><span className={'badge ' + (status.state === 'ready' ? 'good' : status.state === 'failed' ? 'bad' : 'neutral')}>{stateLabels[status.state]}</span></div><ol className="steps" aria-label="Installation stages"><li className={status.configured ? 'complete' : 'active'}><span>1</span>Configure</li><li className={status.state === 'configured' || status.state === 'failed' ? 'active' : ['deploying', 'ready'].includes(status.state) ? 'complete' : ''}><span>2</span>Review</li><li className={status.state === 'deploying' ? 'active' : status.state === 'ready' ? 'complete' : ''}><span>3</span>Deploy</li><li className={status.state === 'ready' ? 'active' : ''}><span>4</span>Readiness</li></ol>{error && <ErrorNotice message={error} retry={() => { setReviewed(false); void refresh(); }} busy={busy} />}<div className="installer-grid"><div className="stack"><section className="panel"><div className="panel-top"><h2>Application settings</h2><span className="panel-kicker">Local host</span></div>{canConfigure ? <form onSubmit={configure} noValidate><label htmlFor="app-port">Application port</label><div className="port-row"><span className="port-prefix" aria-hidden="true">127.0.0.1:</span><input ref={portInput} id="app-port" type="text" inputMode="numeric" autoComplete="off" maxLength={8} value={port} disabled={busy || Boolean(error)} onChange={event => { setPort(event.target.value); setPortError(''); setReviewed(false); }} aria-invalid={Boolean(portError)} aria-describedby={portError ? 'port-help port-error' : 'port-help'} /></div><p id="port-help" className="field-help">A whole number from 1024 to 65535. Availability is checked by the control plane when you save.</p>{portError && <div id="port-error" className="field-error" role="alert">{portError}</div>}<button className="secondary" type="submit" disabled={busy || Boolean(error)}>{busy ? 'Saving / checking…' : 'Save configuration'}</button></form> : <dl className="facts"><div><dt>Application port</dt><dd>{status.appPort ?? 'Not configured'}</dd></div><div><dt>Exposure</dt><dd>Local loopback host</dd></div></dl>}<p className="boundary-note">Service secrets are generated server-side. This form accepts no passwords or API keys.</p></section>{canDeploy && <section className="panel review-panel"><p className="panel-kicker">Review the registered operation</p><h2>Deploy {RELEASE}</h2><p>Starts the database, object storage, migration, .NET API, background worker and React web application.</p><dl className="facts"><div><dt>Application address</dt><dd className="mono">http://127.0.0.1:{status.appPort}</dd></div><div><dt>Release scope</dt><dd>Foundation only</dd></div><div><dt>Identity / administration</dt><dd>Awaiting implementation</dd></div></dl><label className="review-checkbox"><input type="checkbox" checked={reviewed} disabled={busy || Boolean(error) || port !== String(status.appPort)} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed release m02-foundation, the application port and the services that will start.</span></label>{port !== String(status.appPort) && <p className="field-help">Save the edited application port before reviewing deployment.</p>}<button className="primary" type="button" disabled={!reviewed || busy || Boolean(error) || port !== String(status.appPort)} onClick={() => void deploy()}>{busy ? 'Submitting deployment…' : status.state === 'failed' ? 'Retry deployment' : 'Deploy foundation'}</button><p className="field-help">The control plane validates settings, serialises deployments and checks readiness.</p></section>}{applicationReady && <section className="panel ready-panel"><p className="panel-kicker">Readiness passed</p><h2>Open the foundation</h2><p>The registered deployment succeeded and the control plane reports foundation readiness.</p><a className="primary button-link" href={'http://127.0.0.1:' + status.appPort} target="_blank" rel="noopener noreferrer" aria-label="Open application">Open application<span className="sr-only"> in a new tab</span></a><p className="field-help">Identity, administration and operational TMS features remain pending.</p></section>}</div><section className="panel services-panel"><div className="panel-top"><div><p className="panel-kicker">Control-plane report</p><h2>Deployment status</h2></div>{status.state === 'deploying' && !error && <span className="badge neutral">Checks every 2 seconds</span>}</div>{status.job ? <div className={'job-report ' + (status.job.state === 'failed' ? 'job-failed' : '')}><p className="job-label">Job {status.job.id} · {status.job.state}</p><p role="status" aria-live="polite" aria-atomic="true">{status.job.message}</p></div> : <p className="empty-status">No deployment job has started.</p>}{status.services.length ? <div className="service-list">{status.services.map(service => <div key={service.name} className="service-row"><span>{serviceLabels[service.name]}</span><span className={'badge ' + (['healthy', 'completed'].includes(service.state) ? 'good' : service.state === 'failed' ? 'bad' : 'neutral')}>{service.state}</span></div>)}</div> : <p className="field-help">Service state will appear when the control plane reports it.</p>}<dl className="facts compact"><div><dt>Release</dt><dd>{status.release}</dd></div><div><dt>Last status check</dt><dd><time dateTime={checkedAt}>{new Date(checkedAt).toLocaleTimeString('en-GB')}</time></dd></div></dl>{status.state !== 'deploying' && <button className="secondary" type="button" disabled={busy} onClick={() => { setReviewed(false); void refresh(); }}>{busy ? 'Checking…' : 'Refresh status'}</button>}<p className="boundary-note">Readiness is reported by the server. Opening this page does not mark the application installed.</p></section></div></Layout>;
}
