# Host and Guest Lifetime Management

## Status

This document describes a future lifetime model for the sandboxed SharedTree design.
The current demo does not implement this model.

## Lifetime Invariants

The Host owns the authoritative SharedTree view.
A Guest is a derived view of one Host.

The design must maintain these invariants:

- One Host can have zero or more Guests.
- One Guest has exactly one Host.
- A Guest lifetime cannot exceed its Host lifetime.
- Guest disposal is a supported operation.
- Host disposal with an active Guest is an invariant violation.

## Separate Host and Session State

The current `Host` class contains authoritative state and state for one Guest connection.
These responsibilities must be separate before the design supports multiple Guests.

The authoritative Host owns the main view and a set of Guest sessions.
Each Guest session owns these resources:

- The Host-side local branch for one Guest.
- The Host endpoint of the message channel.
- The synchronization state for that Guest.
- The resources that retain history for that Guest.

This structure lets one Guest stop without affecting the Host or other Guests.

## Guest Disposal

Guest disposal is a normal lifecycle operation.
It stops local edits and message processing.
The Host then removes the corresponding Guest session and releases its resources.

Immediate disposal can discard Guest changes that the Host has not acknowledged.
A caller that requires those changes must wait for Host acknowledgment before immediate disposal.

The protocol should also support graceful Guest shutdown.
A graceful shutdown sends a detach message and waits for the Host to acknowledge it before the Guest closes its port.
This operation must be asynchronous because a Guest can run in another JavaScript realm.

The API should distinguish the two operations:

- `close()` performs graceful asynchronous shutdown.
- `dispose()` performs immediate shutdown and can abandon unacknowledged changes.

## Host Disposal

Orderly Host disposal must require all Guests to stop first.
The Host should fail synchronously if an owner calls `dispose()` while any Guest session is active.
An application-level owner must stop the Guests and then stop the Host.

Unexpected Host loss is different from orderly disposal.
For example, an iframe or worker can lose its connection without a shutdown handshake.
The Guest must treat this condition as a terminal failure.
It must stop edits that appear durable and report the failed synchronization state.

## Synchronization Results

The two synchronization directions have different failure conditions.

Guest-to-Host synchronization completes when the Host acknowledges all Guest changes.
Immediate Guest disposal can abandon this operation.
Unexpected Host loss fails this operation.

Host-to-Guest synchronization completes when the Guest acknowledges the Host update.
Normal Guest detachment can cancel this operation without affecting the Host.
Orderly Host disposal cannot occur while this operation exists.

The implementation can use an internal promise that always fulfills with a synchronization outcome.
The public wait method can convert unsuccessful outcomes to typed errors.
This approach prevents unobserved internal promises from producing unhandled rejections.
It also preserves rejection semantics for a caller that explicitly requests a wait operation.

## Proposed API Direction

Replace promise-valued properties with explicit wait methods.
For example:

```typescript
await guest.waitForHostUpdate();
await hostSession.waitForGuestUpdate();
await guest.close();
host.dispose();
```

The wait methods reject if their synchronization guarantee cannot be met.
The `close()` method reports whether the Host acknowledged all Guest changes.
The `dispose()` methods remain synchronous and release local resources immediately.

## Required Tests

Add tests for these cases when the lifetime model is implemented:

- A Guest stops while the Host and another Guest continue.
- A graceful Guest shutdown preserves acknowledged changes.
- Immediate Guest disposal reports or documents abandoned changes.
- Host disposal with an active Guest fails synchronously.
- Guests stop before an orderly Host shutdown.
- Unexpected Host loss puts each Guest in a terminal failure state.
- Late messages cannot change a settled synchronization result.
