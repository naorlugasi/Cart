import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { unzipFirstEntry, sourceDateFromName } from '../scripts/fetch-prices.mjs';

// Builds a single-entry ZIP the way the chains' portals do (deflate, sizes only in the central directory).
function zipOf(name, content) {
  const data = deflateRawSync(content);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 14); local.writeUInt32LE(0, 18); local.writeUInt32LE(0, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc32(content), 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(content.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(0, 42);
  const cdStart = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length + nameBuf.length, 12); eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, nameBuf, data, cd, nameBuf, eocd]);
}

test('unzipFirstEntry reads a deflated single-entry zip whose local header carries no sizes', () => {
  const xml = Buffer.from('<Root><Items><Item><ItemCode>7290000066318</ItemCode><ItemPrice>4.00</ItemPrice></Item></Items></Root>');
  assert.equal(unzipFirstEntry(zipOf('PriceFull7290058140886-039-202609170523.xml', xml)).toString(), xml.toString());
});

test('unzipFirstEntry rejects buffers that are not zip archives', () => {
  assert.throws(() => unzipFirstEntry(Buffer.from('<Root/>')), /end-of-central-directory/);
});

test('sourceDateFromName: the file stamp is the chain\'s own "as of" moment, in Israel time', () => {
  // Two stamp shapes on the portals: "YYYYMMDD-HHMMSS" (most chains) and "YYYYMMDDHHMM" (Keshet, Rami Levy).
  assert.equal(sourceDateFromName('https://x/PriceFull7290027600007-002-413-20260919-034000.gz'), '2026-09-19T03:40:00+03:00');
  assert.equal(sourceDateFromName('pricefull7290058140886-039-202609190520.gz'), '2026-09-19T05:20:00+03:00');
  assert.equal(sourceDateFromName('PriceFull7290785400000-120-202609190010.gz'), '2026-09-19T00:10:00+03:00');
  // Winter time is +02:00 (Israel leaves DST at the end of October).
  assert.equal(sourceDateFromName('PriceFull7290027600007-002-413-20261215-034000.gz'), '2026-12-15T03:40:00+02:00');
  // No stamp = unknown, never a guess (the consumer falls back to generatedAt).
  assert.equal(sourceDateFromName('PriceFull.xml'), null);
  assert.equal(sourceDateFromName(null), null);
});
