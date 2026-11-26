const storefrontOrigins = [
  'https://orbixbd.tech',
  'https://www.orbixbd.tech',
];

export function trustedOrigins(configuredOrigins: string): string[] {
  return [
    ...new Set([
      ...storefrontOrigins,
      ...configuredOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ]),
  ];
}
