import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  KNOWN_MESSAGE_TYPES,
  type BridgeEnvelope,
  type BridgeMessageType,
  type BridgePayloads,
} from './protocol';

export function makeEnvelope<T extends BridgeMessageType>(
  type: T,
  payload: BridgePayloads[T]
): BridgeEnvelope<T> {
  return {
    protocol: BRIDGE_PROTOCOL,
    version: BRIDGE_VERSION,
    id: crypto.randomUUID(),
    type,
    payload,
  };
}

/** Returns null for anything that must be ignored; logs per contracts §1.4. */
export function parseEnvelope(data: unknown): BridgeEnvelope | null {
  if (typeof data !== 'object' || data === null) return null;
  const e = data as Record<string, unknown>;
  if (e.protocol !== BRIDGE_PROTOCOL) return null; // not ours: fully silent
  if (typeof e.version !== 'number' || typeof e.id !== 'string' || typeof e.type !== 'string') {
    console.debug('[eldra-bridge] ignoring malformed envelope');
    return null;
  }
  if (e.version > BRIDGE_VERSION) {
    console.debug(
      `[eldra-bridge] ignoring newer-version envelope (v${e.version} > v${BRIDGE_VERSION})`
    );
    return null;
  }
  if (!KNOWN_MESSAGE_TYPES.has(e.type)) {
    console.debug(`[eldra-bridge] ignoring unknown message type "${e.type}"`);
    return null;
  }
  return e as unknown as BridgeEnvelope;
}
