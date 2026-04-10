/**
 * Session codec for hermes-remote adapter.
 * Stores/restores X-Hermes-Session-Id for session continuity.
 */
export const sessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const sessionId = raw.sessionId ?? raw.hermesSessionId ?? null;
    return sessionId ? { sessionId } : null;
  },
  serialize(params) {
    if (!params?.sessionId) return null;
    return { sessionId: params.sessionId };
  },
  getDisplayId(params) {
    const id = params?.sessionId;
    return typeof id === "string" ? id.slice(0, 16) : null;
  },
};
