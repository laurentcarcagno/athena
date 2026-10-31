'use strict';
// Processus d'exécution d'un plugin. Lancé avec --experimental-permission : pas d'écriture disque, pas de
// processus enfant, pas de worker, pas de module natif. Le code du plugin tourne dans un contexte vm sans
// require/process/fetch : il ne voit que l'objet `athena`.
//
// Règle anti-évasion : aucun objet du royaume parent n'est jamais exposé au code du plugin. Seules des chaînes
// traversent la frontière ; promesses, erreurs et objets vus par le plugin sont créés dans le contexte.
const vm = require('node:vm');

let context = null;
let nextRpc = 1;
const pending = new Map();

function bridge(method, argsJson) {
  const id = nextRpc++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    process.send({ type: 'rpc', id, method: String(method), args: String(argsJson) });
  });
}

const BOOTSTRAP = `(function (bridge) {
  const call = (method, ...args) => new Promise((resolve, reject) => {
    bridge(method, JSON.stringify(args)).then(
      (r) => resolve(r === undefined ? undefined : JSON.parse(r)),
      (e) => reject(new Error(String(e && e.message).slice(0, 200))),
    );
  });
  globalThis.athena = Object.freeze({
    log: (...a) => { call('log', a.map(String).join(' ').slice(0, 500)).catch(() => undefined); },
    storage: Object.freeze({
      get: (key) => call('storage.get', String(key)),
      set: (key, value) => call('storage.set', String(key), value),
      delete: (key) => call('storage.delete', String(key)),
    }),
    artifacts: Object.freeze({ get: (key) => call('artifacts.get', String(key)) }),
  });
})`;

function load(code) {
  context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(BOOTSTRAP, context, { timeout: 1000 })(bridge);
  vm.runInContext(code, context, { filename: 'plugin.js', timeout: 1000 });
  const names = vm.runInContext(
    `JSON.stringify({
      fieldTypes: Object.keys((globalThis.plugin && plugin.fieldTypes) || {}),
      hooks: Object.keys((globalThis.plugin && plugin.hooks) || {}),
      actions: Object.keys((globalThis.plugin && plugin.actions) || {}),
      widgets: Object.keys((globalThis.plugin && plugin.widgets) || {}),
      connectors: Object.keys((globalThis.plugin && plugin.connectors) || {}),
      ok: typeof globalThis.plugin === 'object' && globalThis.plugin !== null,
    })`,
    context,
    { timeout: 1000 },
  );
  if (!JSON.parse(names).ok) throw new Error('Le plugin doit définir `plugin`.');
  return names;
}

async function invoke(kind, name, argsJson) {
  context.__kind = String(kind);
  context.__name = String(name);
  context.__args = String(argsJson);
  const promise = vm.runInContext(
    `(function () {
      const table = (plugin[{ fieldType: 'fieldTypes', hook: 'hooks', action: 'actions', widget: 'widgets', connector: 'connectors' }[__kind]] || {});
      const entry = table[__name];
      if (!entry) throw new Error('Point d\\'extension inconnu : ' + __name);
      const args = JSON.parse(__args);
      const run = __kind === 'fieldType' ? () => entry.validate(...args) : () => entry(...args);
      return Promise.resolve(run()).then((v) => (v === undefined ? undefined : JSON.stringify(v)));
    })()`,
    context,
    { timeout: 1000 },
  );
  return await promise;
}

process.on('message', async (message) => {
  if (message.type === 'rpc-result') {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (!entry) return;
    if (message.error) entry.reject(new Error(message.error));
    else entry.resolve(message.result);
    return;
  }
  try {
    if (message.type === 'load') process.send({ type: 'done', id: message.id, result: load(message.code) });
    else if (message.type === 'call') process.send({ type: 'done', id: message.id, result: await invoke(message.kind, message.name, message.args) });
  } catch (error) {
    process.send({ type: 'done', id: message.id, error: String((error && error.message) || error).slice(0, 300) });
  }
});
process.send({ type: 'ready' });
