/**
 * Some hosts disguise their segments as images to dodge filters: a small valid
 * PNG with the real MPEG-TS or fMP4 payload concatenated after it. The
 * transmuxer only sees the PNG signature and drops the segment, so the prefix
 * has to come off before the bytes reach it.
 */

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const TS_SYNC_BYTE = 0x47
const TS_PACKET_SIZE = 188

/** Box types that can open an fMP4 segment, as ASCII bytes. */
const MP4_BOX_TYPES = ['ftyp', 'styp', 'moof', 'sidx'].map((type) =>
  [...type].map((character) => character.charCodeAt(0)),
)

/** A decoy is a header, so the payload starts well inside this window. */
const SCAN_LIMIT = 64 * 1024

function startsWith(bytes, signature, offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * The offset where real media begins, or -1. Three sync bytes a packet apart
 * is what keeps a stray 0x47 inside the PNG from matching.
 */
export function findPayloadStart(bytes) {
  const limit = Math.min(bytes.length, SCAN_LIMIT)

  for (let offset = 0; offset < limit; offset += 1) {
    if (
      bytes[offset] === TS_SYNC_BYTE &&
      bytes[offset + TS_PACKET_SIZE] === TS_SYNC_BYTE &&
      bytes[offset + TS_PACKET_SIZE * 2] === TS_SYNC_BYTE
    ) {
      return offset
    }

    // An fMP4 box is a 4-byte size followed by its type.
    if (offset >= 4 && MP4_BOX_TYPES.some((type) => startsWith(bytes, type, offset))) {
      return offset - 4
    }
  }

  return -1
}

/**
 * Returns the buffer unchanged unless it is PNG-wrapped, in which case the
 * media payload is returned. Falling back to the original buffer lets VHS fail
 * the way it would have without this.
 */
export function stripDecoyPrefix(buffer) {
  if (!buffer || buffer.byteLength <= PNG_SIGNATURE.length) return buffer

  const bytes = new Uint8Array(buffer)
  if (!startsWith(bytes, PNG_SIGNATURE)) return buffer

  const start = findPayloadStart(bytes)
  if (start <= 0 || start >= bytes.length) return buffer

  return buffer.slice(start)
}
