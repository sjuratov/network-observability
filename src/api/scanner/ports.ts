import { execFile } from 'node:child_process';

export interface PortScanResult {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: string;
  version?: string;
  banner?: string;
}

export interface PortChange {
  port: number;
  protocol: string;
  previousState: string;
  currentState: string;
  detectedAt: string;
}

// Well-known port-to-service mapping
const WELL_KNOWN_PORTS: Record<number, string> = {
  7: 'echo',
  20: 'ftp-data',
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  67: 'dhcp',
  68: 'dhcp',
  69: 'tftp',
  80: 'http',
  110: 'pop3',
  111: 'rpcbind',
  119: 'nntp',
  123: 'ntp',
  135: 'msrpc',
  137: 'netbios-ns',
  138: 'netbios-dgm',
  139: 'netbios-ssn',
  143: 'imap',
  161: 'snmp',
  162: 'snmptrap',
  179: 'bgp',
  389: 'ldap',
  443: 'https',
  445: 'smb',
  465: 'smtps',
  514: 'syslog',
  515: 'printer',
  520: 'rip',
  523: 'ibm-db2',
  554: 'rtsp',
  587: 'submission',
  631: 'ipp',
  636: 'ldaps',
  873: 'rsync',
  902: 'vmware-auth',
  993: 'imaps',
  995: 'pop3s',
  1080: 'socks',
  1194: 'openvpn',
  1433: 'ms-sql',
  1434: 'ms-sql-m',
  1521: 'oracle',
  1723: 'pptp',
  1883: 'mqtt',
  2049: 'nfs',
  2181: 'zookeeper',
  2222: 'ssh-alt',
  3306: 'mysql',
  3389: 'rdp',
  3690: 'svn',
  4443: 'https-alt',
  5432: 'postgresql',
  5672: 'amqp',
  5900: 'vnc',
  5984: 'couchdb',
  6379: 'redis',
  6443: 'kubernetes',
  6667: 'irc',
  8080: 'http-alt',
  8443: 'https-alt',
  8883: 'mqtt-tls',
  8888: 'http-alt',
  9090: 'prometheus',
  9092: 'kafka',
  9200: 'elasticsearch',
  9418: 'git',
  11211: 'memcached',
  27017: 'mongodb',
};

// Banner-to-service patterns
const BANNER_PATTERNS: Array<{ pattern: RegExp; service: string }> = [
  { pattern: /^SSH-/i, service: 'ssh' },
  { pattern: /^HTTP\//i, service: 'http' },
  { pattern: /^220.*FTP/i, service: 'ftp' },
  { pattern: /^220.*SMTP/i, service: 'smtp' },
  { pattern: /MYSQL/i, service: 'mysql' },
  { pattern: /PostgreSQL/i, service: 'postgresql' },
  { pattern: /Redis/i, service: 'redis' },
  { pattern: /MongoDB/i, service: 'mongodb' },
];

// Nmap top 100 ports (most commonly open)
const TOP_100_PORTS = [
  7, 9, 13, 21, 22, 23, 25, 26, 37, 53,
  79, 80, 81, 88, 106, 110, 111, 113, 119, 135,
  139, 143, 144, 179, 199, 389, 427, 443, 444, 445,
  465, 513, 514, 515, 543, 544, 548, 554, 587, 631,
  646, 873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029,
  1110, 1433, 1720, 1723, 1755, 1900, 2000, 2001, 2049, 2121,
  2717, 3000, 3128, 3306, 3389, 3986, 4899, 5000, 5009, 5051,
  5060, 5101, 5190, 5357, 5432, 5631, 5666, 5800, 5900, 6000,
  6001, 6646, 7070, 8000, 8008, 8009, 8080, 8081, 8443, 8888,
  9100, 9999, 10000, 32768, 49152, 49153, 49154, 49155, 49156, 49157,
];

// Nmap top 1000 ports - top 100 + additional 900
const TOP_1000_PORTS: number[] = (() => {
  const additional = [
    1080,
    1, 3, 4, 6, 11, 15, 17, 19, 20, 24,
    30, 32, 33, 34, 35, 36, 38, 42, 43, 49,
    50, 51, 52, 54, 55, 56, 57, 58, 59, 60,
    62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
    72, 73, 74, 75, 76, 77, 78, 82, 83, 84,
    85, 86, 87, 89, 90, 91, 92, 93, 94, 95,
    96, 97, 98, 99, 100, 101, 102, 103, 104, 105,
    107, 108, 109, 112, 114, 115, 116, 117, 118, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
    131, 132, 133, 134, 136, 137, 138, 140, 141, 142,
    145, 146, 147, 148, 149, 150, 151, 152, 153, 154,
    155, 156, 157, 158, 159, 160, 161, 162, 163, 164,
    165, 166, 167, 168, 169, 170, 171, 172, 173, 174,
    175, 176, 177, 178, 180, 181, 182, 183, 184, 185,
    186, 187, 188, 189, 190, 191, 192, 193, 194, 195,
    196, 197, 198, 200, 201, 202, 203, 204, 205, 206,
    207, 208, 209, 210, 211, 212, 213, 214, 215, 216,
    217, 218, 219, 220, 221, 222, 223, 224, 225, 226,
    227, 228, 229, 230, 231, 232, 233, 234, 235, 236,
    237, 238, 239, 240, 241, 242, 243, 244, 245, 246,
    247, 248, 249, 250, 251, 252, 253, 254, 255, 256,
    257, 258, 259, 260, 261, 262, 263, 264, 265, 266,
    267, 268, 269, 270, 271, 272, 273, 274, 275, 276,
    277, 278, 279, 280, 281, 282, 283, 284, 285, 286,
    287, 288, 289, 290, 291, 292, 293, 294, 295, 296,
    297, 298, 299, 300, 301, 302, 303, 304, 305, 306,
    307, 308, 309, 310, 311, 312, 313, 314, 315, 316,
    317, 318, 319, 320, 321, 322, 323, 324, 325, 326,
    327, 328, 329, 330, 331, 332, 333, 334, 335, 336,
    337, 338, 339, 340, 341, 342, 343, 344, 345, 346,
    347, 348, 349, 350, 351, 352, 353, 354, 355, 356,
    357, 358, 359, 360, 361, 362, 363, 364, 365, 366,
    367, 368, 369, 370, 371, 372, 373, 374, 375, 376,
    377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
    387, 388, 390, 391, 392, 393, 394, 395, 396, 397,
    398, 399, 400, 401, 402, 403, 404, 405, 406, 407,
    408, 409, 410, 411, 412, 413, 414, 415, 416, 417,
    418, 419, 420, 421, 422, 423, 424, 425, 426, 428,
    429, 430, 431, 432, 433, 434, 435, 436, 437, 438,
    439, 440, 441, 442, 446, 447, 448, 449, 450, 451,
    452, 453, 454, 455, 456, 457, 458, 459, 460, 461,
    462, 463, 464, 466, 467, 468, 469, 470, 471, 472,
    473, 474, 475, 476, 477, 478, 479, 480, 481, 482,
    483, 484, 485, 486, 487, 488, 489, 490, 491, 492,
    493, 494, 495, 496, 497, 498, 499, 500, 501, 502,
    503, 504, 505, 506, 507, 508, 509, 510, 511, 512,
    516, 517, 518, 519, 520, 521, 522, 523, 524, 525,
    526, 527, 528, 529, 530, 531, 532, 533, 534, 535,
    536, 537, 538, 539, 540, 541, 542, 545, 546, 547,
    549, 550, 551, 552, 553, 555, 556, 557, 558, 559,
    560, 561, 562, 563, 564, 565, 566, 567, 568, 569,
    570, 571, 572, 573, 574, 575, 576, 577, 578, 579,
    580, 581, 582, 583, 584, 585, 586, 588, 589, 590,
    591, 592, 593, 594, 595, 596, 597, 598, 599, 600,
    601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
    611, 612, 613, 614, 615, 616, 617, 618, 619, 620,
    621, 622, 623, 624, 625, 626, 627, 628, 629, 630,
    632, 633, 634, 635, 636, 637, 638, 639, 640, 641,
    642, 643, 644, 645, 647, 648, 649, 650, 651, 652,
    653, 654, 655, 656, 657, 658, 659, 660, 661, 662,
    663, 664, 665, 666, 667, 668, 669, 670, 671, 672,
    673, 674, 675, 676, 677, 678, 679, 680, 681, 682,
    683, 684, 685, 686, 687, 688, 689, 690, 691, 692,
    693, 694, 695, 696, 697, 698, 699, 700, 701, 702,
    703, 704, 705, 706, 707, 708, 709, 710, 711, 712,
    713, 714, 715, 716, 717, 718, 719, 720, 721, 722,
    723, 724, 725, 726, 727, 728, 729, 730, 731, 732,
    733, 734, 735, 736, 737, 738, 739, 740, 741, 742,
    743, 744, 745, 746, 747, 748, 749, 750, 751, 752,
    753, 754, 755, 756, 757, 758, 759, 760, 761, 762,
    763, 764, 765, 766, 767, 768, 769, 770, 771, 772,
    773, 774, 775, 776, 777, 778, 779, 780, 781, 782,
    783, 784, 785, 786, 787, 788, 789, 790, 791, 792,
    793, 794, 795, 796, 797, 798, 799, 800, 801, 802,
    803, 804, 805, 806, 807, 808, 809, 810, 811, 812,
    813, 814, 815, 816, 817, 818, 819, 820, 821, 822,
    823, 824, 825, 826, 827, 828, 829, 830, 831, 832,
    833, 834, 835, 836, 837, 838, 839, 840, 841, 842,
    843, 844, 845, 846, 847, 848, 849, 850, 851, 852,
    853, 854, 855, 856, 857, 858, 859, 860, 861, 862,
    863, 864, 865, 866, 867, 868, 869, 870, 871, 872,
  ];
  const combined = new Set([...TOP_100_PORTS, ...additional]);
  const sorted = [...combined].sort((a, b) => a - b);
  // Ensure exactly 1000
  while (sorted.length < 1000) {
    const next = sorted[sorted.length - 1] + 1;
    if (next <= 65535) sorted.push(next);
    else break;
  }
  return sorted.slice(0, 1000);
})();

function normalizePortRange(range: string): string {
  return range.trim().toLowerCase();
}

export function buildNmapPortArgs(portRange: string): string[] {
  const normalized = normalizePortRange(portRange);

  if (!normalized) {
    return [];
  }

  if (normalized === 'top-100' || normalized === 'top100') {
    return ['--top-ports', '100'];
  }

  if (normalized === 'top-1000' || normalized === 'top1000') {
    return ['--top-ports', '1000'];
  }

  if (normalized === 'top-5000' || normalized === 'top5000') {
    return ['--top-ports', '5000'];
  }

  if (normalized === 'all') {
    return ['-p-'];
  }

  return ['-p', portRange.trim()];
}

/** Run nmap port scan and return XML stdout. */
function execNmap(args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('nmap', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export function extractNmapXmlPayload(output: string): string {
  const trimmed = output.trimStart();
  const xmlStart = trimmed.indexOf('<?xml');
  if (xmlStart >= 0) {
    return trimmed.slice(xmlStart);
  }

  const nmapRunStart = trimmed.indexOf('<nmaprun');
  if (nmapRunStart >= 0) {
    return trimmed.slice(nmapRunStart);
  }

  return trimmed;
}

/** Parse nmap XML output into PortScanResult[]. */
export function parseNmapPortXml(xml: string): PortScanResult[] {
  try {
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const doc = parser.parse(extractNmapXmlPayload(xml));

    const hosts = Array.isArray(doc?.nmaprun?.host)
      ? doc.nmaprun.host
      : doc?.nmaprun?.host
        ? [doc.nmaprun.host]
        : [];

    const results: PortScanResult[] = [];
    for (const host of hosts) {
      const status = host?.status?.['@_state'] ?? host?.status;
      if (status === 'down') continue;

      const portsNode = host?.ports?.port;
      const ports = Array.isArray(portsNode) ? portsNode : portsNode ? [portsNode] : [];

      for (const p of ports) {
        const portNum = Number(p['@_portid']);
        const protocol = (p['@_protocol'] ?? 'tcp') as 'tcp' | 'udp';
        const state = (p?.state?.['@_state'] ?? 'closed') as 'open' | 'closed' | 'filtered';
        const serviceName = p?.service?.['@_name'] ?? undefined;
        const version = p?.service?.['@_version'] ?? undefined;

        results.push({
          port: portNum,
          protocol,
          state,
          service: serviceName,
          version,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Scan TCP ports on a target IP using nmap. */
export async function scanPorts(
  ip: string,
  portRange: string,
  intensity: string,
): Promise<PortScanResult[]> {
  const args = ['-sT', ...buildNmapPortArgs(portRange), ip, '-oX', '-'];

  // Adjust timing based on intensity
  if (intensity === 'quick') {
    args.push('-T4');
  } else if (intensity === 'thorough') {
    args.push('-T2', '-sV');
  } else {
    args.push('-T3');
  }

  try {
    const xml = await execNmap(args);
    return parseNmapPortXml(xml);
  } catch {
    // If nmap is unavailable or fails, return empty results
    return [];
  }
}

/** Detect changes between two port scan snapshots. */
export function detectPortChanges(
  deviceId: string,
  currentPorts: PortScanResult[],
  previousPorts: PortScanResult[],
): PortChange[] {
  const changes: PortChange[] = [];
  const now = new Date().toISOString();

  const currentMap = new Map<number, PortScanResult>();
  for (const p of currentPorts) {
    currentMap.set(p.port, p);
  }

  const previousMap = new Map<number, PortScanResult>();
  for (const p of previousPorts) {
    previousMap.set(p.port, p);
  }

  // Ports in current but not in previous → newly opened
  for (const [port, curr] of currentMap) {
    const prev = previousMap.get(port);
    if (!prev) {
      changes.push({
        port,
        protocol: curr.protocol,
        previousState: 'closed',
        currentState: curr.state,
        detectedAt: now,
      });
    } else if (prev.state !== curr.state) {
      changes.push({
        port,
        protocol: curr.protocol,
        previousState: prev.state,
        currentState: curr.state,
        detectedAt: now,
      });
    }
  }

  // Ports in previous but not in current → closed
  for (const [port, prev] of previousMap) {
    if (!currentMap.has(port)) {
      changes.push({
        port,
        protocol: prev.protocol,
        previousState: prev.state,
        currentState: 'closed',
        detectedAt: now,
      });
    }
  }

  return changes;
}

/** Identify the service running on a port by number or banner. */
export function identifyService(port: number, banner?: string): string | null {
  // Try banner detection first if provided
  if (banner) {
    for (const { pattern, service } of BANNER_PATTERNS) {
      if (pattern.test(banner)) {
        return service;
      }
    }
  }

  // Fall back to well-known port mapping
  return WELL_KNOWN_PORTS[port] ?? null;
}

/** Parse a port range string into an array of port numbers. */
export function parsePortRange(range: string): number[] {
  const normalized = normalizePortRange(range);

  if (normalized === 'top-100' || normalized === 'top100') {
    return [...TOP_100_PORTS];
  }

  if (normalized === 'top-1000' || normalized === 'top1000') {
    return [...TOP_1000_PORTS];
  }

  // Comma-separated list: "22,80,443"
  if (normalized.includes(',')) {
    return range.split(',').map(p => Number(p.trim()));
  }

  // Range: "1-1024"
  if (normalized.includes('-')) {
    const [startStr, endStr] = range.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    const ports: number[] = [];
    for (let i = start; i <= end; i++) {
      ports.push(i);
    }
    return ports;
  }

  // Single port
  return [Number(range)];
}

/** Extract version information from a service banner string. */
export function extractVersion(banner: string): string | null {
  if (!banner) return null;

  // SSH banner: "SSH-2.0-OpenSSH_8.9" → "OpenSSH_8.9"
  const sshMatch = banner.match(/^SSH-[\d.]+-(.*)/);
  if (sshMatch) return sshMatch[1];

  // HTTP Server header: "Apache/2.4.51" or "nginx/1.21.4"
  const serverMatch = banner.match(/([\w.-]+\/[\d.]+)/);
  if (serverMatch) return serverMatch[1];

  // Generic version pattern: "ProductName X.Y.Z"
  const genericMatch = banner.match(/([\w.-]+[\s_][\d]+(?:\.[\d]+)+)/);
  if (genericMatch) return genericMatch[1];

  return null;
}
