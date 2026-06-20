const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function isPrivateIpv4(ip: string): boolean {
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const secondOctet = Number(ip.split('.')[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return false;
}

function pickPreferredLanIp(ips: string[]): string | null {
  const unique = [...new Set(ips.filter(isPrivateIpv4))];
  return unique.find((ip) => ip.startsWith('192.168.')) ?? unique[0] ?? null;
}

/** Matches the current page protocol (http in local dev, https in production). */
export function getScannerProtocol(): 'http:' | 'https:' {
  if (typeof window === 'undefined') return 'http:';
  return window.location.protocol === 'https:' ? 'https:' : 'http:';
}

/**
 * Discovers the machine's LAN IPv4 via WebRTC (works in Chromium browsers on Windows).
 */
export function discoverLocalIpv4(timeoutMs = 3000): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  const RTCPeerConnectionCtor =
    window.RTCPeerConnection ||
    (window as unknown as { webkitRTCPeerConnection?: typeof RTCPeerConnection })
      .webkitRTCPeerConnection;

  if (!RTCPeerConnectionCtor) return Promise.resolve(null);

  return new Promise((resolve) => {
    const candidates = new Set<string>();
    const pc = new RTCPeerConnectionCtor({ iceServers: [] });

    const finish = () => {
      window.clearTimeout(timer);
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(pickPreferredLanIp([...candidates]));
    };

    const timer = window.setTimeout(finish, timeoutMs);

    pc.onicecandidate = (event) => {
      if (!event.candidate?.candidate) return;
      const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(event.candidate.candidate);
      if (match?.[1]) candidates.add(match[1]);
    };

    pc.createDataChannel('proctortab-lan-probe');

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish());
  });
}

/**
 * Base URL for phone scanner links. Uses HTTPS + LAN IP when opened on localhost.
 */
export async function getScannerBaseOrigin(defaultPort = 5173): Promise<string> {
  if (typeof window === 'undefined') return '';

  const { hostname, port } = window.location;
  const effectivePort = port || String(defaultPort);
  const protocol = getScannerProtocol();

  if (!isLocalHostname(hostname)) {
    return window.location.origin;
  }

  const lanIp = await discoverLocalIpv4();
  if (lanIp) {
    return `${protocol}//${lanIp}:${effectivePort}`;
  }

  return `${protocol}//${hostname}:${effectivePort}`;
}

export function formatLanHostFromOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return origin;
  }
}
