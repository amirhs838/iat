// =============================================================================
// Minimal User-Agent parsing (browser, version, OS, device type).
// Deliberately dependency-free; used for research metadata only.
// =============================================================================

export interface UaInfo {
  browser: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType: "desktop" | "mobile" | "tablet";
}

export function parseUserAgent(ua: string): UaInfo {
  let browser = "Unknown";
  let browserVersion = "";

  const tests: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = ua.match(re);
    if (m) {
      browser = name;
      browserVersion = m[1];
      break;
    }
  }

  let operatingSystem = "Unknown";
  if (/Windows NT 10/.test(ua)) operatingSystem = "Windows 10+";
  else if (/Windows/.test(ua)) operatingSystem = "Windows";
  else if (/Mac OS X/.test(ua)) operatingSystem = "macOS";
  else if (/Android/.test(ua)) operatingSystem = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) operatingSystem = "iOS";
  else if (/Linux/.test(ua)) operatingSystem = "Linux";

  let deviceType: UaInfo["deviceType"] = "desktop";
  if (/iPad|Tablet/.test(ua)) deviceType = "tablet";
  else if (/Mobi|Android.*Mobile|iPhone/.test(ua)) deviceType = "mobile";

  return { browser, browserVersion, operatingSystem, deviceType };
}
