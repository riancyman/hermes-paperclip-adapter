/**
 * Environment test for hermes-remote adapter.
 * Verifies the remote Hermes API server is reachable.
 */
export async function testEnvironment(ctx) {
  const config = ctx.adapterConfig ?? {};
  const checks = [];
  const url = typeof config.url === "string" && config.url.length > 0 ? config.url : "";

  if (!url) {
    checks.push({
      code: "hermes_remote_url_missing",
      level: "error",
      message: "Hermes API URL is not configured",
      hint: "Set the 'url' field in adapter config (e.g. http://192.168.10.201:8642)",
    });
    return { adapterType: "hermes_remote", status: "fail", checks };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      checks.push({
        code: "hermes_remote_reachable",
        level: "info",
        message: `Hermes API server reachable at ${url}`,
      });
    } else {
      checks.push({
        code: "hermes_remote_unhealthy",
        level: "warn",
        message: `Hermes API returned status ${res.status}`,
      });
    }
  } catch (err) {
    checks.push({
      code: "hermes_remote_unreachable",
      level: "error",
      message: `Cannot reach Hermes API at ${url}: ${err.message}`,
      hint: "Ensure the Hermes gateway API server is running on the target host",
    });
    return { adapterType: "hermes_remote", status: "fail", checks };
  }

  return { adapterType: "hermes_remote", status: "pass", checks };
}
