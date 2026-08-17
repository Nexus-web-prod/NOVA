# Nova 7 release stabilization

Date: July 16, 2026

## Moderation and safety

- Added directional Social blocking backed by D1. Blocking removes the friendship and pending pairwise invites, hides blocked messages and reactions, and prevents direct messages or new friend requests in either direction.
- Added admin account search and a dedicated chat moderation workspace.
- Added audited chat evidence search by username, message text, and channel type. An investigation reason is required and recorded.
- Added scoped chat bans for Everyone or all Social chat, with optional expiry and audited removal.
- Added a server-enforced five-second Everyone cooldown and duplicate-message protection.
- Replaced the legacy browser-only word list with normalized server-side filtering for unsafe language, filter evasion, threats, repeated spam, link spam, and sensitive-information patterns.
- Safety-filter events expire after 30 days. Proxy activity remains subject to the existing retention policy.

## Reliability fixes

- Fixed initial chat history loading the oldest 200 messages instead of the newest 200.
- Removed obsolete client-only ban and spam paths that could disagree with D1.
- Restored failed optimistic messages and composer text when a send is rejected.
- Added consistent error and cooldown details to the browser API client.
- Added accessible labels to collapsed admin navigation.
- Corrected the old local-storage notice so it accurately describes signed-in D1 data.
- Fixed normal pages being trapped behind the full-viewport Island after a page launch on small screens. The Island now collapses to its reopen star after mobile navigation.
- Moved the collapsed mobile Island trigger clear of page headers and admin actions.
- Restored the original Nova Island pill-to-card spring after the full-panel glide caused the opening to appear as a flat slide. The Island once again grows from its trigger, overshoots gently, settles, and reveals content after the shell forms.
- Removed the page-canvas blink that hid the Island's opening morph while preserving the one-third desktop layout and responsive Island bounds.

## Verification

- D1 schema 710 applied locally without destructive data changes.
- Added private Discord-style support tickets with threaded replies, user close/reopen controls, and an audited staff queue with assignment, status, and priority controls.
- Account search, required audit reasons, message search, filter-event search, chat ban, chat unban, cooldown, filter rejection, block, unblock, friendship removal, and blocked-DM rejection passed local API tests.
- Admin chat moderation and Social safety controls passed desktop and 390 px browser layout checks with no horizontal page overflow.
- Modified JavaScript passed `node --check`.
- The restored Island animation was measured in the running app: its width overshoots the 422 px target to 438 px before settling, content remains hidden during the shell morph, and the final desktop layout has zero horizontal overflow.
