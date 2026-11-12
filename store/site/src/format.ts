export const size = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const DAY = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" });
export const day = (ms: number) => DAY.format(ms);

export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
