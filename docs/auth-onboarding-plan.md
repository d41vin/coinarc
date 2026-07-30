# CoinArc Auth and Onboarding Plan

Status: authentication and onboarding are implementation-complete for the hackathon build. This remains the handoff record for future sessions and public-release work.

Last updated: 2026-07-31

## Implemented in the initial slice

- Circle User-Controlled Wallet Email OTP with an embedded Arc Testnet wallet.
- RainbowKit/wagmi/viem external-wallet connection and CoinArc-owned SIWE verification.
- RS256 HTTP-only CoinArc sessions; short-lived Convex access tokens; issuer JWKS and OpenID configuration routes.
- Server-backed, single-use Circle OTP attempts and SIWE nonces.
- Verified Circle and SIWE wallet records, with the first verified wallet selected as the primary receiving wallet.
- Mandatory display-name and username onboarding, with public landing-page access and protected-route gating.
- UploadThing profile photo uploads: JPEG, PNG, and non-animated WebP; 4 MB maximum.
- A shared session-aware header, theme control, account menu, and sign out.
- Active-session renewal: the seven-day HTTP-only session is renewed on app load and every six hours while CoinArc remains open.
- Resilient authenticated navigation: a temporary profile/Convex lookup failure no longer makes the shared header crash the page.
- Transactional Circle OTP request limits using Convex's rate-limiter component: 60 requests/minute globally (120 burst), 3 per email per 15 minutes, and 10 per device per hour.
- Avatar replacement cleanup: the new UploadThing file is saved first, then the superseded file is deleted without risking the new profile photo.

The Circle email-OTP path, wallet creation, onboarding, avatar upload, and return to `/home` have been verified end to end on Vercel. A desktop external-wallet SIWE login has been verified. Mobile WalletConnect remains a required release test.

## Product decisions made

### Wallet and sign-in choices

CoinArc will launch with two distinct entry paths:

1. **Continue with email**
   - Uses Circle User-Controlled Wallets Email OTP.
   - Creates or opens one user-controlled, embedded CoinArc wallet.
   - The OTP email is the user's verified CoinArc contact email.

2. **Connect an existing wallet**
   - Uses an externally controlled EVM wallet (for example MetaMask or Rabby).
   - Proves ownership through Sign-In with Ethereum (SIWE).
   - Does not create a Circle embedded wallet automatically.

These paths create or resolve one internal CoinArc user profile. A user may explicitly link an external wallet to their CoinArc profile later.

An external-wallet user providing a contact email does **not** create a Circle embedded wallet. For launch, their account remains external-wallet based. Do not use Circle Email OTP merely to collect or verify an optional contact email; Circle Email OTP is reserved for the embedded-wallet sign-in path.

### Circle social login

Circle's social login can create an embedded wallet, but it is **deferred for launch**. Circle does not document a way to use email OTP and social login as alternate credentials for the same existing user-controlled wallet. Multiple methods can therefore create separate Circle user identities and wallets.

The launch rule is one Circle authentication method per embedded CoinArc wallet: **Email OTP only**. Do not present Google, Apple, or Facebook as a recovery or alternate-login path for an email-created Circle wallet.

If social login is revisited, design explicit multi-wallet/account-linking behaviour first. Do not rely on matching an OAuth email address to automatically merge wallets.

### External wallet connection and mobile support

CoinArc is mobile-first and must support both desktop browser wallets and mobile wallet apps. The selected stack is:

- RainbowKit for wallet-connection UI.
- wagmi for connectors and wallet state.
- viem for EVM interactions and server-side signature verification.
- WalletConnect through a Reown/WalletConnect Cloud project ID for QR and mobile deep-link connection.
- CoinArc-owned SIWE and session issuance; do not use Reown Auth or an embedded Reown wallet.

Use RainbowKit's custom-authentication adapter so wallet authentication uses CoinArc's own server endpoints and session model.

Use both the WalletConnect connector and the injected-wallet connector. WalletConnect preserves mobile QR/deep-link support; injected discovery supports extension wallets such as MetaMask and Rabby.

### Reown usage and cost posture

The Reown/WalletConnect project ID is used for self-custodial wallet connectivity. Under Reown's current FAQ, the 500-MAU threshold applies to Reown-authenticated users, not ordinary self-custodial wallet connections. CoinArc's SIWE authentication stays outside Reown.

RainbowKit's default configuration uses public RPC providers; it is not a commitment to Reown RPC. For hackathon/testnet work, a public Arc RPC transport is acceptable. Keep wagmi/viem transport configuration in one place and make its URL environment-configurable. Before mainnet production, select and monitor a dedicated RPC provider with a clear reliability and rate-limit policy.

Reown Pro is not a launch requirement. Reconsider it only if its operational value (support, analytics, or service limits) justifies the cost after real usage data exists. Do not upgrade solely to compensate for CoinArc's normal RPC reads; those should remain independently configurable.

### CoinArc identity and Convex

Circle's user token is a Circle wallet-session credential, not CoinArc's app identity.

For Circle email OTP:

1. The browser completes Circle's email-OTP flow.
2. CoinArc's server validates the Circle user token with Circle's user endpoint and obtains the canonical Circle user ID.
3. CoinArc resolves or creates an internal user profile and issues a CoinArc session/JWT for Convex.

For an external wallet:

1. CoinArc's server creates a short-lived SIWE message containing a nonce, exact domain and URI, chain restriction, and expiry.
2. The connected wallet signs the message.
3. CoinArc's server verifies the signature, resolves or creates the internal user profile, and issues the same CoinArc session/JWT for Convex.

Never treat an address supplied by the client as proof of wallet ownership. Never expose Circle API keys to the browser.

### Contact email and notifications

Contact information is a CoinArc record, not a Circle customer directory.

- Email-OTP users: store the verified OTP email as the initial contact email.
- External-wallet users: offer a contact email later in settings or an email-dependent flow. It is optional at launch. When implemented, verify it with CoinArc's own email-verification provider rather than Circle Email OTP.
- Store verification time, notification preferences, and marketing consent separately.
- Do not assume an OAuth-provided email would be the desired notification address if social login is added later.
- CoinArc launches with in-app notifications only. Do not send transactional or marketing email in the initial scope.

Email OTP necessarily processes the email address needed to authenticate the Circle wallet. Explain that purpose in the email-auth UI and privacy notice. Do not treat email-OTP signup as marketing consent. Marketing consent, if introduced, must be an optional, unchecked choice and recorded separately.

## Onboarding decisions

### Entry and gating

- Every account begins as a **personal** CoinArc account. Group and merchant capabilities are future product work, not part of auth onboarding.
- After successful email OTP or verified SIWE, route the user to `/onboarding`.
- Create the internal user record immediately, but mark onboarding as incomplete. Any authenticated attempt to enter the product routes back to `/onboarding` until completion, including after logout and sign-in.
- `/sign-in` is the entry route; the same buttons serve new and returning users. The backend resolves whether an authenticated identity is new or returning.
- Onboarding completion routes the user to `/home`.
- The landing page at `/` is always accessible. Its CTA is session-aware: `Sign in`, `Resume setup`, or `Open CoinArc`.

### Required profile information

Recommended launch form:

- **Display name**: required. This is the human-readable name shown in CoinArc.
- **Username**: required, unique, user-selected, and available for use in payment/profile links. Offer an editable suggestion based on the display name, but do not silently assign an unchangeable generated name.
- **Profile photo**: optional. Use the user-facing label "Profile photo" and the internal/component term "avatar". When absent, render a circular initial-based fallback derived from the display name.
- **Country/region**: do not collect at launch.
- **First and last name**: do not collect as separate required identity fields at launch. A single display-name field is more privacy-preserving and sufficient for a personal payments product. Add legal-name/KYC data only when a future regulated feature actually requires it.

The initial profile-photo fallback can use the existing shadcn Avatar component; no additional avatar library is needed.

### Profile photo uploads

Profile-photo uploads will use UploadThing. `UPLOADTHING_TOKEN` is server-only and belongs in `nextjs/.env.local`; it must never use a `NEXT_PUBLIC_` name or be copied with a real value into `.env.example`.

Use one authenticated profile-photo upload route per user with the following launch limits:

- One file per upload.
- JPEG, PNG, or WebP only; do not accept SVG or animated formats for profile photos.
- **4 MB maximum file size**. This balances mobile upload friction with practical profile-photo quality and is supported by UploadThing's route-level image limits.
- Store the uploaded file reference on the CoinArc user profile only after the authenticated upload completes. Replacing a profile photo saves the new reference first, then deletes the superseded UploadThing file.

UploadThing is installed and integrated. Upload state, successful upload feedback, replacement affordance, field-specific validation errors, and cleanup of superseded files are implemented.

### Receiving and sending wallets

Each profile has one `primaryReceivingWalletId`, chosen only from wallets that have been verified and linked to that CoinArc user.

- Email-OTP users start with the Circle embedded wallet as the primary receiving wallet.
- External-wallet users start with the SIWE-verified wallet as the primary receiving wallet.
- Additional external-wallet linking is intentionally deferred. Do not expose it again until its re-authentication, collision, unlinking, and source-wallet rules are designed together.
- A public profile/payment link resolves to this primary receiving wallet. Changing it requires an explicit confirmation.

Receiving and sending have different UX:

- **Receiving** uses the stable primary receiving wallet.
- **Sending** uses a source-wallet picker whenever the user has more than one eligible wallet. A last-used source may be suggested, but never silently switch the source wallet. An external source wallet must be connected and approve the transaction; a Circle source wallet uses its Circle authorization flow.

### Username recommendation

Use an X-like familiar handle model, adapted for payment links:

- 4 to 20 characters.
- Lowercase ASCII letters, numbers, and underscores only.
- Must start and end with a letter or number; do not allow consecutive underscores.
- Unique and case-insensitive; store and display the canonical lowercase form.
- Reserve CoinArc/system names such as `admin`, `support`, `coinarc`, `api`, `home`, `settings`, `onboarding`, and `wallet`.
- Allow renames only through Settings, with a confirmation and a conservative cooldown. Do not immediately release a previous payment handle to another user.

X's character restrictions are a useful model because they are easy to type, read aloud, and include in a profile URL. CoinArc uses 20 rather than X's 15-character maximum to reduce unnecessary name collisions while keeping payment handles compact.

## Current development setup (verified without exposing secrets)

All application work belongs under `nextjs/`.

- `NEXT_PUBLIC_REOWN_PROJECT_ID` is the correct CoinArc-specific name for the client-exposed WalletConnect project ID. `NEXT_PUBLIC_` is necessary because the browser needs the identifier. It is not a secret, but the Reown dashboard should restrict the project to CoinArc's development and production domains.
- `CIRCLE_API_KEY` is the correct server-only name. Keep the entire key value, including its `TEST_API_KEY:` prefix and the remaining ID/secret segments. Do not expose it with `NEXT_PUBLIC_` and do not put a real key in `.env.example`.
- `NEXT_PUBLIC_CIRCLE_APP_ID` is the correct public name for Circle's User-Controlled Wallet App ID.
- `.env.local` contains non-placeholder values; it is ignored by Git. `.env.example` contains only safe placeholders or blank entries.
- Installed packages include `@circle-fin/w3s-pw-web-sdk`, `@rainbow-me/rainbowkit`, `wagmi`, `viem`, and `@tanstack/react-query`.

## UI and theme policy

Keep both light and dark modes. Do not make CoinArc dark-only: payments and finance screens need to remain readable in bright daytime conditions, and the existing theme switcher already respects the configured shadcn system.

Use shadcn components and the semantic CSS variables in `nextjs/styles/globals.css` (`background`, `foreground`, `primary`, `muted`, `destructive`, and so on). Do not hardcode black or white for the avatar fallback; use `bg-primary` and `text-primary-foreground` so it becomes dark-background/light-text in light mode and light-background/dark-text in dark mode.

`nextjs/AGENTS.md` includes the project UI-system rules: existing shadcn components are the default, semantic theme tokens are required, and any reusable new color must be added centrally in `globals.css` for both themes. Do not add one-off hardcoded palette values in feature components.

## Proposed data ownership

Use a stable internal CoinArc user ID. Associate it with zero or more identities and wallets.

- `users`: CoinArc profile, onboarding state, contact preferences, and future roles.
- `identities`: Circle user identity and/or SIWE-verified external-wallet identity.
- `wallets`: Circle wallet IDs and addresses, plus linked external addresses, chain, custody/source, and whether it is the default payment wallet.

An address may be linked to only one CoinArc user. Linking an additional identity or wallet must require active-session confirmation and fresh proof from the identity being added.

## Remaining work before public release

1. **Verification**: Test SIWE through a real browser extension and mobile WalletConnect. Then confirm, with a fresh Circle email user and a SIWE user, that the corresponding `wallets` record is created once and marked primary. Test one profile-photo replacement and the OTP limit (a fourth request for the same email inside 15 minutes should return a clear wait message).
2. **Account linking UX**: Define where linking is allowed, fresh proof requirements, the maximum number of external wallets, unlinking, and source-wallet selection. This feature is deliberately hidden until that design is ready.
3. **Recovery and revocation**: Define user-facing policy and support handling for lost email access, lost wallet access, device changes, explicit session revocation, and "sign out everywhere". Current sign-out clears the browser session and active sessions roll for seven days; there is no global-revocation feature yet.
4. **Contact email and notifications**: Add optional, separately verified contact email for external-wallet users only when an email provider and notification strategy are selected. Keep marketing consent independent and unchecked.
5. **Terms and privacy acknowledgement**: Define the minimum launch acknowledgement and link it to final policies before accepting real users.
6. **Production operations**: Create a Convex production deployment and point Vercel Production at it; replace Mailtrap Sandbox with a verified transactional email provider and a custom sending domain; select and monitor a dedicated production RPC provider. Add network/edge protection appropriate to public traffic in addition to the application-level OTP limits.

The next product-design priority is account linking and source-wallet selection. It should be designed together with the first payment/profile data flow rather than as an unverified client-side shortcut.

## References

- Circle User-Controlled Wallet authentication methods: https://developers.circle.com/wallets/user-controlled/authentication-methods
- Circle user lookup by user token: https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-by-token
- RainbowKit custom authentication: https://rainbowkit.com/en-US/docs/custom-authentication
- wagmi WalletConnect connector: https://wagmi.sh/react/api/connectors/walletConnect
- Reown AppKit FAQ and self-custodial connection limits: https://docs.reown.com/appkit/faq
