import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

const status = (changes: Record<string, unknown> = {}) => ({
  state: 'needs_configuration', release: 'm02-foundation', configured: false,
  appPort: null, services: [], job: null, csrfToken: 'csrf-initial', ...changes,
});
const response = (body: unknown, code = 200) => new Response(JSON.stringify(body), {
  status: code, headers: { 'Content-Type': 'application/json' },
});
const installFetch = (...responses: Response[]) => {
  const mock = vi.fn<typeof fetch>();
  responses.forEach(value => mock.mockResolvedValueOnce(value));
  vi.stubGlobal('fetch', mock);
  return mock;
};
const foundation = { stage: 'foundation', release: 'm02-foundation', ready: true };

describe('foundation surface', () => {
  it('selects foundation only when the control endpoint is absent and reports real readiness and pending identity', async () => {
    const api = installFetch(response({}, 404), response(foundation), response({}, 200));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Transport management foundation' })).toBeVisible();
    expect(await screen.findByText('Foundation ready')).toBeVisible();
    expect(screen.getByText(/Identity and administration are awaiting implementation/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /dispatch|booking|driver/i })).not.toBeInTheDocument();
    expect(api.mock.calls.map(call => call[0])).toEqual(['/api/control', '/api/foundation', '/health/ready']);
  });

  it('does not claim ready on a 503 and retries the actual readiness boundary', async () => {
    installFetch(response({}, 404), response(foundation), response({}, 503), response(foundation), response({}, 200));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Foundation is not ready')).toBeVisible();
    expect(screen.queryByText('Foundation ready')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check readiness again' }));
    expect(await screen.findByText('Foundation ready')).toBeVisible();
  });
});

describe('installer access', () => {
  it('shows loading without actionable deployment controls until status is received', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking this service');
    expect(screen.queryByRole('button', { name: 'Deploy foundation' })).not.toBeInTheDocument();
  });

  it('unlocks a 401 with an operator code, cookie credentials and no pre-session CSRF', async () => {
    const api = installFetch(response({ error: 'Unlock this installer with the local operator code.', code: 'unlock_required' }, 401), response(status()));
    const user = userEvent.setup();
    render(<App />);
    const code = await screen.findByLabelText('Operator code');
    expect(code).toHaveAttribute('type', 'password');
    await user.type(code, 'one-use-test-code');
    await user.click(screen.getByRole('button', { name: 'Unlock installer' }));
    expect(await screen.findByRole('heading', { name: 'Configure the foundation' })).toBeVisible();
    const [url, init] = api.mock.calls[1];
    expect(url).toBe('/api/control/unlock');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(String(init?.body))).toEqual({ code: 'one-use-test-code' });
    expect(screen.queryByDisplayValue('one-use-test-code')).not.toBeInTheDocument();
  });

  it('preserves the locked surface and clears expired or used codes for retry', async () => {
    installFetch(response({ error: 'Unlock required', code: 'unlock_required' }, 401), response({ error: 'Operator code expired or already used.', code: 'unlock_required' }, 401));
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Operator code'), 'expired-test-code');
    await user.click(screen.getByRole('button', { name: 'Unlock installer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Operator code expired or already used.');
    expect(screen.getByLabelText('Operator code')).toHaveValue('');
    expect(screen.queryByRole('heading', { name: 'Transport management foundation' })).not.toBeInTheDocument();
  });
});

describe('installer configuration and reviewed deployment', () => {
  it.each(['0', '1023', '65536', '8180.5', ''])('rejects invalid application port %j without a request and focuses the field', async value => {
    const api = installFetch(response(status()));
    const user = userEvent.setup();
    render(<App />);
    const port = await screen.findByLabelText('Application port');
    await user.clear(port);
    if (value) await user.type(port, value);
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole port number from 1024 to 65535.');
    expect(port).toHaveFocus();
    expect(port).toHaveAttribute('aria-invalid', 'true');
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('saves valid configuration with the current CSRF, then requires an explicit release review before deployment', async () => {
    const api = installFetch(response(status()), response(status({ state: 'configured', configured: true, appPort: 8181, csrfToken: 'csrf-configured' })), response(status({ state: 'deploying', configured: true, appPort: 8181, job: { id: 'job-1', state: 'running', message: 'Starting foundation services.' } })));
    const user = userEvent.setup();
    render(<App />);
    const port = await screen.findByLabelText('Application port');
    await user.clear(port); await user.type(port, '8181');
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    const deploy = await screen.findByRole('button', { name: 'Deploy foundation' });
    expect(deploy).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open application' })).not.toBeInTheDocument();
    expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({ appPort: 8181, csrfToken: 'csrf-initial' });
    await user.click(screen.getByRole('checkbox', { name: /I reviewed release m02-foundation/ }));
    await user.click(deploy);
    expect(JSON.parse(String(api.mock.calls[2][1]?.body))).toEqual({ csrfToken: 'csrf-configured' });
    expect(api.mock.calls[2][1]?.credentials).toBe('same-origin');
    expect(await screen.findByText('Starting foundation services.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open application' })).not.toBeInTheDocument();
  });

  it('shows server port errors inline and preserves the entered value', async () => {
    installFetch(response(status()), response({ error: 'This port is already in use.', field: 'appPort' }, 409));
    const user = userEvent.setup();
    render(<App />);
    const port = await screen.findByLabelText('Application port');
    await user.clear(port); await user.type(port, '8182');
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This port is already in use.');
    expect(port).toHaveValue('8182');
    expect(port).toHaveFocus();
  });

  it('retains a proposed port after an uncertain configuration request and status reconciliation', async () => {
    const configured = status({ state: 'configured', configured: true, appPort: 8180 });
    const api = installFetch(response(configured));
    api.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response(configured));
    const user = userEvent.setup();
    render(<App />);
    const port = await screen.findByLabelText('Application port');
    await user.clear(port); await user.type(port, '8182');
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    await user.click(screen.getByRole('button', { name: 'Retry status check' }));
    expect(await screen.findByRole('button', { name: 'Save configuration' })).toBeEnabled();
    expect(port).toHaveValue('8182');
    expect(screen.getByRole('checkbox', { name: /I reviewed release m02-foundation/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deploy foundation' })).toBeDisabled();
  });

  it('polls deployment every two seconds, then stops when readiness succeeds and exposes only the local ready application', async () => {
    vi.useFakeTimers();
    const running = status({ state: 'deploying', configured: true, appPort: 8180, services: [{ name: 'database', state: 'running' }], job: { id: 'job-1', state: 'running', message: 'Waiting for database readiness.' } });
    const ready = status({ state: 'ready', configured: true, appPort: 8180, services: [{ name: 'database', state: 'healthy' }, { name: 'migrate', state: 'completed' }], job: { id: 'job-1', state: 'succeeded', message: 'Foundation readiness passed.' } });
    const api = installFetch(response(running), response(running), response(ready));
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('link', { name: 'Open application' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(api).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('link', { name: 'Open application' })).toHaveAttribute('href', 'http://127.0.0.1:8180');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('retains deployment status after a network failure and allows an explicit status retry', async () => {
    vi.useFakeTimers();
    const running = status({ state: 'deploying', configured: true, appPort: 8180, job: { id: 'job-1', state: 'running', message: 'Services are starting.' } });
    const api = installFetch(response(running));
    api.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response(status({ state: 'failed', configured: true, appPort: 8180, job: { id: 'job-1', state: 'failed', message: 'Readiness did not pass.' } })));
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('Services are starting.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Retry status check' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Readiness did not pass.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry deployment' })).toBeDisabled();
  });

  it('allows a failed configured deployment to be reviewed and retried with the latest session CSRF', async () => {
    const api = installFetch(response(status({ state: 'failed', configured: true, appPort: 8180, csrfToken: 'csrf-retry', job: { id: 'job-1', state: 'failed', message: 'Readiness failed.' } })), response(status({ state: 'deploying', configured: true, appPort: 8180, job: { id: 'job-2', state: 'running', message: 'Retrying the foundation release.' } })));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /I reviewed release m02-foundation/ }));
    await user.click(screen.getByRole('button', { name: 'Retry deployment' }));
    expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({ csrfToken: 'csrf-retry' });
    expect(await screen.findByText('Retrying the foundation release.')).toBeVisible();
  });

  it('rejects an inconsistent or malformed ready contract without constructing an application URL', async () => {
    installFetch(response(status({ state: 'ready', configured: true, appPort: 65536, job: { id: 'job-1', state: 'succeeded', message: 'Ready' } })));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected service response');
    expect(screen.queryByRole('link', { name: 'Open application' })).not.toBeInTheDocument();
  });
});
