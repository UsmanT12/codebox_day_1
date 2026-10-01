// Sessions stay in HTTP-only cookies. Never store tokens in browser storage.
export function createApi(onExpired, fetcher = fetch) {
  let generation = 0;
  let refreshing = null;
  let signingOut = false;

  async function send(path, options = {}) {
    let response;
    try {
      response = await fetcher(path, {
        ...options, credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw new Error("Couldn’t reach the server. Please try again."); }
    if (response.status === 204) return null;
    let body;
    try { body = await response.json(); }
    catch { throw new Error("The server returned an unexpected response. Please restart it and try again."); }
    if (!response.ok) throw Object.assign(new Error(body.error || "Please try again."), { status: response.status });
    return body;
  }

  async function request(path, options = {}) {
    const started = generation;
    const current = (result) => {
      if (generation !== started || signingOut) throw new Error("Your account changed. Please try again.");
      return result;
    };
    if (signingOut) return current(null);
    try { return current(await send(path, options)); }
    catch (error) {
      if (error.status !== 401 || generation !== started || signingOut) throw error;
      try {
        if (!refreshing) refreshing = send("/api/auth/refresh", { method: "POST" }).finally(() => { refreshing = null; });
        await refreshing;
        current(null);
        return current(await send(path, options));
      } catch (refreshError) {
        if (refreshError.status === 401 && generation === started && !signingOut) {
          generation++;
          onExpired();
        }
        throw refreshError;
      }
    }
  }

  return {
    request,
    async authenticate(mode, credentials) {
      if (refreshing) await refreshing.catch(() => {});
      const result = await send(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(credentials) });
      generation++;
      return result;
    },
    async signOut() {
      signingOut = true;
      generation++;
      try {
        if (refreshing) await refreshing.catch(() => {});
        await send("/api/auth/signout", { method: "POST" });
      } finally { signingOut = false; }
    },
  };
}
