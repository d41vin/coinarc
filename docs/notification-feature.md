# In-app notifications

## Scope and surface

CoinArc notifications are in-app only. This first slice does not send push,
email, or other external delivery. The header bell opens the notification
sheet from the right; this is the sole notification surface for now. A
dedicated `/notifications` page would duplicate a bounded, compact inbox
without adding a user need, so it is deliberately deferred until notification
history, filters, or deep-linkable workflows justify one.

The `/friends` page remains the comprehensive place to manage the network.
The notification sheet also lets a recipient accept or decline an incoming
friend request, so the alert can be resolved without leaving the current
screen.

## Data model

Each notification belongs to one recipient and contains:

- an `actorId` for the person whose action caused it;
- a discriminated `source` entity, currently a `friendRequest` document ID;
- a typed event (`friend-request-received`, `friend-request-accepted`, or
  `friend-request-declined`);
- its creation time and read state; and
- a per-user notification state record with an unread count.

The source is a discriminated union rather than a presentation string. New
product areas extend that union with their own source shape and event types.
The unread counter is maintained in the same transaction as every
notification insertion, deletion, and read transition; the client never
supplies a recipient or uses a user ID to establish ownership.

The inbox retains the 100 newest notifications per recipient. This gives the
sheet and `mark all read` a bounded, predictable unit of work. Newer events
evict the oldest entry, updating the unread count if necessary. Pagination and
long-lived notification history are intentionally deferred with a future
notification page.

## Friendship lifecycle

- Sending a request atomically creates a `friend-request-received` alert for
  the recipient.
- Accepting or declining atomically deletes the recipient's active request
  alert, then creates an informational accepted or declined alert for the
  sender.
- Cancelling a request atomically deletes its active recipient alert.
- Blocking atomically removes any active request and its alert in either
  direction. Previously delivered accepted/declined alerts are read-only
  history and remain; they have no actions and never represent a current
  relationship. This avoids silently erasing a user's notification history
  while ensuring a user can never act on a cancelled, declined, or blocked
  request.

All friendship notification writes are direct database operations inside the
existing friendship mutation transaction. A failed mutation rolls both the
relationship change and the notification change back together.
