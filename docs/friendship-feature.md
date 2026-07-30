# Friendship feature

## Product decisions

- Public profiles remain readable without a CoinArc account. Visitors are
  prompted to sign in; signed-in users who have not finished onboarding are
  prompted to complete setup before they can connect.
- A friend request is directional. The recipient can accept or decline it, and
  the sender can cancel it.
- Accepting a request creates one friendship edge for each user. This keeps a
  user's friends list and future feed audience lookups direct and efficient.
- Removing a friend removes both edges. A later reconnection requires a new
  request.
- Blocks are directional and immediately remove either a pending request or an
  existing friendship. Neither party can start a connection while either
  direction is blocked. Blocking does not make an otherwise public profile
  private.

## Current experience

- The profile action area reflects the viewer's state: add friend, sent
  request, accept/decline, friends, unblock, or unavailable.
- The authenticated `/friends` page is the request inbox and friends list.
- Requests and friend lists currently display the most recent 100 entries in
  each section. Add pagination before networks are expected to exceed that.

## Notifications and home feed

Do not build a general notification or activity-feed system in this first
slice. The Friends page gives a recipient an immediate in-app inbox without
committing CoinArc to notification delivery, read-state, push, or email
semantics prematurely.

Build notifications next only when there is a product requirement to alert a
user away from the Friends page. At that point, create one shared notification
model with a recipient, type, source entity, creation time, and read state;
the friend-request mutation can then create its notification in the same
transaction.

Build the home feed after CoinArc has additional activity worth following (for
example group or transaction activity). Its visibility query can use the
direct friendship edges added here. Friend requests should remain private;
only an accepted friendship is a candidate for a future activity event.
