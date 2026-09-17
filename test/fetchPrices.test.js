import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { unzipFirstEntry } from '../scripts/fetch-prices.mjs';

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
