import { useEffect, useRef, useState, useCallback } from "react";

function getWebSocketUrl() {
  const hostname = window.location.hostname; 
  const port     = "8000";
  return `ws://${hostname}:${port}/ws/telemetry`;
}

export function useWebSocket(onMessage) {
  const wsRef          = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef   = useRef(onMessage);
  const [connected,    setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = getWebSocketUrl();
    console.log("🔌 WebSocket connecting to:", wsUrl);

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected:", wsUrl);
        setConnected(true);
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onMessageRef.current) onMessageRef.current(data);
        } catch {}
      };

      wsRef.current.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      wsRef.current.onerror = () => {
        wsRef.current.close();
      };

    } catch {
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current)          wsRef.current.close();
    };
  }, [connect]);

  return { connected };
}