// Mirrors Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False).
// Packet identifiers and fixture strings are ordinary Unicode; non-BMP keys are rejected.
export function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw Error('Unpaired Unicode surrogate cannot be contract JSON');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
    if (keys.some(k => /[\uD800-\uDBFF][\uDC00-\uDFFF]/u.test(k))) throw Error('Non-BMP object keys are unsupported by this client');
    return `{${keys.map(k => `${canonical(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  throw Error('Value cannot be serialized as contract JSON');
}
export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,'0')).join('');
}
export const hashObject = value => sha256(canonical(value));
export function codePoints(text) { return [...text]; }
export function sliceUnicode(text,start,end) { return codePoints(text).slice(start,end).join(''); }
