// Minimal localStorage for the Node test environment.
//
// roomHistory.js is the only module under test that touches a browser API,
// and it only needs get/set/remove. Stubbing those few methods keeps the
// suite dependency-free and fast, rather than booting jsdom to get one
// object.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();

  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    }
  };
}
