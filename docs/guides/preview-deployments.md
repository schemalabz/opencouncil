# PR Preview Deployments

Automated per-PR preview environments on a NixOS droplet. Each PR gets a subdomain (`pr-123.preview.opencouncil.gr`), a systemd service, and Caddy reverse proxy entry. All previews share a staging database.

## How It Works

```
GitHub Actions (on PR open/push)
  1. Detect prisma/migrations/ changes → block if found (override: [skip-migration-check] in PR body)
  2. nix build .#opencouncil-prod
  3. cachix push opencouncil ./result
  4. SSH to droplet → nix build from cache → opencouncil-preview-create <pr>
  5. Post preview URL as PR comment

GitHub Actions (on PR close)
  → SSH to droplet → opencouncil-preview-destroy <pr>
```

On the droplet, each PR maps to:
- **Port**: `3000 + PR_NUMBER` (PR #123 → port 3123)
- **Service**: `opencouncil-preview@3123.service`
- **Caddy config**: `/etc/caddy/conf.d/pr-123.conf` → reverse proxy to `localhost:3123`
- **URL**: `https://pr-123.preview.opencouncil.gr`

## Repository Files

| File | Purpose |
|------|---------|
| `flake.nix` → `opencouncil-prod` | `buildNpmPackage` producing a Next.js standalone build |
| `flake.nix` → `nixosModules.opencouncil-preview` | NixOS module: systemd template service, user/group, management scripts |
| `nix/preview-host.nix` | Host-level config: Caddy, sudo rules, helper scripts, garbage collection |
| `.github/workflows/preview-deploy.yml` | Build + deploy on PR open/sync |
| `.github/workflows/preview-cleanup.yml` | Teardown on PR close |

## Nix Build Details

The `opencouncil-prod` package in `flake.nix` uses `buildNpmPackage` with these key considerations:

- **`npmDepsHash`**: Must be updated when `package-lock.json` changes. Regenerate with:
  ```bash
  nix run nixpkgs#prefetch-npm-deps package-lock.json
  ```
- **`--ignore-scripts` during install**: The `canvas` npm package requires native libraries (cairo, pango, libjpeg, giflib, librsvg, pixman). Scripts are skipped during the dependency fetch phase, then `npm rebuild canvas` runs in `preBuild` with all native deps available.
- **`SKIP_ENV_VALIDATION=1`**: The app uses `@t3-oss/env-nextjs` which validates env vars at build time. Since secrets aren't available in the Nix sandbox, this flag (checked via `skipValidation` in `src/env.mjs`) skips validation during build.
- **Prisma**: Engines are provided by `pkgs.prisma-engines`. `npx prisma generate` runs in `preBuild`.
- **Output**: Next.js standalone build at `$out/` with `server.js`, `.next/static`, `public/`, and `prisma/`.

## Droplet Setup

### Requirements

- NixOS droplet
- Minimum: 2 GB RAM, 20 GB disk
- DNS: `A preview → <ip>` and `A *.preview → <ip>` for `opencouncil.gr`

### Configuration Files

The droplet needs three files in `/etc/nixos/`:

1. **`opencouncil-preview-module.nix`** — Extracted from `flake.nix` `nixosModules.opencouncil-preview`. This is a standalone copy because the droplet uses traditional NixOS config, not flakes. Defines: `services.opencouncil-preview` options, systemd template service, user/group, management scripts (`opencouncil-preview-create`, `opencouncil-preview-destroy`, `opencouncil-preview-list`).

2. **`preview-host.nix`** — From `nix/preview-host.nix` in this repo. Defines: Caddy setup, firewall rules, sudo rules for the deploy user, caddy helper scripts (`caddy-add-preview`, `caddy-remove-preview`), nix garbage collection.

3. **`configuration.nix`** — Main NixOS config importing the above two and setting:
   ```nix
   {
     imports = [
       (modulesPath + "/virtualisation/digital-ocean-config.nix")
       ./opencouncil-preview-module.nix
       ./preview-host.nix
     ];

     services.opencouncil-preview = {
       enable = true;
       databaseUrl = "postgresql://...your-staging-db...";
       basePort = 3000;
       envFile = "/var/lib/opencouncil-previews/.env";
     };

     # Cachix binary cache
     nix.settings.substituters = [
       "https://cache.nixos.org"
       "https://opencouncil.cachix.org"
     ];
     nix.settings.trusted-public-keys = [
       "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
       "opencouncil.cachix.org-1:D6DC/9ZvVTQ8OJkdXM86jny5dQWjGofNq9p6XqeCWwI="
     ];
     nix.settings.experimental-features = [ "nix-command" "flakes" ];
     nix.settings.trusted-users = [ "root" "opencouncil" ];
   }
   ```

After placing files, apply with `nixos-rebuild switch`.

### SSH Key for GitHub Actions

Generate on the droplet:

```bash
mkdir -p /home/opencouncil/.ssh
ssh-keygen -t ed25519 -f /home/opencouncil/.ssh/github_actions -N "" -C "github-actions-deploy"
cat /home/opencouncil/.ssh/github_actions.pub >> /home/opencouncil/.ssh/authorized_keys
chown -R opencouncil:opencouncil /home/opencouncil/.ssh
chmod 700 /home/opencouncil/.ssh
chmod 600 /home/opencouncil/.ssh/authorized_keys
```

Copy the private key (`cat /home/opencouncil/.ssh/github_actions`) to the `PREVIEW_DEPLOY_SSH_KEY` GitHub secret.

### Environment Variables

The app requires many env vars at runtime (API keys, storage config, etc.). These are split into three categories:

**Per-instance (set by the NixOS module automatically):**
- `PORT` — `basePort + PR_NUMBER`
- `DATABASE_URL` — from `services.opencouncil-preview.databaseUrl`
- `NODE_ENV=production`
- `HOSTNAME=0.0.0.0`
- `NEXT_PUBLIC_BASE_URL` — `https://pr-<N>.preview.opencouncil.gr` (set by the start script)
- `NEXTAUTH_URL` — `https://pr-<N>.preview.opencouncil.gr` (required for NextAuth magic link callbacks)

**Shared (env file at `/var/lib/opencouncil-previews/.env`):**

All other required env vars, shared across all previews. Create this file on the droplet:

```bash
ssh root@<droplet-ip>
nano /var/lib/opencouncil-previews/.env
```

Required contents (replace values with real staging credentials):

```env
# Database (direct/non-pooled connection for Prisma migrate)
DIRECT_URL=postgresql://...

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

**`NEXT_PUBLIC_*` note:** Most `NEXT_PUBLIC_BASE_URL` usage in this codebase is server-side (via the t3-env `env` object), so it works at runtime. The only edge case is client-side JavaScript (e.g., admin QR page), where the value is baked at build time. Since the build uses `SKIP_ENV_VALIDATION=1` without a base URL, these client-side references will be empty. For most preview testing this is acceptable.

### GitHub Secrets

| Secret | Value |
|--------|-------|
| `CACHIX_AUTH_TOKEN` | Personal auth token from [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens) |
| `CACHIX_CACHE_NAME` | `opencouncil` |
| `PREVIEW_DEPLOY_SSH_KEY` | SSH private key (full content including headers) |
| `PREVIEW_HOST` | Droplet IP (e.g., `159.89.98.26`) |
| `PREVIEW_USER` | `opencouncil` |

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

If `package-lock.json` changed, update `npmDepsHash` first:
```bash
nix run nixpkgs#prefetch-npm-deps package-lock.json
```

### 2. Push to Cachix

```bash
cachix push opencouncil ./result
```

### 3. Deploy to droplet

```bash
DROPLET=159.89.98.26

# The create script automatically fetches the store path from Cachix
ssh root@$DROPLET "sudo opencouncil-preview-create 999 $(readlink ./result)"
```

### 4. Verify

```bash
curl -sI https://pr-999.preview.opencouncil.gr | head -20
```

### 5. Sync NixOS module (if flake.nix module changed)

If you changed `nixosModules.opencouncil-preview` in `flake.nix`, sync it to the droplet:

```bash
# Extract the module from flake.nix (between nixosModules.opencouncil-preview and the closing)
# and copy to the droplet, then rebuild:
scp nix/preview-host.nix root@$DROPLET:/etc/nixos/preview-host.nix
# For the module, extract it manually or use the Python script from the previous session
ssh root@$DROPLET "nixos-rebuild switch"
```

### 6. Teardown

```bash
ssh root@$DROPLET "sudo opencouncil-preview-destroy 999"
```

## Migration Handling

All previews share the staging database. PRs with changes in `prisma/migrations/` are blocked by default — a PR comment explains why.

To override: add `[skip-migration-check]` anywhere in the PR description, then re-run the workflow. The migration will run against the shared staging DB.

## Troubleshooting

**Preview not accessible:**
1. DNS: `dig pr-123.preview.opencouncil.gr` should resolve to droplet IP
2. Caddy: `systemctl status caddy` + check `/etc/caddy/conf.d/pr-123.conf` exists
3. Service: `systemctl status opencouncil-preview@3123` should be active
4. Logs: `journalctl -u opencouncil-preview@3123 -n 100`

**Build failures:**
1. Check GitHub Actions logs
2. Test locally: `nix build .#opencouncil-prod`
3. If `package-lock.json` changed, update `npmDepsHash` (see [Nix Build Details](#nix-build-details))

**Disk space:**
```bash
df -h
nix-collect-garbage -d   # remove old builds (also runs weekly via systemd timer)
```

## Related Files

- [Cachix Setup](./cachix-setup.md)
- [GitHub Secrets Reference](../../.github/SECRETS.md)
- `nix/preview-host.nix` — host-level NixOS config (Caddy, sudo, scripts)
- `flake.nix` — production build package + NixOS module
