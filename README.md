# Muscadine App

A Next.js application for managing and interacting with Muscadine vaults.

## Getting Started

Install dependencies:

```bash
npm install
```

Set up environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm start` - Start production server

## Security

**Reporting Security Vulnerabilities**

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: [muscadinelabs@gmail.com](mailto:muscadinelabs@gmail.com)
3. Include details about the vulnerability, steps to reproduce, and potential impact

We will acknowledge receipt within 48 hours and provide an assessment within 7 days.

**Security Best Practices**

- Never commit API keys or secrets to the repository
- Use environment variables for all sensitive configuration
- Keep dependencies up to date
- Review and audit smart contract interactions before executing transactions
- Verify transaction details before signing

## Environment Variables

Required environment variables:

- `NEXT_PUBLIC_ALCHEMY_API_KEY` - Alchemy API key for Base mainnet
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID

These should be set in `.env.local` and never committed to the repository.
