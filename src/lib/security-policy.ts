const providerFrameSources: Readonly<Record<string, string>> = {
  'dramafren-authorized': 'https://dramafrenvip.upns.pro',
};

export function contentSecurityPolicy(enabledProviderValue = '') {
  const enabledProviders = new Set(enabledProviderValue.split(',').map((value) => value.trim()).filter(Boolean));
  const frameSources = ["'self'", 'https://www.youtube-nocookie.com'];
  for (const provider of enabledProviders) {
    const source = providerFrameSources[provider];
    if (source && !frameSources.includes(source)) frameSources.push(source);
  }
  return `frame-src ${frameSources.join(' ')}; object-src 'none'; frame-ancestors 'self'; base-uri 'self'`;
}
