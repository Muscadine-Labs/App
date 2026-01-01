# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please follow these steps:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: [security@muscadine.org](mailto:security@muscadine.org)
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- We will acknowledge receipt of your report within **48 hours**
- We will provide an initial assessment within **7 days**
- We will keep you informed of our progress and resolution timeline

## Disclosure Policy

- We will coordinate with you on the disclosure timeline
- We will credit you for the discovery (if desired)
- We will not disclose your identity without your permission

## Scope

### In Scope
- Security vulnerabilities in the application code
- Authentication and authorization issues
- Data exposure or leakage
- Injection vulnerabilities
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)

### Out of Scope
- Denial of service (DoS) attacks
- Social engineering attacks
- Physical security issues
- Issues requiring physical access to devices
- Issues in third-party dependencies (please report to the respective maintainers)

## Security Best Practices

When using this application:

- **Never** commit API keys or secrets to the repository
- Use environment variables for all sensitive configuration
- Keep dependencies up to date
- Review and audit smart contract interactions before executing transactions
- Verify transaction details before signing

## Environment Variables

The following environment variables are required and should be kept secure:

- `NEXT_PUBLIC_ALCHEMY_API_KEY` - Alchemy API key for Base mainnet
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID

These should be set in `.env.local` and never committed to the repository.

## Thank You

We appreciate your help in keeping Muscadine Earn secure!

