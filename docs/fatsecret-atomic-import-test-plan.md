# Atomic import acceptance (isolated database only)
The SQL proposal is not deployed and grants no client execution.
- Use synthetic users A/B and actual authenticated roles; reject anonymous access and verify RLS isolation.
- Empty day insert; existing weight/steps-only day preserves every non-nutrition field.
- Existing zero, partial nutrition or photo meals: reject without mutation.
- Two-day batch with conflict on second date: verify first date rolls back.
- Two concurrent sessions inserting same date: exactly one succeeds.
- Concurrent manual update before conditional update: stale result; no overwritten data.
- Reject duplicate dates, future dates, malformed numbers, oversized batches and missing expected state.
- Verify legacy whole-day writers (including offline clients and Telegram) cannot subsequently overwrite imported nutrition. This remains a release blocker until all writers are protected.
- Check function grants, RLS and #51 security findings before any exposure.
- Adapter must map staged next nutrition fields only, not send arbitrary replacement JSON.
Record actual database results separately; TypeScript CI is not SQL verification.
