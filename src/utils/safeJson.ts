/**
 * Safely stringifies any object, preventing circular reference errors,
 * DOM element cycles, and complex object crashes.
 */
export function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);

      // Handle DOM / Browser elements
      if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
        return `[HTMLElement: ${value.tagName}]`;
      }
      if (typeof Event !== 'undefined' && value instanceof Event) {
        return `[Event: ${value.type}]`;
      }
      if (typeof Node !== 'undefined' && value instanceof Node) {
        return `[Node: ${value.nodeName}]`;
      }
      if (typeof Window !== 'undefined' && value instanceof Window) {
        return '[Window]';
      }
      if (typeof Document !== 'undefined' && value instanceof Document) {
        return '[Document]';
      }
      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
    }
    return value;
  };
}

export function safeJsonStringify(obj: any, space?: number | string): string {
  try {
    return JSON.stringify(obj, getCircularReplacer(), space);
  } catch (err) {
    try {
      // Fallback: shallow safe serialization
      if (typeof obj !== 'object' || obj === null) {
        return String(obj);
      }
      const safeObj: Record<string, any> = {};
      for (const key of Object.keys(obj)) {
        try {
          const val = obj[key];
          if (typeof val === 'object' && val !== null) {
            safeObj[key] = Array.isArray(val) ? `[Array(${val.length})]` : `[Object: ${val?.constructor?.name || 'Object'}]`;
          } else {
            safeObj[key] = val;
          }
        } catch {
          safeObj[key] = '[Unserializable]';
        }
      }
      return JSON.stringify(safeObj, null, space);
    } catch {
      return String(obj);
    }
  }
}
