---
name: review-scheduler-tdd
description: Use when implementing or modifying the dynamic review scheduler, review ratings, mastery updates, weak point strengthening, due dates, and review dashboard behavior.
---

# Review Scheduler TDD Skill

The dynamic review system must be reliable. Use tests before or during changes.

## Ratings

Support four ratings:

- Again
- Hard
- Good
- Easy

## v0.1 scheduler

Initial intervals by mastery:

- unknown: diagnostic required
- 0: no review until studied
- 1: 1 day
- 2: 1 day
- 3: 3 days
- 4: 7 days
- 5: 21 days

After review:

### Again

- interval = 1 day
- ease -= 0.2
- lapses += 1
- concept weak = true
- add or suggest mistake-correction / explain-back cards
- mastery may decrease after repeated failure

### Hard

- interval = max(1, previous interval * 1.2)
- ease -= 0.1
- if repeated Hard, add extra review card

### Good

- interval = previous interval * ease
- repeated Good may suggest mastery upgrade

### Easy

- interval = previous interval * (ease + 0.4)
- ease += 0.1
- repeated Easy may suggest mastery upgrade

Clamp interval to 1-90 days in v0.1.

## Required tests

Add/update tests for:

1. Again
2. Hard
3. Good
4. Easy
5. repeated failure
6. repeated success
7. interval clamp
8. weak flag behavior
9. mastery downgrade suggestion
10. mastery upgrade suggestion
