# Cachix Setup

Cachix is a hosted binary cache for Nix. The preview deployment system builds once in GitHub Actions and pushes to Cachix, so the droplet pulls pre-built artifacts instead of rebuilding.

For full context on how Cachix fits into the preview system, see [Preview Deployments](./preview-deployments.md).

## Setup

1. **Create account and cache** at [app.cachix.org](https://app.cachix.org). Click "Create a new binary cache", name it (e.g., `opencouncil`). Note the cache name and public key from cache settings.

2. **Generate auth token** at [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens). Copy immediately — it won't be shown again.

3. **Add GitHub secrets** (Settings > Secrets and variables > Actions):
   - `CACHIX_AUTH_TOKEN` — the token from step 2
   - `CACHIX_CACHE_NAME` — your cache name (e.g., `opencouncil`)

4. **Configure the droplet** — add your cache as a Nix substituter in `/etc/nixos/configuration.nix`:
   ```nix
   nix.settings.substituters = [
     "https://cache.nixos.org"
     "https://opencouncil.cachix.org"
   ];
   nix.settings.trusted-public-keys = [
     "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
     "opencouncil.cachix.org-1:D6DC/9ZvVTQ8OJkdXM86jny5dQWjGofNq9p6XqeCWwI="
   ];
   ```
   Then `nixos-rebuild switch`.

## Verification

After a GitHub Actions build completes, check the [Cachix dashboard](https://app.cachix.org) for stored paths. On the droplet, `nix build` should show `copying path ... from 'https://opencouncil.cachix.org'` instead of building locally.

## Troubleshooting

- **Access denied**: Verify `CACHIX_AUTH_TOKEN` in GitHub secrets. Regenerate at [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens).
- **Droplet not using cache**: Check `nix.settings.substituters` in NixOS config, verify public key matches, run `nixos-rebuild switch`.
- **Cache misses**: Ensure GitHub Actions pushed successfully and system architecture matches (x86_64-linux).
- **Storage limits**: Free tier is 5 GB storage / 10 GB transfer per month. Monitor at [app.cachix.org](https://app.cachix.org).
