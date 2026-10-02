export const RELEASE = 'm02-foundation';
export type ControlState = 'booting' | 'needs_configuration' | 'configured' | 'deploying' | 'ready' | 'failed';
export type ServiceName = 'database' | 'storage' | 'migrate' | 'api' | 'worker' | 'web';
export type ServiceState = 'pending' | 'running' | 'healthy' | 'completed' | 'failed';
export interface ControlStatus {
  state: ControlState;
  release: typeof RELEASE;
  configured: boolean;
  appPort: number | null;
  services: { name: ServiceName; state: ServiceState }[];
  job: { id: string; state: 'running' | 'succeeded' | 'failed'; message: string } | null;
  csrfToken: string;
}

export class ServiceError extends Error {
  constructor(message: string, readonly field?: 'appPort', readonly unlockRequired = false) { super(message); }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function shortText(value: unknown, maximum = 500): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}
export function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535;
}
export function parseControl(value: unknown): ControlStatus {
  const states: ControlState[] = ['booting', 'needs_configuration', 'configured', 'deploying', 'ready', 'failed'];
  const names: ServiceName[] = ['database', 'storage', 'migrate', 'api', 'worker', 'web'];
  const serviceStates: ServiceState[] = ['pending', 'running', 'healthy', 'completed', 'failed'];
  if (!object(value) || !states.includes(value.state as ControlState) || value.release !== RELEASE ||
      typeof value.configured !== 'boolean' || !(value.appPort === null || validPort(value.appPort)) ||
      !shortText(value.csrfToken, 2048) || !Array.isArray(value.services) || value.services.length > 6 ||
      !value.services.every(service => object(service) && names.includes(service.name as ServiceName) && serviceStates.includes(service.state as ServiceState)) ||
      new Set(value.services.map(service => service.name)).size !== value.services.length ||
      !(value.job === null || object(value.job) && shortText(value.job.id, 120) && ['running', 'succeeded', 'failed'].includes(String(value.job.state)) && shortText(value.job.message)) ||
      (value.configured && !validPort(value.appPort)) ||
      (['configured', 'deploying', 'ready'].includes(String(value.state)) && !value.configured) ||
      (value.state === 'deploying' && (!object(value.job) || value.job.state !== 'running')) ||
      (value.state === 'ready' && (!object(value.job) || value.job.state !== 'succeeded'))) {
    throw new ServiceError('Unexpected service response. Refresh the status before proceeding.');
  }
  return value as unknown as ControlStatus;
}
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 10000);
  try {
    return await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...init.headers }, signal: controller.signal });
  } catch {
    throw new ServiceError('Connection lost. Check this local service and retry the status check.');
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
async function json(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new ServiceError('Unexpected service response. Refresh the status before proceeding.'); }
}
async function controlResponse(response: Response): Promise<ControlStatus> {
  const body = await json(response);
  if (!response.ok) {
    const message = object(body) && shortText(body.error) ? body.error : 'The service could not complete this request. Check the status and try again.';
    throw new ServiceError(message, object(body) && body.field === 'appPort' ? 'appPort' : undefined, response.status === 401);
  }
  return parseControl(body);
}
export async function getControl(signal?: AbortSignal, allowMissing = false): Promise<ControlStatus | null> {
  const response = await request('/api/control', { signal });
  if (allowMissing && response.status === 404) return null;
  return controlResponse(response);
}
export async function controlCommand(operation: 'unlock' | 'configure' | 'deploy', body: Record<string, unknown>): Promise<ControlStatus> {
  return controlResponse(await request('/api/control/' + operation, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
export async function getFoundation(signal?: AbortSignal): Promise<{ ready: boolean; checkedAt: string }> {
  const [foundationResponse, readiness] = await Promise.all([request('/api/foundation', { signal }), request('/health/ready', { signal })]);
  const value = await json(foundationResponse);
  if (!foundationResponse.ok || !object(value) || value.stage !== 'foundation' || value.release !== RELEASE || typeof value.ready !== 'boolean') {
    throw new ServiceError('Unexpected foundation response. Check readiness again.');
  }
  return { ready: value.ready && readiness.status === 200, checkedAt: new Date().toISOString() };
}
