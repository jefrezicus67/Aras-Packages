# TDF `GetList` URL-length fix — what changed and why

## Symptom
Opening a large Technical Document Framework (TDF) document with a **cold metadata
cache** (fresh login / in-private session) failed to render the editor. Under the
hood the editor fired one `MetaData.asmx/GetList` **GET** whose `id` query parameter
was a huge comma-separated list — in the sample document, **303 entries but only 1
distinct List id** (the same List repeated once per property element). That produced
a query string of ~10.7 KB, which exceeded server URL-length limits. The request was
rejected with an HTML error page (HTTP 404), the editor tried to `JSON.parse` that
HTML, threw `Unexpected token '<', "<!DOCTYPE"…`, and the view never initialized.

## Root cause
`EditorViewPanelController.preloadDocumentMetadata()` builds the List id array by
pushing one id **per property element**, with no de-duplication:

```ts
propertyElements.forEach((element) => {
    if (element.getPropertyInfo('data_type') === 'list') {
        listIds.push(element.getPropertyInfo('data_source'));   // once per element
    } else if (... === 'filter list') {
        filterIds.push(element.getPropertyInfo('data_source'));
    }
});
await metadataProvider.loadListsAsync(listIds);
```

`MetadataProvider.loadListsAsync()` filters ids against the cache **before** it
fetches, so on a cold cache the duplicates are not collapsed — they all flow into the
core `getCollectionByIds` call, which builds the over-long GET. URL length grew
linearly with element count instead of with the number of *distinct* Lists.

## The fix
De-duplicate the id arrays at their origin, in `preloadDocumentMetadata`, before the
metadata request:

```ts
await metadataProvider.loadListsAsync([...new Set(listIds)]);
await metadataProvider.loadListsAsync([...new Set(filterIds)], {
    type: 'filter list'
});
```

**File:** `Innovator/Client/Modules/aras.innovator.TDF/Scripts/components/Views/EditorViewPanelController.ts`
(end of `preloadDocumentMetadata`, ~line 983).

## Why this is safe (no data or functionality loss)
The id list is behaviorally a **Set**: the server returns one List per id, and the
client maps the results back **per id**. So collapsing duplicate ids changes nothing
except the length of the request URL. `Set` also preserves first-occurrence order,
and the mapping is order-independent regardless. After the fix, the URL depends only
on the number of **distinct** Lists referenced (typically a handful), so it scales to
documents of any size.

## Why we fixed it here (and not elsewhere)
Other options were considered and rejected:

- **Client fetch wrapper / `_baseViewLayout.cshtml` inline script** — the editor runs
  in nested iframes and Aras controls these requests with its own **service worker**,
  so a per-window `window.fetch` patch is unreliable (it didn't intercept the real
  request in testing).
- **Service-worker edit** (`Client/Modules/service-worker/index.ts`) — would work at
  the network layer, but it's still a code-tree edit that requires the same rebuild,
  and it's further from the actual bug.
- **Raising server URL limits** (IIS `requestFiltering`, ASP.NET `httpRuntime`,
  http.sys registry) — a valid no-build mitigation, but it only defers the problem:
  http.sys `MaxFieldLength` hard-caps at 65534 bytes (~1,800 references), after which
  it fails permanently. It doesn't address the root cause.

The `[...new Set(...)]` change is the smallest edit at the exact point where the
duplication is introduced, with zero behavioral change other than a shorter URL.

## Verification
Cold-load the previously failing document and watch the `MetaData.asmx/GetList`
request:

- **Before:** `id` = 303 entries, ~10.7 KB URL, HTTP 404 (HTML), editor does not render.
- **After:** `id` = distinct ids only (1 in the sample), ~200-char URL, HTTP 200 (JSON),
  editor renders.

## Upgrade / retirement
This is a code-tree edit; a platform or `aras.innovator.TDF` module upgrade will
revert it and re-ship the old bundle, so re-apply the two lines and rebuild after any
upgrade. The logic is version-independent. Ideally file an Aras support ticket so the
`[...new Set(ids)]` de-dupe ships out of the box (in `preloadDocumentMetadata` or
inside `MetadataProvider.loadListsAsync`), after which this patch can be removed.
