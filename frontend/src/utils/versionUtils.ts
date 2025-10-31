export function getVersionMajor(version?: string): number {
  if (!version) return 0;
  const cleaned = version.replace(/^[^\d]*/, "");
  return parseInt(cleaned.split(".")[0], 10);
}
