import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

// Same note as Logs.tsx: the route id must be a dependency so navigating
// between services re-fetches instead of showing the previous service.
export default function ServiceDetailsDeps() {
  return null;
}

export { usePolling, api };
