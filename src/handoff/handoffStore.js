/**
 * Where handoff records (status + injector results) live.
 *
 *   MemoryHandoffStore - one process; persisted to data/runtime/state.json by the standalone server.
 *   RedisHandoffStore  - shared between serverless instances (Upstash / Vercel KV), so the status the
 *                        UI polls reflects a report that another instance received.
 *
 * Both expose the same async interface; HandoffService does not know which one it has.
 */
export class MemoryHandoffStore {
  constructor(records = []) {
    this.kind = 'memory';
    this.records = new Map();
    for (const record of records ?? []) if (record?.id) this.records.set(record.id, record);
  }

  async get(id) { return this.records.get(id) ?? null; }
  async set(record) { this.records.set(record.id, record); return record; }
  async delete(id) { return this.records.delete(id); }
  async list() { return [...this.records.values()]; }
  toJSON() { return { handoffs: [...this.records.values()] }; }
}

export class RedisHandoffStore {
  /**
   * @param {object} options
   * @param {{command: Function, pipeline: Function}} options.client see src/storage/upstashRedis.js
   * @param {number} [options.ttlSeconds] how long a record is kept after its last write
   * @param {number} [options.maxIndexed] how many recent ids `list()` can return
   */
  constructor({ client, prefix = 'handoff', ttlSeconds = 48 * 3600, maxIndexed = 500 }) {
    if (!client) throw new Error('RedisHandoffStore needs a client');
    this.kind = 'redis';
    this.client = client;
    this.prefix = prefix;
    this.indexKey = `${prefix}s:recent`;
    this.ttlSeconds = ttlSeconds;
    this.maxIndexed = maxIndexed;
  }

  #key(id) { return `${this.prefix}:${id}`; }

  async get(id) {
    const raw = await this.client.command('GET', this.#key(id));
    return raw ? JSON.parse(raw) : null;
  }

  async set(record) {
    const score = Date.parse(record.createdAt) || Date.now();
    await this.client.pipeline([
      ['SET', this.#key(record.id), JSON.stringify(record), 'EX', this.ttlSeconds],
      ['ZADD', this.indexKey, score, record.id],
      ['ZREMRANGEBYRANK', this.indexKey, 0, -(this.maxIndexed + 1)],
      ['EXPIRE', this.indexKey, this.ttlSeconds],
    ]);
    return record;
  }

  async delete(id) {
    const [removed] = await this.client.pipeline([['DEL', this.#key(id)], ['ZREM', this.indexKey, id]]);
    return Number(removed) > 0;
  }

  /** Newest first. Ids whose record expired are dropped from the index on the way. */
  async list() {
    const ids = await this.client.command('ZRANGE', this.indexKey, 0, -1, 'REV');
    if (!ids?.length) return [];
    const raws = await this.client.command('MGET', ...ids.map((id) => this.#key(id)));
    const out = [];
    const gone = [];
    raws.forEach((raw, i) => { if (raw) out.push(JSON.parse(raw)); else gone.push(ids[i]); });
    if (gone.length) await this.client.command('ZREM', this.indexKey, ...gone).catch(() => {});
    return out;
  }

  /** Nothing to snapshot into state.json: the records live in Redis. */
  toJSON() { return { handoffs: [] }; }
}
