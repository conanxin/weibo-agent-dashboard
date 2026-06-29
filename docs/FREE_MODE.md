# Free Mode

This project is designed around a conservative free-first assumption:

- Weibo CLI Free edition may allow only 5 calls per hour.
- Only the current user's own data is supported by default.
- The app keeps a local hourly rate limiter at 4 data calls per hour to avoid exhausting the quota.
- Sync is manual and low-frequency.

## Included By Default

- Check CLI install/auth status.
- Sync my own posts.
- Archive posts locally in SQLite.
- Analyze locally stored posts.
- Generate local drafts for manual copy/paste publishing.

## Excluded By Default

- Hot-search tracking.
- Full-network search.
- Competitor account monitoring.
- Automated Weibo publishing.
- High-frequency background polling.

## MVP Publishing Policy

The MVP never posts to Weibo. Drafts are saved locally and copied manually by the user.
