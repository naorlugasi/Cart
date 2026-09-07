import { randomBytes } from 'node:crypto';

function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString('base64url')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * In-memory store for carts and saved shopping lists ("קניות שבועיות").
 * `onChange` is invoked after each mutation so the owner can persist state.
 */
export class CartStore {
  constructor({ onChange = () => {}, now = () => new Date() } = {}) {
    this.carts = new Map();
    this.lists = new Map();
    this.onChange = onChange;
    this.now = now;
  }

  #touch(cart) {
    cart.updatedAt = this.now().toISOString();
    this.onChange();
    return cart;
  }

  createCart() {
    const ts = this.now().toISOString();
    const cart = { id: newId('cart'), lines: [], address: null, createdAt: ts, updatedAt: ts };
    this.carts.set(cart.id, cart);
    this.onChange();
    return cart;
  }

  getCart(id) {
    return this.carts.get(id) ?? null;
  }

  requireCart(id) {
    const cart = this.getCart(id);
    if (!cart) { const err = new Error('cart not found'); err.status = 404; throw err; }
    return cart;
  }

  /** Add or update a line. qty <= 0 removes it. */
  setLine(cartId, { productId, qty, substituteProductId }) {
    const cart = this.requireCart(cartId);
    if (!productId) { const err = new Error('productId required'); err.status = 400; throw err; }
    const quantity = Number(qty);
    const existing = cart.lines.find((l) => l.productId === productId);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      cart.lines = cart.lines.filter((l) => l.productId !== productId);
      return this.#touch(cart);
    }
    if (existing) {
      existing.qty = quantity;
      if (substituteProductId !== undefined) existing.substituteProductId = substituteProductId || null;
    } else {
      cart.lines.push({ productId, qty: quantity, substituteProductId: substituteProductId || null });
    }
    return this.#touch(cart);
  }

  addToLine(cartId, productId, delta = 1) {
    const cart = this.requireCart(cartId);
    const existing = cart.lines.find((l) => l.productId === productId);
    return this.setLine(cartId, { productId, qty: (existing?.qty ?? 0) + delta });
  }

  removeLine(cartId, productId) {
    return this.setLine(cartId, { productId, qty: 0 });
  }

  setSubstitute(cartId, productId, substituteProductId) {
    const cart = this.requireCart(cartId);
    const line = cart.lines.find((l) => l.productId === productId);
    if (!line) { const err = new Error('line not found'); err.status = 404; throw err; }
    line.substituteProductId = substituteProductId || null;
    return this.#touch(cart);
  }

  clearCart(cartId) {
    const cart = this.requireCart(cartId);
    cart.lines = [];
    return this.#touch(cart);
  }

  setAddress(cartId, address) {
    const cart = this.requireCart(cartId);
    cart.address = address ?? null;
    return this.#touch(cart);
  }

  // ---- saved lists -------------------------------------------------------

  saveList({ name, cartId, lines }) {
    const source = lines ?? this.requireCart(cartId).lines;
    if (!name) { const err = new Error('name required'); err.status = 400; throw err; }
    const ts = this.now().toISOString();
    const list = { id: newId('list'), name, lines: clone(source), createdAt: ts, updatedAt: ts };
    this.lists.set(list.id, list);
    this.onChange();
    return list;
  }

  updateList(listId, { name, lines }) {
    const list = this.lists.get(listId);
    if (!list) { const err = new Error('list not found'); err.status = 404; throw err; }
    if (name) list.name = name;
    if (lines) list.lines = clone(lines);
    list.updatedAt = this.now().toISOString();
    this.onChange();
    return list;
  }

  getList(id) {
    return this.lists.get(id) ?? null;
  }

  listLists() {
    return [...this.lists.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteList(id) {
    const existed = this.lists.delete(id);
    if (existed) this.onChange();
    return existed;
  }

  /** Load a saved list into a cart. merge=true adds quantities, otherwise replaces the cart. */
  loadList(listId, cartId, { merge = false } = {}) {
    const list = this.lists.get(listId);
    if (!list) { const err = new Error('list not found'); err.status = 404; throw err; }
    const cart = this.requireCart(cartId);
    if (!merge) cart.lines = [];
    for (const line of list.lines) {
      const existing = cart.lines.find((l) => l.productId === line.productId);
      if (existing) existing.qty += line.qty;
      else cart.lines.push(clone(line));
    }
    return this.#touch(cart);
  }

  toJSON() {
    return { carts: [...this.carts.values()], lists: [...this.lists.values()] };
  }

  static fromJSON(data, options) {
    const store = new CartStore(options);
    for (const cart of data?.carts ?? []) store.carts.set(cart.id, cart);
    for (const list of data?.lists ?? []) store.lists.set(list.id, list);
    return store;
  }
}
