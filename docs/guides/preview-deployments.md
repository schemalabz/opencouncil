# PR Preview Deployments

Automated per-PR preview environments on a NixOS droplet. Each PR gets a subdomain (`pr-123.opencouncil.dev`), a systemd service, and Caddy reverse proxy entry. Each OpenCouncil preview has its own seeded PostgreSQL database.

## How It Works

```
GitHub Actions (on PR open/push)
  1. Detect prisma/migrations/ changes → block if found (override: [skip-migration-check] in PR body)
  2. nix build .#opencouncil-prod
  3. cachix push opencouncil ./result
  4. SSH to droplet → nix-store --realise from cache → opencouncil-preview-create <pr>
  5. Health check (curl preview URL, retry up to 10×)
  6. Post preview URL + health status as PR comment

GitHub Actions (on PR close)
  → SSH to droplet → opencouncil-preview-destroy <pr>
```

On the droplet, each PR maps to:
- **Port**: `3000 + PR_NUMBER` (PR #123 → port 3123)
- **Service**: `opencouncil-preview@3123.service`
- **Caddy config**: `/etc/caddy/conf.d/pr-123.conf` → reverse proxy to `localhost:3123`
- **URL**: `https://pr-123.opencouncil.dev`

## Repository Files

| File | Purpose |
|------|---------|
| `flake.nix` → `opencouncil-prod` | `buildNpmPackage` producing a Next.js standalone build |
| `flake.nix` → `previews.opencouncil` | Preview config export (start script, DB lifecycle hooks) consumed by the generic [pr-previews](https://github.com/schemalabz/pr-previews) NixOS module, which generates the systemd service, Caddy vhosts, sudo rules, and management scripts |
| `.github/workflows/preview-deploy.yml` | Build + deploy on PR open/sync (includes health check) |
| `.github/workflows/preview-cleanup.yml` | Teardown on PR close |

## Nix Build Details

The `opencouncil-prod` package in `flake.nix` uses `buildNpmPackage` with these key considerations:

- **npm dependencies via `importNpmLock`**: Each package is fetched using the integrity hashes already in `package-lock.json`, so lockfile changes (including dependabot bumps) need no manual hash update.
- **`--ignore-scripts` during install**: The `canvas` npm package requires native libraries (cairo, pango, libjpeg, giflib, librsvg, pixman). Scripts are skipped during the dependency fetch phase, then `npm rebuild canvas` runs in `preBuild` with all native deps available.
- **`SKIP_ENV_VALIDATION=1`**: The app uses `@t3-oss/env-nextjs` which validates env vars at build time. Since secrets aren't available in the Nix sandbox, this flag (checked via `skipValidation` in `src/env.mjs`) skips validation during build.
- **Prisma**: Engines are provided by `pkgs.prisma-engines`. `npx prisma generate` runs in `preBuild`.
- **Output**: Next.js standalone build at `$out/` with `server.js`, `.next/static`, `public/`, and `prisma/`.

## Droplet Setup

### Requirements

- NixOS droplet
- Minimum: 2 GB RAM, 20 GB disk
- DNS. `opencouncil.dev` is delegated to the DigitalOcean nameservers, the same
  as `opencouncil.gr`. Add the domain under **Networking → Domains**, then add
  two records that point at the droplet IP:

  | Type | Hostname | Value |
  |------|----------|-------|
  | A | `@` | `<droplet-ip>` |
  | A | `*` | `<droplet-ip>` |

  A DNS wildcard matches one label only. A preview host must therefore stay one
  label deep: `pr-123.opencouncil.dev` resolves, `pr-123.preview.opencouncil.dev`
  does not. Do not put a TLS-terminating proxy in front of these records. Caddy
  answers the ACME challenge itself, and a proxy in front of it blocks the
  challenge.

  `.dev` is on the HSTS preload list, so browsers force HTTPS on every preview.
  Caddy issues one certificate per hostname on demand, which satisfies that.
  Previews also stop consuming the Let's Encrypt certificate quota of
  `opencouncil.gr`.

### Configuration

The droplet consumes the NixOS module directly from the flake. You need two files in `/etc/nixos/`:

**`/etc/nixos/flake.nix`** — points at the repo:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    opencouncil.url = "github:schemalabz/opencouncil";
  };

  outputs = { self, nixpkgs, opencouncil, ... }: {
    nixosConfigurations.preview = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        (nixpkgs + "/nixos/modules/virtualisation/digital-ocean-config.nix")
        pr-previews.nixosModules.default
        ./configuration.nix
      ];
    };
  };
}
```

**`/etc/nixos/configuration.nix`** — host-specific settings only:

```nix
{ lib, ... }:

{
  imports = lib.optional (builtins.pathExists ./do-userdata.nix) ./do-userdata.nix;

  networking.hostName = "opencouncil-preview";

  services.pr-previews = {
    enable = true;
    user = "opencouncil";
    group = "opencouncil";
    projects.opencouncil = lib.mkMerge [
      opencouncil.previews.opencouncil
      { envFile = "/var/lib/opencouncil-previews/.env"; }
    ];
  };

  services.openssh = {
    enable = true;
    settings.PasswordAuthentication = false;
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAA... you@host"
  ];

  system.stateVersion = "24.11";
}
```

Apply with:
```bash
nixos-rebuild switch --flake /etc/nixos#preview
```

The module is self-contained — it includes Caddy, firewall rules, sudo rules, helper scripts, garbage collection, and Cachix configuration. No separate files to sync.

### Updating the Module

When the `previews.opencouncil` export (or the pr-previews module) changes, pull the update on the droplet:

```bash
# Update the opencouncil flake input to latest commit
nix flake update opencouncil --flake /etc/nixos

# Apply
nixos-rebuild switch --flake /etc/nixos#preview
```

### Changing the Preview Domain

The domain lives in three places. Change all three together:

1. `services.opencouncil-preview.previewDomain` in the module (`flake.nix`). It
   sets the Caddy vhost of each preview and the `NEXTAUTH_URL` of each instance.
2. `PREVIEW_DOMAIN` in `.github/workflows/preview-deploy.yml`. It sets the
   health-check URL and the URL in the PR comment.
3. `PREVIEW_DOMAIN` in `src/lib/realm.ts`. `isKnownRealmHost` gates the SEO
   redirects and the magic-link host rewrite on it. A preview on a host that
   this constant does not cover stops reproducing production.

To keep the old hostnames alive during the move, set `legacyPreviewDomain` to
the previous domain. Each preview then gets a second vhost,
`pr-<N>.<legacyPreviewDomain>`, that 301s to the new URL. Old DNS must stay in
place while this option is set. Set the option back to `null` after every open
PR redeploys.

An open PR keeps its old Caddy config until its next deployment. To move the
existing previews immediately, regenerate their configs on the droplet:

```bash
for f in /etc/caddy/conf.d/pr-*.conf; do
  n=$(basename "$f" .conf)
  n=${n#pr-}
  port=$((3000 + n))
  caddy-add-preview "$n"
  systemctl is-active --quiet "opencouncil-preview@$port" && systemctl restart "opencouncil-preview@$port"
done
```

`nixos-rebuild switch` normally restarts the instances itself, because the new
`NEXTAUTH_URL` changes the unit. The explicit restart makes that certain. A
preview that keeps the old `NEXTAUTH_URL` serves on the new host but still mails
magic links that point at the old one.

### SSH Key for GitHub Actions

Generate on the droplet. Note: the `opencouncil` user's home is `/var/lib/opencouncil-previews` (set by the NixOS module), so `authorized_keys` must go there:

```bash
OHOME=/var/lib/opencouncil-previews
mkdir -p $OHOME/.ssh
ssh-keygen -t ed25519 -f $OHOME/.ssh/github_actions -N "" -C "github-actions-deploy"
cat $OHOME/.ssh/github_actions.pub >> $OHOME/.ssh/authorized_keys
chown -R opencouncil:opencouncil $OHOME/.ssh
chmod 700 $OHOME/.ssh
chmod 600 $OHOME/.ssh/authorized_keys
```

Copy the private key (`cat /var/lib/opencouncil-previews/.ssh/github_actions`) to the `PREVIEW_DEPLOY_SSH_KEY` GitHub secret.

### Environment Variables

The app requires many env vars at runtime (API keys, storage config, etc.). These are split into three categories:

**Per-instance (set by the NixOS module automatically):**
- `PORT` — `basePort + PR_NUMBER`
- `NODE_ENV=production`
- `HOSTNAME=0.0.0.0`
- `NEXTAUTH_URL` — `https://pr-<N>.opencouncil.dev` (used for all URL construction: callbacks, emails, etc.)

**Shared (env file at `/var/lib/opencouncil-previews/.env`):**

Shared secrets and service settings live here. Preview startup supplies the database URLs. This file is `chmod 600` and never ends up in the Nix store. Create it on the droplet:

```bash
ssh root@<droplet-ip>
nano /var/lib/opencouncil-previews/.env
```

Required contents (replace the example service credentials):

```env
# Auth
RESEND_API_KEY=...
NEXTAUTH_SECRET=...

# Services
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...

# Storage (DigitalOcean Spaces)
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
CDN_URL=https://...

# Task Server
TASK_API_URL=https://...
TASK_API_KEY=...

# Search
ELASTICSEARCH_URL=https://...
ELASTICSEARCH_API_KEY=...

# Client-side
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=...
```

Set permissions:
```bash
chown opencouncil:opencouncil /var/lib/opencouncil-previews/.env
chmod 600 /var/lib/opencouncil-previews/.env
```

The NixOS module loads this file via systemd `EnvironmentFile=`. Optional vars (Discord, Bird, Google Calendar, etc.) can be added to the same file — see `src/env.mjs` for the full list.

**Base URL note:** Server-side base URLs come from `NEXTAUTH_URL`, read at runtime, so previews work correctly without build-time URL injection. Links to a city's content go through `realmBaseUrl`, which rewrites to the realm's own domain only when `NEXTAUTH_URL` is a production apex — a preview host is kept as is, so preview links stay on the preview. Client-side code that needs the base URL uses `window.location.origin` instead.

### GitHub Secrets

| Secret | Value |
|--------|-------|
| `CACHIX_AUTH_TOKEN` | Personal auth token from [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens) |
| `CACHIX_CACHE_NAME` | `opencouncil` |
| `PREVIEW_DEPLOY_SSH_KEY` | SSH private key (full content including headers) |
| `PREVIEW_HOST` | Droplet IP (e.g., `113.54.65.12`) |
| `PREVIEW_USER` | `opencouncil` |

## Paired Notis Previews

A PR that touches `services/notis/` or `packages/ui/` (or carries the
`preview-notis` label) also gets a notis preview in the same workflow run:

- The URL is `https://notis-pr-N.opencouncil.dev` (port 20000+N).
- CI builds it from `.#notis-prod`. The `start.sh` entrypoint pins Node 24
  (the `engines` requirement), so the preview runs the toolchain that built
  it.
- The instance points `OPENCOUNCIL_BASE_URL` and `NOTIS_MCP_URL` at the
  same PR's main preview, not at production. The pr-previews `siblings`
  context computes those URLs.
- The cleanup workflow destroys the notis preview together with the main
  one when the PR closes.

Manual management mirrors the main app: `notis-preview-list`,
`notis-preview-logs <N>`, `sudo notis-preview-create <N> <store-path>`,
and `sudo notis-preview-destroy <N>`. The shared env lives in
`/var/lib/notis-previews/.env`. It holds a dummy `ANTHROPIC_API_KEY` — the
trust model allows preview-grade secrets only, so agent calls fail by design.
The shared file does not need database URLs. Startup supplies the database URLs for the paired preview.

The database module creates `notis` in the paired OpenCouncil cluster. Its initializer applies the Notis migrations. It then restores the reader role and view grants that seed restores omit. Finally, it grants `notis_reader` to `notis_service`.
Create the OpenCouncil preview before creating its Notis preview.
Admin access uses the shared session cookie (`__Secure-oc-session-prN` on `.opencouncil.dev`).

## Manual Management

SSH to the droplet, then:

```bash
# List active previews
opencouncil-preview-list

# Create/destroy a preview
sudo opencouncil-preview-create 123    # starts service on port 3123, adds Caddy config
sudo opencouncil-preview-destroy 123   # stops service, removes Caddy config

# Check a specific service
systemctl status opencouncil-preview@3123
journalctl -u opencouncil-preview@3123 -f

# Caddy helpers (called automatically by create/destroy)
sudo caddy-add-preview 123
sudo caddy-remove-preview 123
```

## Manual Testing (without GitHub Actions)

Before the full CI pipeline is configured, you can test the build and deploy flow manually. This uses PR number `999` as a placeholder.

### 1. Build locally

```bash
# Load env vars (needed for NEXT_PUBLIC_* values baked into client JS)
set -a; source .env; set +a

# Build the production package (--impure required for builtins.getEnv)
nix build --impure .#opencouncil-prod
```

### 2. Push to Cachix

```bash
cachix push opencouncil ./result
```

### 3. Deploy to droplet

```bash
DROPLET=<DROPLET-IP>

# The create script automatically fetches the store path from Cachix
ssh root@$DROPLET "sudo opencouncil-preview-create 999 $(readlink ./result)"
```

### 4. Verify

```bash
curl -sI https://pr-999.opencouncil.dev | head -20
```

### 5. Teardown

```bash
ssh root@$DROPLET "sudo opencouncil-preview-destroy 999"
```

## Preview databases

Every OpenCouncil preview gets a PostgreSQL cluster with PostGIS 3.3.5. The cluster uses port `30000 + PR_NUMBER`.
The database user and database name are both `opencouncil`. Loopback connections use trust authentication.

On the first deployment, `seed setup` restores the published subset. It then applies the checkout's migrations and creates test accounts.
The production closure carries the seed command and its PostgreSQL 16 client tools.

The module records the data variant, database fingerprint, and generation after successful initialization.
The fingerprint includes the migration contents and seed bundle. An unchanged fingerprint preserves preview data.
A changed fingerprint rebuilds the database from the latest published subset. A new seed release alone does not rebuild existing previews.
Notis rebuilds on its next deployment when the paired OpenCouncil generation changes.

A failed initialization fails deployment. The module drops the incomplete database and removes its successful state.
The next deployment retries initialization. Destroying the main preview stops its cluster and removes its data directory.
Destroy paired Notis previews before destroying the main preview.

The default data variant is `default`. Other variants fail with an explicit message until the application implements them.
PR numbers must be integers from 1 through 9999.

Before a new cluster starts, the module requires at least 2048 MiB of free disk space.
Monitor database memory and disk usage as the number of previews increases.

### Rollout prerequisites

Existing PR builds do not contain the packaged seed command. Update each open PR with this application change before rebuilding it.
The host checks database inputs before stopping a running preview. An incompatible build fails with an explicit message and preserves the running application.

Deploy the new preview module before deploying the updated workflow. The workflow passes `--data-variant=default`, which older hosts reject.
Redeploy OpenCouncil before its paired Notis preview. Existing clusters restart on their new ports when their previews redeploy.
Remove shared staging URL entries only after every active preview uses its generated local URLs.

### Development and debugging

Run these commands on the preview host:

```bash
PR_NUM=123
systemctl status opencouncil-preview@$((3000 + PR_NUM))
systemctl status opencouncil-preview-db@$PR_NUM
cat /var/lib/opencouncil-previews/pr-$PR_NUM/.databases/opencouncil.json
psql -h 127.0.0.1 -p $((30000 + PR_NUM)) -U opencouncil -d opencouncil
```

To deploy a built closure manually:

```bash
sudo opencouncil-preview-create 123 /nix/store/<application-closure>
```

To connect through the local development helper, set `OC_PREVIEW_SSH`. Then run `nix run .#dev -- --preview-db=123`.
The helper opens an SSH tunnel to the preview's database. It fails when that preview's database service is unavailable.

## Testing Other Realms

`opencouncil.dev` belongs to no realm, so every preview resolves to the
**greece** realm by Host header — and some realm domains (e.g.
`opencouncil.rs`) have no DNS at all yet. To review another realm, append
`?realm=<realm>` to any preview URL:

```
https://pr-288.opencouncil.dev/?realm=serbia
```

The proxy stores the realm in an `oc-realm` cookie (30 days) and redirects to
the clean URL; from then on the whole app — landing page city list, realm
guards, default locale, locale redirects, script switcher — behaves as that
realm. Switch back with `?realm=greece`, or clear the cookie.

The override works on any non-production host (previews, localhost) and is
ignored on the production apex domains. See `realmOverride` in
`src/lib/realm.ts`.

## Troubleshooting

**Migration changes:**

The fingerprint includes each migration file's contents. Changing an applied migration rebuilds the preview database on the next deployment.
Use additive migrations when possible. A rebuild replaces manual preview data with the published subset.

**Preview not accessible:**
1. DNS: `dig pr-123.opencouncil.dev` should resolve to droplet IP
2. Caddy: `systemctl status caddy` + check `/etc/caddy/conf.d/pr-123.conf` exists
3. Service: `systemctl status opencouncil-preview@3123` should be active
4. Logs: `journalctl -u opencouncil-preview@3123 -n 100`

**Build failures:**
1. Check GitHub Actions logs
2. Test locally: `nix build .#opencouncil-prod`

**Disk space:**
```bash
df -h
nix-collect-garbage -d   # remove old builds (also runs weekly via systemd timer)
```

## Related Files

- [Cachix Setup](./cachix-setup.md)
- [GitHub Secrets Reference](../../.github/SECRETS.md)
- `flake.nix` — production build package + self-contained NixOS module

<!-- Temporary preview database lifecycle smoke test; do not merge. -->
