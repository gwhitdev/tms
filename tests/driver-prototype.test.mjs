import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

// Event-adapter checks for the actual inline prototype script. This deliberately
// small document stub is not a browser, layout engine or accessibility audit.
const prototypePath = process.env.TMS_PROTOTYPE_TEST_SOURCE ||
  fileURLToPath(new URL('../docs/m01/prototypes.html', import.meta.url));
const html = readFileSync(prototypePath, 'utf8');
const catalogue = html.match(/<script id="registered-catalogue" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(value => value.includes("'use strict'"));
assert.ok(catalogue && script, 'The canonical prototype must expose its real catalogue and inline interaction script.');

function workshop() {
  const nodes = new Map();
  const allNodes = [];
  const listeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    getElementById(id) { return nodes.get(id) || null; },
    querySelectorAll(selector) { return allNodes.filter(node => node.connected && node.matches(selector)); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  class Node {
    constructor(id = '', attrs = {}, parent = null) {
      this.id = id;
      this.attrs = { ...attrs, ...(id ? { id } : {}) };
      this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
        .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value]));
      this.value = attrs.value || '';
      this.checked = Object.hasOwn(attrs, 'checked');
      this.disabled = Object.hasOwn(attrs, 'disabled');
      this.hidden = Object.hasOwn(attrs, 'hidden');
      this.parent = parent;
      this.connected = true;
      this.writes = 0;
      this._html = '';
      this.textContent = '';
      this.style = {};
      allNodes.push(this);
      if (id) nodes.set(id, this);
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this.writes++;
      this._html = String(value);
      for (const node of allNodes) {
        if (node !== this && node.descendsFrom(this)) {
          node.connected = false;
          if (node.id && nodes.get(node.id) === node) nodes.delete(node.id);
        }
      }
      for (const match of this._html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)) {
        const attrs = {};
        for (const attribute of match[1].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
          attrs[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
        }
        if (attrs.id || attrs['data-action'] || attrs['data-field']) new Node(attrs.id || '', attrs, this);
      }
    }
    descendsFrom(ancestor) { for (let parent = this.parent; parent; parent = parent.parent) if (parent === ancestor) return true; return false; }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      const attribute = selector.match(/\[([\w-]+)(?:([\^]?=)["']?([^"'\]]*)["']?)?\]/);
      if (!attribute) return false;
      const [, name, operation, expected] = attribute;
      if (!Object.hasOwn(this.attrs, name)) return false;
      return !operation || (operation === '^=' ? String(this.attrs[name]).startsWith(expected) : String(this.attrs[name]) === expected);
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    focus() { document.activeElement = this; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    querySelectorAll(selector) { return allNodes.filter(node => node.connected && node.descendsFrom(this) && node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    showModal() {}
    close() {}
  }
  for (const id of ['registered-catalogue', 'roleSelect', 'stateSelect', 'navigation', 'roleContext', 'pageTitle', 'pageSummary', 'stateBanner', 'content', 'announcement', 'main', 'confirmDialog', 'confirmTitle', 'confirmText']) new Node(id);
  nodes.get('registered-catalogue').textContent = catalogue;
  const context = vm.createContext({ document, window: {}, console });
  vm.runInContext(script, context, { filename: prototypePath, timeout: 1000 });
  const emit = (type, target) => {
    const event = { target, preventDefault() {}, stopPropagation() {} };
    for (const handler of listeners.get(type) || []) handler(event);
  };
  const changeRole = role => { const target = nodes.get('roleSelect'); target.value = role; emit('change', target); };
  changeRole('driver');
  return {
    edit(field, value) {
      const target = allNodes.findLast(node => node.connected && node.dataset.field === field);
      assert.ok(target, `Rendered input ${field} must exist before editing.`);
      if (typeof value === 'boolean') target.checked = value;
      else target.value = value;
      emit('input', target);
      emit('change', target);
    },
    click(action) {
      const target = allNodes.findLast(node => node.connected && node.dataset.action === action);
      assert.ok(target, `Rendered action ${action} must exist.`);
      // Direct handler dispatch also exercises the command's duplicate guard;
      // a real browser suppresses clicks on disabled buttons.
      emit('click', target);
    },
    snapshot() { return JSON.parse(JSON.stringify(context.window.tmsPrototype.snapshot())); },
    contentWrites() { return nodes.get('content').writes; },
    visibleFormMarkup() {
      const content = nodes.get('content');
      return [content.innerHTML, ...allNodes.filter(node => node.connected && node.descendsFrom(content))
        .map(node => `${node.innerHTML} ${node.textContent}`)].join('\n');
    },
  };
}

function completeRequiredEvidence(view) {
  view.click('driver-arrive');
  view.click('photo-marker');
  view.edit('driver-signature', true);
}

for (const [field, value, property] of [
  ['driver-quantity', '2', 'quantity'],
  ['driver-reason', 'Shortage', 'reason'],
  ['driver-signature', true, 'signature'],
  ['driver-recipient', 'Fixture recipient updated', 'recipient'],
]) {
  test(`editing ${field} preserves the form subtree and draft value`, () => {
    const view = workshop();
    if (field === 'driver-reason') view.edit('driver-quantity', '2');
    const writes = view.contentWrites();
    view.edit(field, value);
    assert.equal(view.snapshot().driver[property], value);
    assert.equal(view.contentWrites(), writes, 'Input/change must not replace the clicked form controls before the next click.');
  });
}

test('missing arrival, photo and signature leave the queue empty and show specific form errors', () => {
  const view = workshop();
  view.edit('driver-recipient', 'Preserved fixture recipient');
  view.click('record-delivery');
  const { driver } = view.snapshot();
  assert.equal(driver.queue.length, 0);
  assert.equal(driver.recipient, 'Preserved fixture recipient');
  assert.ok(Array.isArray(driver.errors), 'Validation errors must be retained with the driver draft.');
  assert.deepEqual(driver.errors.map(error => error.field).sort(), ['arrival', 'photo', 'signature']);
  const markup = view.visibleFormMarkup();
  assert.match(markup, /Delivery not recorded/);
  for (const error of driver.errors) assert.ok(markup.includes(error.message), `The form must display: ${error.message}`);
});

test('a complete full delivery creates one local queued event and cannot be recorded twice', () => {
  const view = workshop();
  completeRequiredEvidence(view);
  view.click('record-delivery');
  let driver = view.snapshot().driver;
  assert.equal(driver.recorded, true);
  assert.equal(driver.queue.length, 1);
  assert.equal(driver.queue[0].delivered, 3);
  assert.equal(driver.queue[0].status, 'Queued');
  const firstEvent = driver.queue[0];
  view.click('record-delivery');
  driver = view.snapshot().driver;
  assert.deepEqual(driver.queue, [firstEvent]);
  assert.equal(driver.nextEvent, 2);
});

test('a partial delivery records offline with its reason and reconnect does not acknowledge it', () => {
  const view = workshop();
  view.click('driver-connectivity');
  completeRequiredEvidence(view);
  view.edit('driver-quantity', '2');
  view.edit('driver-reason', 'Receiver declined');
  view.edit('driver-recipient', 'Fixture receiver');
  view.click('record-delivery');
  let driver = view.snapshot().driver;
  assert.equal(driver.online, false);
  assert.equal(driver.queue.length, 1);
  assert.deepEqual({ delivered: driver.queue[0].delivered, reason: driver.queue[0].reason, recipient: driver.queue[0].recipient, status: driver.queue[0].status },
    { delivered: 2, reason: 'Receiver declined', recipient: 'Fixture receiver', status: 'Queued' });
  view.click('sync-driver');
  assert.equal(view.snapshot().driver.queue[0].status, 'Queued');
  view.click('driver-connectivity');
  driver = view.snapshot().driver;
  assert.equal(driver.online, true);
  assert.equal(driver.queue[0].status, 'Queued');
  view.click('sync-driver');
  assert.equal(view.snapshot().driver.queue[0].status, 'Acknowledged');
});

test('a missing partial-delivery reason gives a visible reason error and preserves evidence', () => {
  const view = workshop();
  completeRequiredEvidence(view);
  view.edit('driver-quantity', '2');
  view.click('record-delivery');
  const { driver } = view.snapshot();
  assert.equal(driver.queue.length, 0);
  assert.equal(driver.quantity, '2');
  assert.equal(driver.photo, true);
  assert.equal(driver.signature, true);
  assert.ok(driver.errors?.some(error => error.field === 'reason'));
  assert.match(view.visibleFormMarkup(), /Delivery not recorded/);
  for (const error of driver.errors) assert.ok(view.visibleFormMarkup().includes(error.message));
});

for (const quantity of ['', '1.5', '-1', '4']) {
  test(`invalid quantity ${JSON.stringify(quantity)} is rejected with a visible quantity error`, () => {
    const view = workshop();
    completeRequiredEvidence(view);
    view.edit('driver-quantity', '2');
    view.edit('driver-reason', 'Shortage');
    view.edit('driver-quantity', quantity);
    view.click('record-delivery');
    const { driver } = view.snapshot();
    assert.equal(driver.queue.length, 0, 'Blank input must not be coerced into a valid zero-delivery record.');
    assert.equal(driver.quantity, quantity);
    assert.ok(driver.errors?.some(error => error.field === 'quantity'));
    for (const error of driver.errors) assert.ok(view.visibleFormMarkup().includes(error.message));
  });
}

test('a whitespace-only recipient is rejected without discarding the captured evidence', () => {
  const view = workshop();
  completeRequiredEvidence(view);
  view.edit('driver-recipient', '   ');
  view.click('record-delivery');
  const { driver } = view.snapshot();
  assert.equal(driver.queue.length, 0);
  assert.equal(driver.photo, true);
  assert.equal(driver.signature, true);
  assert.ok(driver.errors?.some(error => error.field === 'recipient'));
});

test('a manifest conflict preserves the queued event through dispatch review', () => {
  const view = workshop();
  completeRequiredEvidence(view);
  view.click('record-delivery');
  const before = view.snapshot().driver.queue[0];
  view.click('driver-conflict');
  view.click('sync-driver');
  let event = view.snapshot().driver.queue[0];
  assert.deepEqual({ ...event, status: 'Queued' }, before);
  assert.equal(event.status, 'Needs review');
  view.click('resolve-driver');
  event = view.snapshot().driver.queue[0];
  assert.deepEqual({ ...event, status: 'Queued' }, before);
  assert.equal(event.status, 'Retained for dispatch review');
});
