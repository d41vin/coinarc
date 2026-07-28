<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- coin-arc-ui-system -->

## CoinArc UI system

- Use the existing shadcn/ui components in `components/ui` and whats stated in `components.json`. All shadcn components are already installed; do not run a shadcn add/install command unless the user explicitly asks.
- Preserve the configured light and dark themes. Use semantic theme utilities and CSS variables from `styles/globals.css` (for example `bg-background`, `text-foreground`, `bg-primary`, and `text-primary-foreground`) instead of hardcoded palette values.
- Add a reusable color only deliberately: define a semantic token centrally in `styles/globals.css` for both themes, then consume that token throughout the UI. Do not introduce one-off feature colors without a product reason.
- Keep avatars circular. For a missing profile photo, use the existing Avatar fallback with semantic `primary` and `primary-foreground` colors so it automatically inverts correctly between light and dark modes.

<!-- end-coin-arc-ui-system -->
