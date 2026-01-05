function withValidProperties(properties: Record<string, undefined | string | string[] | boolean>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      if (typeof value === 'boolean') return true; // Keep all boolean values
      if (Array.isArray(value)) return value.length > 0;
      return !!value;
    })
  );
}

export async function GET() {
  const URL = process.env.NEXT_PUBLIC_URL || 'https://app.muscadine.io';
  
  const manifest = {
    accountAssociation: {
      // These will be generated via Base Build Account association tool
      // See: https://build.base.org/account-association
      header: process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_HEADER || '',
      payload: process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_PAYLOAD || '',
      signature: process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_SIGNATURE || '',
    },
    miniapp: withValidProperties({
      version: '1',
      name: 'Muscadine Earn',
      homeUrl: URL,
      iconUrl: `${URL}/favicon.png`,
      splashImageUrl: `${URL}/favicon.png`,
      // eslint-disable-next-line no-restricted-syntax
      splashBackgroundColor: '#000000', // Base mini app requires hex color, not CSS variable
      webhookUrl: process.env.NEXT_PUBLIC_WEBHOOK_URL || '',
      subtitle: 'DeFi Vaults on Base',
      description: 'Access Muscadine Vaults.',
      screenshotUrls: [
        // Add screenshot URLs when available
      ],
      primaryCategory: 'finance',
      tags: ['defi', 'vaults', 'yield', 'base', 'muscadine'],
      heroImageUrl: `${URL}/favicon.png`,
      tagline: 'Earn yield on Base',
      ogTitle: 'Muscadine Earn',
      ogDescription: 'Access Muscadine Vaults and earn yield on your assets.',
      ogImageUrl: `${URL}/favicon.png`,
      noindex: false,
    }),
  };

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

