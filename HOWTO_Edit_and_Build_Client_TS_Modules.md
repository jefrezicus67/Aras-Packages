# How to edit & rebuild Aras Innovator client TypeScript modules

A basic, repeatable procedure for changing the client-side TypeScript (the code under
`Innovator\Client\Modules\...`, e.g. the TDF editor) and getting it live.

> Paths below assume a default install at
> `C:\Program Files (x86)\Aras\Innovator\Innovator`. Adjust if yours differs.

---

## Background (why a build is needed)
The client `.ts` files are **not** served directly. They are bundled by **esbuild**
into the files under `Innovator\Client\jsBundles\` (e.g. `tdf.views.es.js`), and the
app loads those bundles. So editing a `.ts` file has no effect until you rebuild the
bundle. The build toolchain is self-contained: a bundled `node.exe` and an installed
`node_modules` already live in `Innovator\Client\nodejs` — you do **not** need to
install Node or run `npm install`.

`Innovator\Client\Modules\jsBundleList.json` maps each bundle name to its entry `.ts`
file, so you can see which bundle a given source file belongs to.

---

## Steps

### 1. Edit the `.ts` source
Open the relevant file under `Innovator\Client\Modules\...` in VS Code and make your
change. Keep edits surgical.

### 2. Build the bundles (must be elevated)
`jsBundles` lives under `C:\Program Files (x86)\...`, which is UAC-protected, so the
build must run **as Administrator** or every file write fails with "Access is denied."

1. Open **PowerShell as Administrator** (Start → "PowerShell" → right-click → *Run as
   administrator*). *(Or launch VS Code itself as administrator so its integrated
   terminal is elevated.)*
2. Run:
   ```
   cd "C:\Program Files (x86)\Aras\Innovator\Innovator\Client\nodejs"
   .\compile.bat -f
   ```
   - `compile.bat` sets `NODE_ENV=production` and runs the build with the bundled
     `node.exe`.
   - `-f` forces a rebuild (skips the "no changes" check). Without it the build may
     report *"No need for a new bundle. There are no changes."* and do nothing.
   - Success = it finishes with no `[ERROR]` lines. Output is written to
     `Innovator\Client\jsBundles\`.

### 3. Clear the client cache (important)
Aras registers a **service worker** that caches the static bundles under a version
"salt" that does **not** change on a manual rebuild. Until it's cleared, the browser
keeps serving the **old** bundle — this is the #1 reason a correct rebuild looks like
it "didn't work."

On the browser you're testing with:
1. F12 → **Application** → **Service Workers** → **Unregister**.
2. **Application** → **Storage** → **Clear site data**.
3. Reload the app (the service worker re-registers and re-caches the fresh bundle).

### 4. Reload and verify
Reload the application and exercise the changed feature. Confirm the new behavior in
the UI and, where relevant, in the Network tab.

---

## Do I need to restart IIS?
Usually **no**. The bundles are static files served by IIS — replacing them and
clearing the client/service-worker cache is enough.

Restart IIS (`iisreset`) only when:
- you changed **server-side** artifacts (`web.config`, `applicationHost.config`, a
  `.cshtml` view/layout, or a compiled server assembly), or
- the build failed on a locked bundle file because the IIS worker was holding it —
  in that case stop the app pool (or `iisreset /stop`), build, then `iisreset /start`.

For a pure client `.ts` → bundle change, skip IIS and just do the cache clear in
step 3.

---

## Rollout to other users
Because the salt is unchanged after a manual rebuild, other users' service workers
will keep serving the cached old bundle. Either:
- bump the client build/version stamp so the salt changes and every service-worker
  cache is invalidated automatically (the clean way), or
- have each user clear site data / unregister the service worker once.

## Rollback
Keep a copy of the original bundle(s) before overwriting (e.g. copy
`jsBundles\<name>.es.js` and its `*-<hash>.es.js` chunks aside — requires an elevated
copy since it's under Program Files). To roll back, restore those files and revert the
`.ts` edit. No IIS restart needed for a client-bundle rollback.

## Upgrade caveat
Edits under `Innovator\Client\Modules\...` are code-tree changes. A platform or module
upgrade can overwrite them and re-ship the stock bundles, so keep a record of your
edits and re-apply + rebuild after upgrades.

---

## Quick reference
```
# 1. edit the .ts under Innovator\Client\Modules\...
# 2. build (elevated PowerShell):
cd "C:\Program Files (x86)\Aras\Innovator\Innovator\Client\nodejs"
.\compile.bat -f
# 3. browser: F12 > Application > Service Workers > Unregister, then Clear site data
# 4. reload and verify   (iisreset only for server-side changes)
```
