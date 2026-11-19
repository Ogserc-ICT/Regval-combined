/**
 * Staff e-signatures: a PNG per staff account, stamped on the acknowledgement letter,
 * deficiency notice and EVAL-01 where that person signs. CERT-01 is always signed by hand.
 */

export const SIGNATURE_MAX_BYTES = 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Why the file can't be used as a signature, or null when it is a usable PNG. */
export function signatureProblem(bytes: Uint8Array): string | null {
  if (!bytes.length) return "Choose a PNG file of the signature.";
  if (bytes.length > SIGNATURE_MAX_BYTES) return "The signature image is over 1 MB. Crop it or save it smaller.";
  if (bytes.length < 33 || PNG_MAGIC.some((b, i) => bytes[i] !== b)) return "The signature must be a PNG image.";
  // IHDR: width and height, big-endian, at bytes 16–23.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  if (w < 40 || h < 15) return "The signature image is too small to print clearly.";
  if (w > 6000 || h > 6000) return "The signature image is too large. Crop it to the signature.";
  return null;
}

/** Each upload gets a new path, so a replaced signature never overwrites the old file in place. */
export const signaturePathname = (userId: string, suffix: string) => `signatures/${userId}/${suffix.replace(/[^A-Za-z0-9]/g, "")}.png`;
