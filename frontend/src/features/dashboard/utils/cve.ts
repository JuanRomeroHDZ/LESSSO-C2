const cveCache = new Map<string, { id: string; severity: 'critical' | 'high' | 'medium' }[]>()

export const detectCVEs = (service: string, version: string) => {
  const key = `${service}-${version}`;
  if (cveCache.has(key)) return cveCache.get(key)!;

  const cves: { id: string; severity: 'critical' | 'high' | 'medium' }[] = []
  const s = `${service || ''} ${version || ''}`.toLowerCase()

  if (s.includes('openssh 8.') || s.includes('openssh 9.0') || s.includes('openssh 9.1')) cves.push({ id: 'CVE-2023-38408', severity: 'critical' })
  if (s.includes('vsftpd 2.3.4')) cves.push({ id: 'CVE-2011-2523', severity: 'high' })
  if ((s.includes('smb') || s.includes('microsoft-ds')) && (s.includes('windows 7') || s.includes('windows server 2008'))) cves.push({ id: 'MS17-010', severity: 'critical' })
  if (s.includes('apache') && s.includes('2.4.49')) cves.push({ id: 'CVE-2021-41773', severity: 'high' })
  if (s.includes('proftpd 1.3.5')) cves.push({ id: 'CVE-2015-3306', severity: 'high' })

  cveCache.set(key, cves);
  return cves;
}
