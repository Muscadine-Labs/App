// Learning system types and minimal configuration

export interface TrackableElement {
  id: string;
  component: string;
  type: 'financial' | 'security' | 'strategy' | 'interaction' | 'general';
  complexity: 'low' | 'medium' | 'high';
  isDetailed: boolean;
  isInteractive: boolean;
  priority: number;
  lessonCategory: string;
}

export interface Lesson {
  id: string;
  title: string;
  url: string;
  category: string;
  elementIds: string[];
  priority: number;
}

export interface LearningContextType {
  visibleElements: TrackableElement[];
  activeLessons: Lesson[];
  hoveredElementId: string | null;
  setHoveredElement: (elementId: string | null) => void;
  selectedElementId: string | null;
  setSelectedElement: (elementId: string | null) => void;
  registerElement: (element: TrackableElement) => void;
  unregisterElement: (elementId: string) => void;
  updateElementState: (elementId: string, updates: Partial<TrackableElement>) => void;
}

// Minimal element priorities used by the element tracker helper
export const ELEMENT_PRIORITIES = {
  'vault-apy-breakdown': { base: 100, detailed: true, interactive: true },
  'vault-security': { base: 90, detailed: true, interactive: false },
  'vault-markets': { base: 85, detailed: true, interactive: false },
  'deposit-form': { base: 80, detailed: true, interactive: true },
  'withdraw-form': { base: 80, detailed: true, interactive: true },
  'transaction-status': { base: 75, detailed: true, interactive: false },
  'vault-apy': { base: 70, detailed: false, interactive: false },
  'vault-tvl': { base: 65, detailed: false, interactive: false },
  'vault-curator': { base: 60, detailed: false, interactive: false },
  'vault-timelock': { base: 60, detailed: false, interactive: false },
  'vault-guardian': { base: 60, detailed: false, interactive: false },
  'vault-oracle': { base: 60, detailed: false, interactive: false },
  'vault-performance-fee': { base: 60, detailed: false, interactive: false },
  'asset-dropdowns': { base: 55, detailed: true, interactive: true },
  'wallet-overview-section': { base: 45, detailed: false, interactive: false },
  'overlay-vault-value': { base: 70, detailed: true, interactive: false },
  'vault-list': { base: 40, detailed: false, interactive: true },
  'vault-cards': { base: 35, detailed: false, interactive: true },
  'total-assets': { base: 35, detailed: false, interactive: false },
  'liquid-assets': { base: 30, detailed: false, interactive: false },
  'morpho-vaults': { base: 30, detailed: false, interactive: false },
} as const;

// Minimal lessons database (links are placeholders expected by UI)
export const LESSONS_DATABASE: Record<string, Lesson> = {
  'apy-breakdown': {
    id: 'apy-breakdown',
    title: 'Understanding APY Breakdown',
    url: 'https://docs.muscadine.io/apy-breakdown',
    category: 'financial',
    elementIds: ['vault-apy-breakdown', 'vault-apy'],
    priority: 100,
  },
  'vault-security': {
    id: 'vault-security',
    title: 'Vault Security Features',
    url: 'https://docs.muscadine.io/vault-security',
    category: 'security',
    elementIds: ['vault-security-section', 'vault-security', 'vault-timelock', 'vault-guardian'],
    priority: 90,
  },
  'market-allocation': {
    id: 'market-allocation',
    title: 'Understanding Market Allocation',
    url: 'https://docs.muscadine.io/market-allocation',
    category: 'strategy',
    elementIds: ['vault-markets', 'vault-curator'],
    priority: 85,
  },
  'vaults-in-depth': {
    id: 'vaults-in-depth',
    title: 'Vaults In Depth',
    url: 'https://docs.muscadine.io/vaults-in-depth',
    category: 'interaction',
    elementIds: ['overlay-vault-value'],
    priority: 70,
  },
  'wallets-basics': {
    id: 'wallets-basics',
    title: 'Wallets 101',
    url: 'https://docs.muscadine.io/wallets',
    category: 'general',
    elementIds: ['wallet-overview-section'],
    priority: 50,
  },
  'vault-interaction': {
    id: 'vault-interaction',
    title: 'How to Interact with Vaults',
    url: 'https://docs.muscadine.io/vault-interaction',
    category: 'interaction',
    elementIds: ['deposit-form', 'withdraw-form', 'transaction-status'],
    priority: 80,
  },
  'financial-metrics': {
    id: 'financial-metrics',
    title: 'Understanding Financial Metrics',
    url: 'https://docs.muscadine.io/financial-metrics',
    category: 'financial',
    elementIds: ['vault-tvl', 'vault-performance-fee'],
    priority: 65,
  },
  'portfolio-overview': {
    id: 'portfolio-overview',
    title: 'Managing Your Portfolio',
    url: 'https://docs.muscadine.io/portfolio-overview',
    category: 'general',
    elementIds: ['wallet-overview-section', 'total-assets', 'liquid-assets', 'morpho-vaults'],
    priority: 35,
  },
  'vault-selection': {
    id: 'vault-selection',
    title: 'Choosing the Right Vault',
    url: 'https://docs.muscadine.io/vault-selection',
    category: 'strategy',
    elementIds: ['vault-list', 'vault-cards'],
    priority: 40,
  },
  'general-defi': {
    id: 'general-defi',
    title: 'What is DeFi?',
    url: 'https://docs.muscadine.io/what-is-defi',
    category: 'general',
    elementIds: [],
    priority: 10,
  },
  'morpho-protocol': {
    id: 'morpho-protocol',
    title: 'Understanding Morpho Protocol',
    url: 'https://docs.muscadine.io/morpho-protocol',
    category: 'general',
    elementIds: [],
    priority: 5,
  },
};

