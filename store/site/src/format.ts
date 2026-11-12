// A package's size reads the same in every language; dates and counts are the
// language's own (i18n/).
export const size = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
