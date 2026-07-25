# Server-side photo cleanup (Storage lifecycle)

The app already deletes booths older than two days on its own, but only ones
the current browser remembers (see the note in `src/roomHistory.js` about why
listing rooms is deliberately blocked). This lifecycle rule is the backstop:
Google Cloud Storage deletes **every** photo older than two days, regardless
of which device uploaded it or whether the app is ever opened again.

Bucket: `photobooth-ccd36.firebasestorage.app`
Config: [`storage-lifecycle.json`](./storage-lifecycle.json)

The rule deletes objects under the `photobooth/` prefix once they are 2 days
old. That prefix is where `uploadPhoto()` writes
(`photobooth/{roomId}/{role}/photo-N.jpg`), so nothing else in the bucket is
touched.

**Saved collages are deliberately outside that prefix.** `publishCollage()`
writes to `keepsakes/{roomId}.png`, which this rule never matches — the
individual photos are working material and get swept, but the finished
collage is the keepsake the app exists to make, and it is kept. If you ever
add a lifecycle rule for `keepsakes/` too, that is the switch that decides
whether your collages expire.

## Option A — command line (fastest)

Requires the [gcloud CLI](https://cloud.google.com/sdk/docs/install), signed
in with the Google account that owns the Firebase project.

```bash
gcloud auth login
gcloud storage buckets update gs://photobooth-ccd36.firebasestorage.app \
  --lifecycle-file=storage-lifecycle.json
```

Verify it applied:

```bash
gcloud storage buckets describe gs://photobooth-ccd36.firebasestorage.app \
  --format="default(lifecycle_config)"
```

## Option B — Google Cloud console (no CLI)

1. Open <https://console.cloud.google.com/storage/browser> and pick the
   **photobooth-ccd36** project.
2. Click the bucket `photobooth-ccd36.firebasestorage.app`.
3. Go to the **Lifecycle** tab → **Add a rule**.
4. Action: **Delete object**.
5. Conditions: **Age** = `2` days, and **Object name matches prefix** =
   `photobooth/`.
6. **Create**.

## Notes

- Deletion is not instant at the 48-hour mark. Google evaluates lifecycle
  rules asynchronously, usually within 24 hours of an object becoming
  eligible, so expect files to disappear somewhere between day 2 and day 3.
- This deletes the image **files** only. The matching Firestore documents
  (`rooms/{roomId}` and its `photos` subcollection) are still cleaned up by
  the app's own two-day sweep, or by the **Delete all booths** button on the
  landing page. Firestore docs are tiny, so leftovers cost effectively
  nothing — but if you want them gone server-side too, Firestore TTL
  policies can expire `rooms/{roomId}` on a timestamp field. TTL does not
  cascade into subcollections, which is why the app-side sweep still matters.
- Lifecycle rules are free. There is no Blaze-plan requirement for this,
  unlike Cloud Functions.
