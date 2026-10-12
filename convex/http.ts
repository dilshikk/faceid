import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

type Metrics = {
  cpu: number;
  ramUsedMb: number;
  ramTotalMb: number;
  load1: number;
  uptimeSec: number;
  service?: string;
  serviceState?: string;
};

function parseMetrics(body: unknown): Metrics | null {
  if (typeof body !== "object" || body === null) return null;
  const field = (name: string): unknown =>
    Object.entries(body).find(([k]) => k === name)?.[1];
  const num = (name: string): number | null => {
    const value = field(name);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const text = (name: string): string | undefined => {
    const value = field(name);
    return typeof value === "string" && value ? value.slice(0, 100) : undefined;
  };
  const cpu = num("cpu");
  const ramUsedMb = num("ramUsedMb");
  const ramTotalMb = num("ramTotalMb");
  const load1 = num("load1");
  const uptimeSec = num("uptimeSec");
  if (
    cpu === null ||
    ramUsedMb === null ||
    ramTotalMb === null ||
    load1 === null ||
    uptimeSec === null
  ) {
    return null;
  }
  return {
    cpu,
    ramUsedMb,
    ramTotalMb,
    load1,
    uptimeSec,
    service: text("service"),
    serviceState: text("serviceState"),
  };
}

// Receives metrics from the small script running on the VPS.
http.route({
  path: "/agent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = request.headers.get("authorization") ?? "";
    const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!key) return new Response("Unauthorized", { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const metrics = parseMetrics(body);
    if (!metrics) return new Response("Bad request", { status: 400 });
    const accepted = await ctx.runMutation(internal.monitor.agents.ingest, {
      key,
      ...metrics,
    });
    return new Response(null, { status: accepted ? 204 : 401 });
  }),
});

export default http;
