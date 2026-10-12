import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 5 minutes is the minimum interval allowed, to keep cloud usage low.
crons.interval(
  "check bots",
  { minutes: 5 },
  internal.monitor.checks.checkAll,
  {},
);

export default crons;
