
import { useEffect, useState } from "react";

export type ConnectionStatus = "online" | "offline";

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? "online" : "offline"
  );

  useEffect(() => {
    const handleOnline = () => setStatus("online");
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Recheck the browser's current network state.
    setStatus(navigator.onLine ? "online" : "offline");

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}
