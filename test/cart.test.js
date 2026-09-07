import test from 'node:test';
import assert from 'node:assert/strict';
import { CartStore } from '../src/cart/cart.js';

test('cart lines: add, update, remove, substitutes', () => {
  let changes = 0;
  const store = new CartStore({ onChange: () => changes++ });
  const cart = store.createCart();
  store.setLine(cart.id, { productId: 'milk-3', qty: 2 });
  store.addToLine(cart.id, 'milk-3', 1);
  store.setLine(cart.id, { productId: 'cucumber', qty: 1.5, substituteProductId: 'tomato' });
  assert.deepEqual(store.getCart(cart.id).lines, [
    { productId: 'milk-3', qty: 3, substituteProductId: null },
    { productId: 'cucumber', qty: 1.5, substituteProductId: 'tomato' },
  ]);
  store.setSubstitute(cart.id, 'milk-3', 'milk-1');
  assert.equal(store.getCart(cart.id).lines[0].substituteProductId, 'milk-1');
  store.setLine(cart.id, { productId: 'milk-3', qty: 0 });
  assert.equal(store.getCart(cart.id).lines.length, 1);
  store.clearCart(cart.id);
  assert.equal(store.getCart(cart.id).lines.length, 0);
  assert.ok(changes >= 6);
  assert.throws(() => store.setLine('nope', { productId: 'x', qty: 1 }), /cart not found/);
});

test('saved lists can be saved, listed, loaded (replace / merge) and deleted', () => {
  const store = new CartStore();
  const cart = store.createCart();
  store.setLine(cart.id, { productId: 'milk-3', qty: 2 });
  store.setLine(cart.id, { productId: 'bread', qty: 1 });
  const list = store.saveList({ name: 'קניות שבועיות', cartId: cart.id });
  assert.equal(list.lines.length, 2);
  store.clearCart(cart.id);
  store.setLine(cart.id, { productId: 'milk-3', qty: 1 });
  store.loadList(list.id, cart.id, { merge: true });
  assert.equal(store.getCart(cart.id).lines.find((l) => l.productId === 'milk-3').qty, 3);
  store.loadList(list.id, cart.id, { merge: false });
  assert.equal(store.getCart(cart.id).lines.find((l) => l.productId === 'milk-3').qty, 2);
  assert.equal(store.listLists().length, 1);
  const restored = CartStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));
  assert.equal(restored.getList(list.id).name, 'קניות שבועיות');
  assert.equal(store.deleteList(list.id), true);
  assert.equal(store.listLists().length, 0);
});
