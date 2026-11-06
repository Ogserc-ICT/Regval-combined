/**
 * MS-OVBA compression (section 2.4.1): the format of the `dir` stream and of
 * every module's source in a vbaProject.bin. Decompress reads any valid
 * container; compress writes compressed chunks of up to 4096 bytes each.
 */

export function decompress(data: Uint8Array, start = 0): Buffer {
  if (data[start] !== 0x01) throw new Error("Not an MS-OVBA compressed container (bad signature byte)");
  const out: number[] = [];
  let pos = start + 1;
  while (pos < data.length) {
    const header = data[pos] | (data[pos + 1] << 8);
    const chunkSize = (header & 0x0fff) + 3;
    const compressed = (header & 0x8000) !== 0;
    const chunkEnd = Math.min(pos + chunkSize, data.length);
    pos += 2;
    const chunkStart = out.length;
    if (!compressed) {
      for (let i = 0; i < 4096 && pos < chunkEnd; i++) out.push(data[pos++]);
      pos = chunkEnd;
      continue;
    }
    while (pos < chunkEnd) {
      const flags = data[pos++];
      for (let bit = 0; bit < 8 && pos < chunkEnd; bit++) {
        if ((flags & (1 << bit)) === 0) {
          out.push(data[pos++]);
        } else {
          const token = data[pos] | (data[pos + 1] << 8);
          pos += 2;
          const { lengthMask, offsetMask, bitCount } = copyTokenHelp(out.length - chunkStart);
          const length = (token & lengthMask) + 3;
          const offset = ((token & offsetMask) >> (16 - bitCount)) + 1;
          const from = out.length - offset;
          for (let i = 0; i < length; i++) out.push(out[from + i]);
        }
      }
    }
  }
  return Buffer.from(out);
}

function copyTokenHelp(difference: number) {
  let bitCount = 0;
  while (1 << bitCount < difference) bitCount++;
  bitCount = Math.max(bitCount, 4);
  const lengthMask = 0xffff >> bitCount;
  const offsetMask = ~lengthMask & 0xffff;
  const maximumLength = lengthMask + 3;
  return { bitCount, lengthMask, offsetMask, maximumLength };
}

/** Compress per 2.4.1.3.6: LZ77 within each 4096-byte chunk. */
export function compress(input: Uint8Array): Buffer {
  const out: number[] = [0x01];
  for (let chunkStart = 0; chunkStart < input.length || chunkStart === 0; chunkStart += 4096) {
    const end = Math.min(chunkStart + 4096, input.length);
    const body: number[] = [];
    let pos = chunkStart;
    while (pos < end) {
      const flagIndex = body.length;
      body.push(0);
      let flags = 0;
      for (let bit = 0; bit < 8 && pos < end; bit++) {
        const { bestLength, bestOffset } = match(input, chunkStart, pos, end);
        if (bestLength >= 3) {
          const { bitCount } = copyTokenHelp(pos - chunkStart);
          const token = ((bestOffset - 1) << (16 - bitCount)) | (bestLength - 3);
          body.push(token & 0xff, (token >> 8) & 0xff);
          flags |= 1 << bit;
          pos += bestLength;
        } else {
          body.push(input[pos++]);
        }
      }
      body[flagIndex] = flags;
    }
    if (body.length > 4096) {
      // Incompressible: a raw chunk must hold exactly 4096 bytes, so only the last chunk may be short.
      if (end - chunkStart !== 4096) throw new Error("Cannot store a short incompressible chunk");
      const header = 0x3000 | (4096 - 1);
      out.push(header & 0xff, header >> 8);
      for (let i = chunkStart; i < end; i++) out.push(input[i]);
    } else {
      const header = 0x8000 | 0x3000 | (body.length + 2 - 3);
      out.push(header & 0xff, header >> 8, ...body);
    }
    if (input.length === 0) break;
  }
  return Buffer.from(out);
}

function match(input: Uint8Array, chunkStart: number, pos: number, end: number) {
  const { maximumLength } = copyTokenHelp(pos - chunkStart);
  let bestLength = 0;
  let bestOffset = 0;
  for (let candidate = pos - 1; candidate >= chunkStart; candidate--) {
    let len = 0;
    while (pos + len < end && len < maximumLength && input[candidate + len] === input[pos + len]) len++;
    if (len > bestLength) {
      bestLength = len;
      bestOffset = pos - candidate;
      if (len === maximumLength) break;
    }
  }
  return { bestLength, bestOffset };
}
