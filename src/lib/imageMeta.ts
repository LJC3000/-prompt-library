/**
 * Fetch the first 8KB of an image via Range request and parse its dimensions
 * from binary headers. Supports PNG, JPEG, and WebP.
 *
 * The Range request only downloads ~8KB instead of the full image,
 * making it suitable for bulk aspect-ratio pre-fetching.
 */
export async function fetchImageDimensions(
  url: string,
  extraHeaders?: Record<string, string>
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-8191", ...extraHeaders },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok && res.status !== 206) {
      // Some CDNs return 200 even with Range — still fine
      return null;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength < 24) return null;

    return parseImageDimensions(buf);
  } catch {
    return null;
  }
}

export function parseImageDimensions(
  buf: ArrayBuffer
): { width: number; height: number } | null {
  const view = new DataView(buf);
  const b = new Uint8Array(buf);

  // ── PNG ──────────────────────────────────────────────────
  // Signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at offset 16: width(4) + height(4), big-endian
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  ) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  // ── JPEG ─────────────────────────────────────────────────
  // Starts with FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.byteLength) {
      if (b[i] === 0xff && (b[i + 1] === 0xc0 || b[i + 1] === 0xc2)) {
        // SOF0 / SOF2: 2 bytes length, 1 byte precision, 2 height, 2 width
        return {
          height: view.getUint16(i + 5),
          width: view.getUint16(i + 7),
        };
      }
      if (b[i] === 0xff) {
        // Skip this marker segment
        const segLen = view.getUint16(i + 2);
        i += 2 + segLen;
      } else {
        i++;
      }
    }
    return null;
  }

  // ── WebP ─────────────────────────────────────────────────
  // RIFF container: "RIFF" + size(4) + "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50   // WEBP
  ) {
    const chunkId = String.fromCharCode(b[12], b[13], b[14], b[15]);

    // VP8X (extended): 24-bit LE width/height at offsets 17/20
    if (chunkId === "VP8X" && buf.byteLength >= 30) {
      const width =
        ((b[19] << 16) | (b[18] << 8) | b[17]) + 1;
      const height =
        ((b[22] << 16) | (b[21] << 8) | b[20]) + 1;
      if (width > 0 && height > 0) return { width, height };
    }

    // VP8L (lossless): 4 bytes packed with 14-bit width/height (LE)
    if (chunkId === "VP8L" && buf.byteLength >= 25) {
      const bits = new DataView(buf.slice(16, 20));
      const packed = bits.getUint32(0, true); // little-endian
      const wMinus1 = packed & 0x3fff;
      const hMinus1 = (packed >> 14) & 0x3fff;
      const width = wMinus1 + 1;
      const height = hMinus1 + 1;
      if (width > 0 && height > 0) return { width, height };
    }

    // VP8 (lossy) — variable-length partition size makes header
    // parsing complex without a full decoder. Skip.
    return null;
  }

  return null;
}
