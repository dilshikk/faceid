// Builds the shell script the admin installs on the VPS. It only sends
// numbers (CPU, RAM, load, service state) to the panel, nothing else.
export function agentEndpoint(): string {
  const url: string = import.meta.env.VITE_CONVEX_URL ?? "";
  return url.replace(".convex.cloud", ".convex.site") + "/agent";
}

export function buildAgentScript(key: string, service: string): string {
  return `#!/usr/bin/env bash
# Sends server metrics to the bot panel. Run every minute from cron.
KEY="${key}"
URL="${agentEndpoint()}"
SERVICE="${service}"

read -r _ u1 n1 s1 i1 w1 q1 sq1 st1 _ < /proc/stat
sleep 1
read -r _ u2 n2 s2 i2 w2 q2 sq2 st2 _ < /proc/stat
busy=$(( (u2+n2+s2+q2+sq2+st2) - (u1+n1+s1+q1+sq1+st1) ))
idle=$(( (i2+w2) - (i1+w1) ))
total=$(( busy + idle ))
cpu=$(( total > 0 ? 100 * busy / total : 0 ))

mem_total=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
mem_avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
mem_used=$(( mem_total - mem_avail ))
load1=$(cut -d' ' -f1 /proc/loadavg)
uptime_sec=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
state=$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)

curl -s -m 10 -o /dev/null -X POST "$URL" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"cpu\\":$cpu,\\"ramUsedMb\\":$mem_used,\\"ramTotalMb\\":$mem_total,\\"load1\\":$load1,\\"uptimeSec\\":$uptime_sec,\\"service\\":\\"$SERVICE\\",\\"serviceState\\":\\"$state\\"}"
`;
}
