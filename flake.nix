{
  description = "OpenCouncil dev shell";

  inputs = {
    # Version pinning is handled by flake.lock (single source of truth).
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    # `nixpkgs-unstable` is kept as a name so the many call sites that take a
    # third `pkgs-unstable` argument keep working. It resolves to the same
    # node as `nixpkgs`; the only reason it stays a separate instantiation is
    # the unfree predicate below.
    nixpkgs-unstable.follows = "nixpkgs";

    # The previous nixos-24.11 pin, kept for the two things that must not move
    # with the channel. Dependabot must not advance it (see dependabot.yml):
    #
    #   prisma-engines / prisma  5.22.0 — must correspond to `prisma` and
    #     `@prisma/client` 5.22.x in package.json. Current nixpkgs carries only
    #     6.x/7.x. Bump only together with a Prisma upgrade.
    #   postgresql_16 + postgis  3.3.5 — matches production. PostGIS 3.3.5
    #     cannot build against the current channel's GEOS 3.14, whose configure
    #     no longer installs geos-config. Postgres comes from here too, because
    #     an extension must be built against the server it loads into.
    nixpkgs-pinned.url = "github:NixOS/nixpkgs/50ab793786d9de88ee30ec4e4c24fb4236fc2674";
  };

  outputs = { self, nixpkgs, nixpkgs-unstable, nixpkgs-pinned }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      # nixpkgs removed the `nodePackages` set and moved the Prisma CLI to a
      # top-level `prisma` attribute. Both it and prisma-engines come from the
      # pinned rev instead — see the nixpkgs-pinned comment above.
      prismaOverlay = prismaPkgs: _final: _prev: {
        inherit (prismaPkgs) prisma-engines;
        prisma = prismaPkgs.nodePackages.prisma;
      };

      # package.json's engines.node is the single source of truth for the Node
      # major: DO App Platform's Node buildpack selects the production runtime
      # from it. Nothing reconciled it with the Nix toolchain, so the two drifted
      # for a month — CI tested on EOL Node 20 while production ran Node 24 (see
      # issue #547). Fail the build instead of drifting again.
      # Node version consistency. package.json's engines.node is the source of
      # truth: DO App Platform's Node buildpack selects production's runtime
      # from it. Nothing reconciled it with the Nix toolchain, so the two
      # drifted for a month — CI tested on EOL Node 20 while production ran
      # Node 24 (see issue #547).
      #
      # Workspaces share one lockfile and one runtime, so every manifest that
      # declares engines.node must declare the SAME range; a workspace cannot
      # actually run a different Node. Checking only "nixpkgs satisfies each"
      # would let root ">=24 <25" and a workspace ">=22 <23" both pass while
      # disagreeing. The workspace list comes from the root's workspaces globs,
      # so a new workspace is covered without editing this file.
      nodeConsistency =
        let
          inherit (nixpkgs) lib;
          rootPkg = lib.importJSON ./package.json;
          dirsOf = glob:
            let
              base = lib.removeSuffix "/*" glob;
              dir = ./. + "/${base}";
            in
            if lib.hasSuffix "/*" glob && builtins.pathExists dir then
              map (n: "${base}/${n}")
                (builtins.attrNames
                  (lib.filterAttrs (_: t: t == "directory") (builtins.readDir dir)))
            else [ glob ];
          candidates = [ "." ] ++ lib.concatMap dirsOf (rootPkg.workspaces or [ ]);
          present = lib.filter (d: builtins.pathExists (./. + "/${d}/package.json")) candidates;
          declaring = lib.filter
            (d: ((lib.importJSON (./. + "/${d}/package.json")).engines or { }) ? node)
            present;
          rangeOf = d: (lib.importJSON (./. + "/${d}/package.json")).engines.node;
          nameOf = d: if d == "." then "package.json" else "${d}/package.json";
          ranges = map (d: { manifest = nameOf d; range = rangeOf d; }) declaring;
          rootRange = rootPkg.engines.node or null;
          disagreeing = lib.filter (r: r.range != rootRange) ranges;
          # builtins.match anchors to the whole string, so this accepts only a
          # bare ">=X <Y". A compound range does not match and falls through to
          # the parse error, rather than being compared against whichever bound
          # happened to be captured.
          parsed = builtins.match " *>=([0-9]+(\\.[0-9]+)*) +<([0-9]+(\\.[0-9]+)*) *" rootRange;
        in
        { inherit disagreeing rootRange parsed; };

      assertNodeSatisfiesEngines = pkgs:
        let
          inherit (nixpkgs) lib;
          inherit (nodeConsistency) disagreeing rootRange parsed;
          have = pkgs.nodejs.version;
        in
        if rootRange == null then
          throw ''
            flake.nix: package.json declares no engines.node.

            It is the source of truth for the Node major — DO App Platform's
            buildpack selects the runtime from it, and the notis CI job derives
            its version from it. Restore it, or remove this check deliberately.
          ''
        else if disagreeing != [ ] then
          throw ''
            flake.nix: engines.node disagrees across workspaces.

            package.json declares "${rootRange}", but:
            ${lib.concatMapStringsSep "\n" (r: "  ${r.manifest} declares \"${r.range}\"") disagreeing}

            Workspaces share one lockfile and one Node runtime, so these cannot
            legitimately differ. Make them identical.
          ''
        else if parsed == null then
          throw ''
            flake.nix: cannot parse engines.node ("${rootRange}") from package.json.
            This check understands ranges shaped ">=X <Y". Update
            assertNodeSatisfiesEngines in flake.nix alongside the new range.
          ''
        else if !(lib.versionAtLeast have (builtins.elemAt parsed 0))
             || !(lib.versionOlder have (builtins.elemAt parsed 2)) then
          throw ''
            flake.nix: nixpkgs provides Node ${have}, which does not satisfy
            engines.node ("${rootRange}") in package.json.

            The buildpack picks production's runtime from engines.node, so a
            mismatch means CI and previews test a runtime production does not use.
            Fix by moving the nixpkgs input, or by changing engines.node if the
            supported range genuinely changed.
          ''
        else pkgs;

      forAllSystems =
        f: nixpkgs.lib.genAttrs systems (system:
          let
            prismaPkgs = import nixpkgs-pinned { inherit system; };
          in
          f system
            (assertNodeSatisfiesEngines (import nixpkgs {
              inherit system;
              overlays = [ (prismaOverlay prismaPkgs) ];
            }))
            (import nixpkgs-unstable {
              inherit system;
              config.allowUnfreePredicate = pkg:
                builtins.elem (nixpkgs-unstable.lib.getName pkg) [ "ngrok" ];
            }));

      # Shared PostGIS 3.3.5 builder - used by dev packages and preview module
      # This ensures both use the same locked version matching production
      # `pkgs` supplies only the system: the Postgres stack itself comes from
      # nixpkgs-pinned, so callers get the same build whatever channel they are
      # on. See the nixpkgs-pinned comment above for why it cannot follow the
      # channel.
      pinnedFor = pkgs: import nixpkgs-pinned {
        inherit (pkgs.stdenv.hostPlatform) system;
      };

      mkPostgis335 = pkgs:
        let pinned = pinnedFor pkgs; in
        pinned.postgresql_16.pkgs.postgis.overrideAttrs (old: rec {
          version = "3.3.5";
          src = pinned.fetchurl {
            url = "https://download.osgeo.org/postgis/source/postgis-${version}.tar.gz";
            sha256 = "sha256-1w73FkGIHCIr55r32pbdpDI8T1+TWewbnBCFU53YQX8=";
          };
          doCheck = false;
        });

      mkPostgresCompat = pkgs:
        (pinnedFor pkgs).postgresql_16.withPackages (_: [ (mkPostgis335 pkgs) ]);

      # Shared Prisma environment setup (used by devShell, builds, and preview module)
      # Returns a string of export statements for shell scripts
      mkPrismaEnv = pkgs: ''
        export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines}/lib/libquery_engine.node"
        export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
        export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
        export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"
      '';

      # Shared OpenSSL environment setup (used by devShell and preview module)
      mkOpenSslEnv = pkgs: ''
        export OPENSSL_DIR="${pkgs.openssl.dev}"
        export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
        export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
      '';

      # Shell function that prints which database a postgres URL points at,
      # with a loud REMOTE marker for non-local hosts. Shared by the dev shell
      # banner and the oc-dev startup announcement. Any 127.0.0.1/localhost
      # host counts as local regardless of port (note: SSH-tunneled remote DBs
      # surface on localhost and therefore display as local).
      dbDisplayFn = ''
        print_db_line() {
          if [ -z "''${1:-}" ]; then
            echo "DB:     not set (DATABASE_URL missing from .env)"
            return
          fi
          db_line_rest="''${1#*@}"               # strip scheme://user:pass@
          db_line_rest="''${db_line_rest%%\?*}"  # strip ?params
          db_line_host="''${db_line_rest%%/*}"   # host:port
          db_line_name="''${db_line_rest#*/}"    # dbname
          case "$db_line_host" in
            127.0.0.1|127.0.0.1:*|localhost|localhost:*)
              echo "DB:     $db_line_name @ $db_line_host (local)" ;;
            *)
              echo -e "DB:     \033[1;33m$db_line_name @ $db_line_host (REMOTE)\033[0m" ;;
          esac
        }
      '';

      # Toolchain for anything that runs Prisma: the node stack plus the
      # `openssl` binary Prisma's platform detection shells out to (without it,
      # Prisma "defaults to openssl-1.1.x" and picks wrong engine variants).
      # Spliced into the devShell and every runner script that touches Prisma,
      # so their environments can't drift.
      mkPrismaToolchain = pkgs: with pkgs; [
        nodejs
        prisma
        openssl
      ];

      # Runtime env parity with the dev shell for running the app/Prisma
      # outside it (runner scripts, agents, CI): Prisma engine paths (important
      # on NixOS), OpenSSL build hints, and libuuid for native deps like
      # `canvas`. The shellHook uses this too, so shell and `nix run`
      # environments stay in lockstep.
      mkAppRuntimeEnv = pkgs: ''
        ${mkPrismaEnv pkgs}
        ${mkOpenSslEnv pkgs}
        ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''
          export LD_LIBRARY_PATH="${pkgs.util-linux.lib}/lib:''${LD_LIBRARY_PATH:-}"
        ''}
      '';

      # Shared npm deps (used by opencouncil-prod and CI checks).
      # importNpmLock fetches each package using the integrity hashes already
      # in package-lock.json, so there is no aggregate npmDepsHash to keep in
      # sync when the lockfile changes (e.g. dependabot bumps). Consumers must
      # pair this with importNpmLock.npmConfigHook.
      # @posthog/cli ships a bundled npm-shrinkwrap.json ("hasShrinkwrap": true). In the
      # no-network Nix sandbox npm honours that bundled shrinkwrap and requests @posthog/cli's
      # own deps (detect-libc) by their registry URL — but importNpmLock only rewrote the
      # TOP-LEVEL lock to local file:// paths, so the offline (only-if-cached) request misses the
      # cache → ENOTCACHED. Dropping the lockfile flag isn't enough (npm reads the shrinkwrap FILE
      # inside the extracted tarball), so swap in a repacked tarball with npm-shrinkwrap.json
      # removed via importNpmLock's packageSourceOverrides; npm then resolves @posthog/cli's deps
      # from the top-level lock, which is already offline.
      mkNpmDeps = pkgs:
        let
          origLock = pkgs.lib.importJSON ./package-lock.json;
          cliPath = "node_modules/@posthog/cli";
          cliEntry = origLock.packages.${cliPath};
          # the repacked tarball has different bytes than the lock's integrity, so npm ci would
          # fail EINTEGRITY against it — drop the pinned integrity (this removal is required). The
          # shrinkwrap / install-script flags then no longer describe the tarball, so drop them
          # too for consistency (not required for the build, just keeps the lock honest).
          patchedLock = origLock // {
            packages = origLock.packages // {
              ${cliPath} = builtins.removeAttrs cliEntry
                [ "integrity" "hasShrinkwrap" "hasInstallScript" ];
            };
          };
          # url + integrity come straight from the lockfile, so a dependabot bump of
          # @posthog/cli is picked up automatically (no hardcoded version/hash to sync).
          posthogCliPatched = pkgs.runCommand "posthog-cli-${cliEntry.version}-patched.tgz" {
            src = pkgs.fetchurl {
              url = cliEntry.resolved;
              hash = cliEntry.integrity;
            };
            nativeBuildInputs = [ pkgs.jq ];
          } ''
            mkdir unpack && tar -xzf "$src" -C unpack
            # (1) remove the bundled shrinkwrap that breaks offline resolution, and
            # (2) drop the postinstall that downloads a prebuilt binary from GitHub. This is
            #     load-bearing, not just tidiness: importNpmLock's npmConfigHook runs `npm rebuild`
            #     after the `--ignore-scripts` install, and rebuild DOES execute the script — with
            #     no network in the sandbox it fails (getaddrinfo EAI_AGAIN github.com). Dropping it
            #     is also safe: the binary only backs the CLI's source-map upload, which is
            #     env-gated off in Nix builds anyway.
            rm -f unpack/package/npm-shrinkwrap.json
            jq 'del(.scripts.postinstall)' unpack/package/package.json > unpack/package/package.json.tmp
            mv unpack/package/package.json.tmp unpack/package/package.json
            tar -czf "$out" -C unpack package
          '';
        in pkgs.importNpmLock {
          npmRoot = ./.;
          packageLock = patchedLock;
          packageSourceOverrides.${cliPath} = posthogCliPatched;
        };

      mkNpmBuildInputs = pkgs: with pkgs; [
        cairo pango libjpeg giflib pixman libpng glib librsvg
      ];
      mkNpmNativeBuildInputs = pkgs: with pkgs; [
        nodejs prisma prisma-engines openssl pkg-config python3
        cairo pango libjpeg giflib librsvg pixman libpng glib
      ] ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.util-linux ]);
    in {
      # Export shared builders for use by nixosModules
      lib = { inherit mkPostgis335 mkPostgresCompat mkPrismaEnv mkOpenSslEnv mkPrismaToolchain mkAppRuntimeEnv; };
      devShells = forAllSystems (_system: pkgs: _pkgs-unstable: {
        default = pkgs.mkShell {
          buildInputs =
            (mkPrismaToolchain pkgs)
            ++ (with pkgs; [
              pkg-config
              prisma-engines
              process-compose
              gh             # GitHub CLI for PR/issue management
              postgresql_16  # Provides psql CLI for interactive DB access
              rclone         # S3 client for the test-backup skill (fetch dumps from DO Spaces)
            ])
            ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
              # Provides libuuid.so.1, required by native deps like `canvas`.
              pkgs.util-linux
            ]);

          shellHook = ''
            echo "Prisma engines path: ${pkgs.prisma-engines}"

            # Prisma engines, OpenSSL hints, libuuid — shared with the flake's
            # runner scripts (oc-dev etc.) so shell and `nix run` can't drift.
            ${mkAppRuntimeEnv pkgs}
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig"

            # Load .env if present to get DATABASE_URL
            if [ -f .env ]; then
              set -a
              . .env
              set +a
            fi

            # Create PSQL_URL by stripping query params from DATABASE_URL (psql doesn't need them)
            if [ -n "''${DATABASE_URL:-}" ]; then
              export PSQL_URL="''${DATABASE_URL%%\?*}"
            fi

            echo ""
            echo "Inside OpenCouncil Nix dev shell"

            # Show which database .env is pointing at
            ${dbDisplayFn}
            print_db_line "''${DATABASE_URL:-}"

            echo ""
            echo "Next steps:"
            echo "  - Start app + local DB (default): nix run .#dev"
            echo "  - Start app + remote DB (from .env): nix run .#dev -- --db=remote"
            echo "  - Prisma Studio (uses DATABASE_URL from .env): nix run .#studio"
            echo "  - Reset local DB and build cache: nix run .#cleanup"
            echo "  - View logs: tail -200 .data/process-compose/app.log .data/process-compose/db.log"
            echo "  - Run psql: psql \"\$PSQL_URL\""
            echo ""
            echo "For full docs: docs/nix-usage.md"
          '';
        };
      });

      packages = forAllSystems (_system: pkgs: pkgs-unstable:
        let
          # Default postgres - uses nixpkgs PostGIS (fast, pre-built from binary cache)
          postgres = pkgs.postgresql_16.withPackages (ps: [ ps.postgis ]);

          # PostGIS 3.3.5 pinned to match production database version (default).
          # This ensures Prisma migrations work correctly (shadow database needs same version).
          # Use `--fast` flag to skip building from source and use pre-built binary cache.
          # Uses shared builder from flake lib to avoid duplication with nixosModules.
          postgresCompat = mkPostgresCompat pkgs;

          # Shared script for starting PostgreSQL with PostGIS
          dbNixScript = ''
            set -euo pipefail

            repo_root="$(pwd)"
            data_dir="''${OC_DB_DATA_DIR:-$repo_root/.data/postgres}"
            port="''${OC_DB_PORT:-5432}"
            # NOTE: In Nix-local DB mode, do NOT default to DATABASE_USER/NAME from .env.
            # .env is commonly configured for a remote DB (e.g. user 'postgres'), and using it
            # here can break a previously-initialized local cluster.
            db_user="''${OC_DB_USER:-opencouncil}"
            db_name="''${OC_DB_NAME:-opencouncil}"

            mkdir -p "$data_dir"

            if [ ! -f "$data_dir/PG_VERSION" ]; then
              # If initdb was interrupted previously, avoid cryptic initdb errors.
              if [ -n "$(find "$data_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
                cat >&2 <<EOF
Detected a non-empty Postgres data dir without PG_VERSION:
  $data_dir

To fix:
  - Delete it to re-init: rm -rf "$data_dir"
  - Or point to a fresh dir: OC_DB_DATA_DIR=... nix run .#dev
EOF
                exit 2
              fi
              initdb -D "$data_dir" --username="$db_user" --auth=trust
            fi

            # Use a short socket path under /tmp to avoid the 107-byte Unix socket limit
            # (long repo paths like worktrees easily exceed it).
            socket_dir="/tmp/oc-pg-$(echo "$data_dir" | md5sum | cut -c1-8)"
            mkdir -p "$socket_dir"

            # Logical replication settings (required for PGSync testing)
            # - wal_level=logical: enables logical decoding for CDC tools like PGSync
            # - max_replication_slots: allows creating replication slots
            # - max_wal_senders: allows replication connections
            # - listen_addresses=0.0.0.0: allows Docker containers to connect to host DB
            #
            # shellcheck disable=SC2086
            pg_ctl_opts="-c port=$port -c listen_addresses=0.0.0.0 -c unix_socket_directories=$socket_dir -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4"

            # Ensure the expected DB exists (handles cases where cluster exists but DB creation
            # was interrupted in a previous run).
            # shellcheck disable=SC2086
            pg_ctl -D "$data_dir" -o "$pg_ctl_opts" -w start
            # IMPORTANT: createdb connects to a "maintenance DB"; by default this can be the
            # username (which may not exist yet). template1 is always present.
            createdb -h 127.0.0.1 -p "$port" -U "$db_user" --maintenance-db=template1 "$db_name" >/dev/null 2>&1 || true
            pg_ctl -D "$data_dir" -m fast -w stop

            # shellcheck disable=SC2086
            exec postgres -D "$data_dir" \
              -c "port=$port" \
              -c "listen_addresses=0.0.0.0" \
              -c "unix_socket_directories=$socket_dir" \
              -c "wal_level=logical" \
              -c "max_replication_slots=4" \
              -c "max_wal_senders=4"
          '';

          oc-dev-db-nix = pkgs.writeShellApplication {
            name = "oc-dev-db-nix";
            runtimeInputs = with pkgs; [
              coreutils
              postgres
            ];
            text = dbNixScript;
          };

          # Locked version with PostGIS 3.3.5 (matches production)
          oc-dev-db-nix-locked = pkgs.writeShellApplication {
            name = "oc-dev-db-nix-locked";
            runtimeInputs = with pkgs; [
              coreutils
              postgresCompat
            ];
            text = dbNixScript;
          };

          # Shared port utilities used by oc-dev and oc-studio
          oc-port-utils = pkgs.writeShellScriptBin "oc-port-utils" ''
            is_port_in_use() {
              local port="$1"
              # Prefer ss (reliable on Linux, available in our runtimeInputs)
              if command -v ss >/dev/null 2>&1; then
                ss -ltn | grep -q ":$port " >/dev/null 2>&1
                return $?
              fi
              # Cross-platform fallback: lsof
              if command -v lsof >/dev/null 2>&1; then
                lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
                return $?
              fi
              # Fallback: bash tcp check (may not be available in all shells)
              (echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
            }

            find_available_port() {
              local base_port="$1"
              local max_attempts="''${2:-30}"
              local port="$base_port"
              local i
              for ((i=0; i<max_attempts; i++)); do
                if ! is_port_in_use "$port"; then
                  echo "$port"
                  return 0
                fi
                port=$((port + 1))
              done
              echo "$base_port"
              return 1
            }
          '';

          dockerCli = if pkgs ? docker-client then pkgs.docker-client else pkgs.docker;

          oc-dev-db-docker = pkgs.writeShellApplication {
            name = "oc-dev-db-docker";
            runtimeInputs = with pkgs; [
              coreutils
              dockerCli
            ];
            text = ''
              set -euo pipefail

              repo_root="$(pwd)"
              port="''${OC_DB_PORT:-''${DB_PORT:-5432}}"
              db_user="''${OC_DB_USER:-opencouncil}"
              db_name="''${OC_DB_NAME:-opencouncil}"
              db_password="''${OC_DB_PASSWORD:-opencouncil}"

              cd "$repo_root"

              # Ensure db service (profile 'with-db') starts. This requires a working docker daemon.
              DB_PORT="$port" \
              DATABASE_USER="$db_user" \
              DATABASE_NAME="$db_name" \
              DATABASE_PASSWORD="$db_password" \
              docker compose --profile with-db up db
            '';
          };

          oc-dev-cache = pkgs.writeShellApplication {
            name = "oc-dev-cache";
            runtimeInputs = [
              pkgs.coreutils
              # Skip valkey's test suite: our nixpkgs pin isn't binary-cached, and
              # the from-source build fails on a flaky replication test
              # (dual-channel-replication.tcl) unrelated to our single-node dev use.
              (pkgs.valkey.overrideAttrs (_: { doCheck = false; }))
            ];
            text = ''
              set -euo pipefail

              repo_root="$(pwd)"
              data_dir="''${OC_CACHE_DATA_DIR:-$repo_root/.data/valkey}"
              port="''${OC_CACHE_PORT:-6379}"

              mkdir -p "$data_dir"

              exec valkey-server \
                --port "$port" \
                --dir "$data_dir" \
                --save "60 1" \
                --loglevel warning \
                --daemonize no
            '';
          };

          oc-dev-app-local = pkgs.writeShellApplication {
            name = "oc-dev-app-local";
            runtimeInputs = (mkPrismaToolchain pkgs) ++ [
              pkgs.coreutils
              postgres
            ];
            text = ''
              set -euo pipefail

              repo_root="$(pwd)"
              port="''${OC_DB_PORT:-5432}"
              app_port="''${OC_APP_PORT:-''${APP_PORT:-3000}}"
              # For local DB modes, avoid defaulting to .env remote DB credentials.
              db_user="''${OC_DB_USER:-opencouncil}"
              db_name="''${OC_DB_NAME:-opencouncil}"
              db_password="''${OC_DB_PASSWORD:-opencouncil}"

              if [ -n "$db_password" ]; then
                export PGPASSWORD="$db_password"
              fi

              until pg_isready -h 127.0.0.1 -p "$port" -U "$db_user" -d "$db_name" >/dev/null 2>&1; do
                sleep 0.2
              done

              # In fast mode (--fast), pre-create PostGIS without a version so it uses whatever is available.
              # This allows migrations with version-specific CREATE EXTENSION to be skipped (IF NOT EXISTS).
              # In default mode (PostGIS 3.3.5), let migrations create the exact version.
              if [ "''${OC_POSTGIS_LOCKED:-1}" != "1" ]; then
                psql "postgresql://$db_user@127.0.0.1:$port/$db_name?sslmode=disable" \
                  -v ON_ERROR_STOP=1 \
                  -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null
              fi

              # Apply migrations, generate Prisma client, and seed.
              (cd "$repo_root" && npm run db:deploy:seed)

              cd "$repo_root"
              export APP_PORT="$app_port"
              if [ "''${OC_LAN:-1}" = "1" ]; then
                lan_flag="-H 0.0.0.0"
              else
                lan_flag="-H 127.0.0.1"
              fi
              # shellcheck disable=SC2086
              exec npm run dev -- -p "$app_port" $lan_flag
            '';
          };

          oc-studio = pkgs.writeShellApplication {
            name = "oc-studio";
            runtimeInputs = (mkPrismaToolchain pkgs) ++ [
              oc-port-utils
              pkgs.coreutils
              pkgs.lsof
            ] ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.iproute2
            ]);
            text = ''
              set -euo pipefail

              # Environment parity with the dev shell, so `nix run .#studio`
              # works outside it too.
              ${mkAppRuntimeEnv pkgs}

              # shellcheck source=/dev/null
              source "${oc-port-utils}/bin/oc-port-utils"

              usage() {
                cat <<'USAGE'
Usage:
  nix run .#studio -- [--db-url URL] [--port PORT]

Runs Prisma Studio to inspect a database.

Options:
  --db-url URL    Database URL (defaults to DATABASE_URL from .env)
  --port PORT     Port for Prisma Studio (default: auto-select from 5555)

Examples:
  nix run .#studio                           # Use DATABASE_URL from .env
  nix run .#studio -- --db-url "postgresql://user:pass@host:5432/db"
  nix run .#studio -- --port 5556
USAGE
              }

              repo_root="$(pwd)"
              db_url=""
              studio_port=""

              for arg in "$@"; do
                case "$arg" in
                  --db-url=*) db_url="''${arg#--db-url=}" ;;
                  --port=*) studio_port="''${arg#--port=}" ;;
                  --help|-h) usage; exit 0 ;;
                  *)
                    echo "Unknown argument: $arg" >&2
                    usage
                    exit 2
                    ;;
                esac
              done

              # Load .env if present and no explicit db_url provided
              if [ -z "$db_url" ] && [ -f "$repo_root/.env" ]; then
                set -a
                # shellcheck source=/dev/null
                . "$repo_root/.env"
                set +a
                db_url="''${DATABASE_URL:-}"
              fi

              if [ -z "$db_url" ]; then
                echo "Error: No database URL provided." >&2
                echo "Either set DATABASE_URL in .env or use --db-url=..." >&2
                exit 2
              fi

              if [ -z "$studio_port" ]; then
                studio_port="$(find_available_port 5555)"
              fi

              echo "Starting Prisma Studio on port $studio_port..."
              echo "Database: ''${db_url%%@*}@***" # Hide credentials in output

              cd "$repo_root"
              export DATABASE_URL="$db_url"
              exec npx prisma studio --port "$studio_port"
            '';
          };

          oc-cleanup = pkgs.writeShellApplication {
            name = "oc-cleanup";
            runtimeInputs = with pkgs; [
              coreutils
            ];
            text = ''
              set -euo pipefail

              repo_root="$(pwd)"
              if [ ! -f "$repo_root/package.json" ]; then
                echo "Run from the repo root (package.json not found)." >&2
                exit 2
              fi

              postgres_data="$repo_root/.data/postgres"
              next_build="$repo_root/.next"

              echo "This will remove:"
              if [ -d "$postgres_data" ]; then
                echo "  - Local database: $postgres_data"
              fi
              if [ -d "$next_build" ]; then
                echo "  - Next.js build cache: $next_build"
              fi

              if [ ! -d "$postgres_data" ] && [ ! -d "$next_build" ]; then
                echo "Nothing to clean up."
                exit 0
              fi

              echo ""
              read -r -p "Continue? [y/N] " response
              case "$response" in
                [yY][eE][sS]|[yY])
                  if [ -d "$postgres_data" ]; then
                    echo "Removing $postgres_data..."
                    rm -rf "$postgres_data"
                  fi
                  if [ -d "$next_build" ]; then
                    echo "Removing $next_build..."
                    rm -rf "$next_build"
                  fi
                  echo "Cleanup complete."
                  ;;
                *)
                  echo "Cleanup cancelled."
                  exit 1
                  ;;
              esac
            '';
          };

          oc-dev = pkgs.writeShellApplication {
            name = "oc-dev";
            runtimeInputs =
              # Toolchain on PATH here too: remote/external-mode app processes run
              # npm directly under process-compose and inherit this environment.
              (mkPrismaToolchain pkgs)
              ++ [
                oc-port-utils
                pkgs.coreutils
                pkgs.gnused
                pkgs.process-compose
                pkgs.lsof
                pkgs.curl
                pkgs-unstable.ngrok
                pkgs.jq
                oc-dev-db-nix
                oc-dev-db-nix-locked
                oc-dev-db-docker
                oc-dev-cache
                oc-dev-app-local
              ]
              ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
                pkgs.iproute2
              ]);
            text = ''
              set -euo pipefail

              # Environment parity with the dev shell's hook, so `nix run .#dev`
              # also works from a bare shell (agents, CI) without entering
              # `nix develop` first.
              ${mkAppRuntimeEnv pkgs}

              # Headless mode: when stdout isn't a terminal (agent- or CI-driven),
              # default PC_DISABLE_TUI=1 so process-compose streams plain logs
              # instead of drawing its TUI. An explicit PC_DISABLE_TUI wins.
              if [ ! -t 1 ] && [ -z "''${PC_DISABLE_TUI:-}" ]; then
                export PC_DISABLE_TUI=1
                echo "No TTY: disabling process-compose TUI (logs also tee to .data/process-compose/)"
              fi

              # shellcheck source=/dev/null
              source "${oc-port-utils}/bin/oc-port-utils"

              usage() {
                cat <<'USAGE'
Usage:
  nix run .#dev -- [--db=remote|external|nix|docker] [--db-url URL] [--direct-url URL] [--migrate] [--no-studio] [--locked] [--no-lan] [--preview-tasks=N] [--preview-db=N]

DB modes:
  --db=nix      Start Postgres+PostGIS via Nix + app (process-compose TUI) (default)
  --db=remote   Use DATABASE_URL/DIRECT_URL from .env
  --db=external Use explicit --db-url/--direct-url for app only
  --db=docker   Start Docker PostGIS + app (requires Docker)

Flags:
  --migrate        Run migrations (npm run db:deploy) before starting the app (remote/external only)
  --no-studio      Disable Prisma Studio process (enabled by default for local DB modes)
  --fast           Use pre-built PostGIS from binary cache (faster first build, but may not match production)
  --no-lan         Bind dev server to localhost only (default: binds to 0.0.0.0 for mobile preview)
  --cache            Start a local Valkey instance for shared cache testing (sets CACHE_URL automatically)
  --preview-tasks=N  Connect to opencouncil-tasks preview for PR #N (starts ngrok tunnel for callbacks)
  --preview-db=N     Connect to the database used by opencouncil preview PR #N (requires OC_PREVIEW_SSH)
USAGE
              }

              # Default to local DB (mirrors previous run.sh behavior).
              # Override via OC_DEV_DB_MODE=remote|external|nix|docker or --db=...
              db_mode="''${OC_DEV_DB_MODE:-nix}"
              db_url=""
              direct_url=""
              migrate="''${OC_DEV_MIGRATE:-0}"
              studio_override="''${OC_DEV_STUDIO:-}"
              studio_enabled=""
              postgis_locked="''${OC_POSTGIS_LOCKED:-1}"
              lan_enabled="''${OC_LAN:-1}"
              cache_enabled="''${OC_DEV_CACHE:-0}"
              tasks_preview_pr="''${OC_PREVIEW_TASKS:-}"
              preview_db_pr=""

              for arg in "$@"; do
                case "$arg" in
                  --db=*) db_mode="''${arg#--db=}" ;;
                  --db-url=*) db_url="''${arg#--db-url=}" ;;
                  --direct-url=*) direct_url="''${arg#--direct-url=}" ;;
                  --migrate) migrate="1" ;;
                  --no-studio) studio_override="0" ;;
                  --cache) cache_enabled="1" ;;
                  --fast) postgis_locked="0" ;;
                  --no-lan) lan_enabled="0" ;;
                  --preview-tasks=*) tasks_preview_pr="''${arg#--preview-tasks=}" ;;
                  --preview-db=*) preview_db_pr="''${arg#--preview-db=}" ;;
                  --help|-h) usage; exit 0 ;;
                  *)
                    echo "Unknown argument: $arg" >&2
                    usage
                    exit 2
                    ;;
                esac
              done

              # Select which DB command to use (default: PostGIS 3.3.5 matching production)
              if [ "$postgis_locked" = "1" ]; then
                oc_db_cmd="oc-dev-db-nix-locked"
              else
                oc_db_cmd="oc-dev-db-nix"
                echo "Using pre-built PostGIS from binary cache (--fast mode, may not match production)"
              fi

              repo_root="$(pwd)"
              if [ ! -f "$repo_root/package.json" ]; then
                echo "Run from the repo root (package.json not found)." >&2
                exit 2
              fi

              # Load .env so DB_USER/DB_NAME/DB_PASSWORD are available to the runner itself.
              # (process-compose also loads .env, but we need these values before generating config)
              if [ -f "$repo_root/.env" ]; then
                set -a
                # shellcheck source=/dev/null
                . "$repo_root/.env"
                set +a
              fi

              tmp_dir="$(mktemp -d)"
              trap 'rm -rf "$tmp_dir"' EXIT

              pc_file="$tmp_dir/process-compose.yaml"
              logs_dir="$repo_root/.data/process-compose"
              mkdir -p "$logs_dir"

              # App/studio ports (worktree-friendly, like run.sh).
              app_port="''${OC_APP_PORT:-''${APP_PORT:-}}"
              if [ -z "$app_port" ]; then
                app_port="$(find_available_port 3000)"
              fi

              # Canonical local DB credentials (used for both nix + docker local DB modes).
              # Do NOT default these from .env, because .env is commonly configured for remote DBs.
              local_db_user="''${OC_DB_USER:-opencouncil}"
              local_db_name="''${OC_DB_NAME:-opencouncil}"
              local_db_password="''${OC_DB_PASSWORD:-opencouncil}"

              # Studio enabled by default for local DB modes; optional elsewhere.
              case "$db_mode" in
                nix|docker) studio_enabled="1" ;;
                *) studio_enabled="0" ;;
              esac
              if [ -n "$studio_override" ]; then
                studio_enabled="$studio_override"
              fi

              studio_port="''${OC_PRISMA_STUDIO_PORT:-''${PRISMA_STUDIO_PORT:-}}"
              if [ "$studio_enabled" = "1" ] && [ -z "$studio_port" ]; then
                studio_port="$(find_available_port 5555)"
              fi

              cache_port="''${OC_CACHE_PORT:-}"
              if [ "$cache_enabled" = "1" ] && [ -z "$cache_port" ]; then
                cache_port="$(find_available_port 6379)"
              fi

              # Check task API health and optionally validate API key.
              # Usage: check_task_api <url> <strict>
              #   strict=1: exit on failure (for --preview-tasks)
              #   strict=0: warn on failure (for .env TASK_API_URL)
              check_task_api() {
                local url="$1" strict="$2"
                local health_json auth_ok

                # Health check (with auth header if TASK_API_KEY is set)
                health_json=$(curl -sf --connect-timeout 5 \
                  ''${TASK_API_KEY:+-H "Authorization: Bearer $TASK_API_KEY"} \
                  "$url/health" 2>/dev/null) || {
                  if [ "$strict" = "1" ]; then
                    echo "  ✗ Not reachable at $url" >&2
                    exit 1
                  else
                    echo "   ⚠ Task server not reachable (start it separately for E2E testing)"
                    return 1
                  fi
                }
                echo "   ✓ Task server is reachable"

                # Validate API key if one was sent
                if [ -n "''${TASK_API_KEY:-}" ]; then
                  auth_ok=$(echo "$health_json" | jq -r '.authenticated' 2>/dev/null || true)
                  if [ "$auth_ok" = "true" ]; then
                    echo "   ✓ API key accepted"
                  elif [ "$auth_ok" = "false" ]; then
                    if [ "$strict" = "1" ]; then
                      echo "  ✗ TASK_API_KEY is not valid for this server." >&2
                      echo "  Check the token in your .env matches the server." >&2
                      exit 1
                    else
                      echo "   ⚠ TASK_API_KEY is not valid for this server"
                    fi
                  fi
                fi
              }

              # --preview-tasks: connect to a remote tasks preview and start ngrok for callbacks
              ngrok_pid=""
              if [ -n "$tasks_preview_pr" ]; then
                tasks_preview_url="https://pr-''${tasks_preview_pr}.tasks.opencouncil.gr"
                export TASK_API_URL="$tasks_preview_url"
                if [ -z "''${TASK_API_KEY:-}" ]; then
                  echo "  ✗ TASK_API_KEY is not set. Set it in .env or export it." >&2
                  echo "  The tasks preview server requires a valid API token." >&2
                  exit 1
                fi

                echo "🔗 Connecting to tasks preview PR #$tasks_preview_pr..."
                check_task_api "$tasks_preview_url" 1

                # Start ngrok tunnel so the remote tasks server can POST callbacks to localhost
                echo "  Starting ngrok tunnel for localhost:$app_port..."
                ngrok http "$app_port" --log=stdout > "$logs_dir/ngrok.log" 2>&1 &
                ngrok_pid=$!

                # Wait for ngrok to assign a public URL
                ngrok_url=""
                for _i in $(seq 1 30); do
                  ngrok_url=$(curl -sf http://localhost:4040/api/tunnels 2>/dev/null \
                    | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null || true)
                  if [ -n "$ngrok_url" ] && [ "$ngrok_url" != "null" ]; then
                    break
                  fi
                  sleep 0.5
                done

                if [ -z "$ngrok_url" ] || [ "$ngrok_url" = "null" ]; then
                  echo "  ✗ Failed to start ngrok tunnel." >&2
                  echo "  Check $logs_dir/ngrok.log" >&2
                  echo "  If first run: ngrok config add-authtoken <TOKEN>" >&2
                  kill "$ngrok_pid" 2>/dev/null || true
                  exit 1
                fi

                export NEXTAUTH_URL="$ngrok_url"
                echo "  ✓ Tunnel active: $ngrok_url → localhost:$app_port"
                echo ""
                echo "  Tasks API:  $tasks_preview_url"
                echo "  Callbacks:  $ngrok_url"
                echo "  Ngrok logs: $logs_dir/ngrok.log"
                echo ""
              fi

              # --preview-db=N: connect to the database used by opencouncil preview PR #N
              ssh_tunnel_pid=""
              if [ -n "$preview_db_pr" ]; then
                if [ -z "''${OC_PREVIEW_SSH:-}" ]; then
                  echo "  ✗ OC_PREVIEW_SSH is not set." >&2
                  echo "  Set it to the SSH target for the preview server:" >&2
                  echo "    export OC_PREVIEW_SSH=root@159.89.98.26" >&2
                  echo "  Or add to .env: OC_PREVIEW_SSH=root@159.89.98.26" >&2
                  exit 1
                fi

                echo "🗄️  Connecting to preview database for PR #$preview_db_pr..."

                # Validate SSH connectivity
                if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$OC_PREVIEW_SSH" true 2>/dev/null; then
                  echo "  ✗ Cannot connect to $OC_PREVIEW_SSH" >&2
                  echo "  Check that your SSH key is in the server's authorized_keys" >&2
                  exit 1
                fi
                echo "   ✓ SSH connection OK"

                # Detect DB type: isolated (has .has-local-db marker) vs shared staging
                preview_base_dir="/var/lib/opencouncil-previews"
                # shellcheck disable=SC2029 # Intentional: expand variables locally before sending to server
                if ssh "$OC_PREVIEW_SSH" "test -f $preview_base_dir/pr-$preview_db_pr/.has-local-db" 2>/dev/null; then
                  # Isolated DB: tunnel to the per-PR postgres
                  preview_db_port=$((5432 + preview_db_pr))

                  # Verify the DB service is running
                  # shellcheck disable=SC2029
                  if ! ssh "$OC_PREVIEW_SSH" "systemctl is-active opencouncil-preview-db@$preview_db_pr" >/dev/null 2>&1; then
                    echo "  ✗ Isolated database service is not running on the server." >&2
                    echo "  Start it with: ssh $OC_PREVIEW_SSH systemctl start opencouncil-preview-db@$preview_db_pr" >&2
                    exit 1
                  fi

                  echo "   ✓ Isolated database detected (port $preview_db_port)"

                  # Check port is free before opening tunnel
                  if is_port_in_use "$preview_db_port"; then
                    echo "  ✗ Local port $preview_db_port is already in use." >&2
                    echo "  Kill the existing process (e.g., a leftover SSH tunnel) and retry." >&2
                    exit 1
                  fi

                  # Open SSH tunnel in background
                  ssh -N -L "$preview_db_port:127.0.0.1:$preview_db_port" "$OC_PREVIEW_SSH" &
                  ssh_tunnel_pid=$!

                  # Wait for tunnel to bind the local port
                  for _i in $(seq 1 10); do
                    if is_port_in_use "$preview_db_port"; then
                      break
                    fi
                    sleep 0.5
                  done
                  if ! is_port_in_use "$preview_db_port"; then
                    echo "  ✗ SSH tunnel failed to bind port $preview_db_port." >&2
                    kill "$ssh_tunnel_pid" 2>/dev/null || true
                    exit 1
                  fi

                  echo "   ✓ SSH tunnel active: localhost:$preview_db_port → 127.0.0.1:$preview_db_port"

                  db_url="postgresql://opencouncil@localhost:$preview_db_port/opencouncil"
                  direct_url="$db_url"
                  echo "   Database: $db_url"
                else
                  # Shared staging DB: read DATABASE_URL from server's .env
                  echo "   ✓ Shared staging database detected"
                  # shellcheck disable=SC2029
                  preview_db_url=$(ssh "$OC_PREVIEW_SSH" "grep '^DATABASE_URL=' $preview_base_dir/.env 2>/dev/null | head -1 | cut -d= -f2-")
                  if [ -z "$preview_db_url" ]; then
                    echo "  ✗ Could not read DATABASE_URL from $preview_base_dir/.env on server." >&2
                    exit 1
                  fi

                  db_url="$preview_db_url"
                  direct_url="$preview_db_url"
                  # Mask credentials in output
                  echo "   Database: ''${preview_db_url%%@*}@***"
                fi

                echo ""
                # Force external DB mode (skip local postgres)
                db_mode="external"
              fi

              # Check if TASK_API_URL is configured and reachable (non-blocking warning)
              if [ -z "$tasks_preview_pr" ] && [ -n "''${TASK_API_URL:-}" ]; then
                echo "🔗 Task API configured: $TASK_API_URL"
                check_task_api "$TASK_API_URL" 0 || true
                echo ""
              fi

              # Compute LAN host flag for Next.js dev server
              if [ "$lan_enabled" = "1" ]; then
                lan_host_flag="-H 0.0.0.0"
              else
                lan_host_flag="-H 127.0.0.1"
              fi

              # NEXTAUTH_URL must match the actual app port so callback URLs are correct.
              # --preview-tasks already sets NEXTAUTH_URL to the ngrok tunnel URL above;
              # for all other modes, derive it from the resolved app port.
              if [ -z "$ngrok_pid" ]; then
                nextauth_url="http://localhost:$app_port"
              else
                nextauth_url="$NEXTAUTH_URL"
              fi

              case "$db_mode" in
                remote)
                  cat >"$pc_file" <<EOF
version: "0.5"
processes:
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; export APP_PORT=\"$app_port\"; export NEXTAUTH_URL=\"$nextauth_url\"; if [ \"$migrate\" = \"1\" ]; then npm run db:deploy; fi; npm run dev -- -p \"$app_port\" $lan_host_flag 2>&1 | tee -a \"$logs_dir/app.log\"'"
EOF
                  if [ "$studio_enabled" = "1" ]; then
                    cat >>"$pc_file" <<EOF
  studio:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; npx prisma studio --port \"$studio_port\" --browser none 2>&1 | tee -a \"$logs_dir/studio.log\"'"
EOF
                  fi
                  ;;
                external)
                  if [ -z "$db_url" ] || [ -z "$direct_url" ]; then
                    echo "--db=external requires --db-url=... and --direct-url=..." >&2
                    exit 2
                  fi
                  cat >"$pc_file" <<EOF
version: "0.5"
processes:
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; export APP_PORT=\"$app_port\"; export NEXTAUTH_URL=\"$nextauth_url\"; export DATABASE_URL=\"$db_url\"; export DIRECT_URL=\"$direct_url\"; if [ \"$migrate\" = \"1\" ]; then npm run db:deploy; fi; npm run dev -- -p \"$app_port\" $lan_host_flag 2>&1 | tee -a \"$logs_dir/app.log\"'"
EOF
                  if [ "$studio_enabled" = "1" ]; then
                    cat >>"$pc_file" <<EOF
  studio:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url\" DIRECT_URL=\"$direct_url\" npx prisma studio --port \"$studio_port\" --browser none 2>&1 | tee -a \"$logs_dir/studio.log\"'"
EOF
                  fi
                  ;;
                nix)
                  db_port="''${OC_DB_PORT:-}"
                  if [ -z "$db_port" ]; then
                    db_port="$(find_available_port 5432)"
                  fi
                  # In Nix-local DB mode, don't inherit remote .env creds by default.
                  db_user="$local_db_user"
                  db_name="$local_db_name"
                  db_password="$local_db_password"
                  data_dir="''${OC_DB_DATA_DIR:-$repo_root/.data/postgres}"
                  if [ -n "$db_password" ]; then
                    db_auth="$db_user:$db_password"
                  else
                    db_auth="$db_user"
                  fi
                  db_url_local="postgresql://$db_auth@127.0.0.1:$db_port/$db_name?sslmode=disable"
                  cat >"$pc_file" <<EOF
version: "0.5"
processes:
  db:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; OC_DB_DATA_DIR=\"$data_dir\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" $oc_db_cmd 2>&1 | tee -a \"$logs_dir/db.log\"'"
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" NEXTAUTH_URL=\"$nextauth_url\" OC_APP_PORT=\"$app_port\" APP_PORT=\"$app_port\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" OC_DB_PASSWORD=\"$db_password\" OC_LAN=\"$lan_enabled\" oc-dev-app-local 2>&1 | tee -a \"$logs_dir/app.log\"'"
EOF
                  if [ "$studio_enabled" = "1" ]; then
                    cat >>"$pc_file" <<EOF
  studio:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" npx prisma studio --port \"$studio_port\" --browser none 2>&1 | tee -a \"$logs_dir/studio.log\"'"
EOF
                  fi
                  ;;
                docker)
                  db_port="''${OC_DB_PORT:-}"
                  if [ -z "$db_port" ]; then
                    db_port="$(find_available_port 5432)"
                  fi
                  db_user="$local_db_user"
                  db_name="$local_db_name"
                  db_password="$local_db_password"
                  if [ -n "$db_password" ]; then
                    db_auth="$db_user:$db_password"
                  else
                    db_auth="$db_user"
                  fi
                  db_url_local="postgresql://$db_auth@127.0.0.1:$db_port/$db_name?sslmode=disable"
                  cat >"$pc_file" <<EOF
version: "0.5"
processes:
  db:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; OC_DB_PORT=\"$db_port\" oc-dev-db-docker 2>&1 | tee -a \"$logs_dir/db.log\"'"
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" NEXTAUTH_URL=\"$nextauth_url\" OC_APP_PORT=\"$app_port\" APP_PORT=\"$app_port\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" OC_DB_PASSWORD=\"$db_password\" OC_LAN=\"$lan_enabled\" oc-dev-app-local 2>&1 | tee -a \"$logs_dir/app.log\"'"
EOF
                  if [ "$studio_enabled" = "1" ]; then
                    cat >>"$pc_file" <<EOF
  studio:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" npx prisma studio --port \"$studio_port\" --browser none 2>&1 | tee -a \"$logs_dir/studio.log\"'"
EOF
                  fi
                  ;;
                *)
                  echo "Unknown --db mode: $db_mode" >&2
                  usage
                  exit 2
                  ;;
              esac

              # Append Valkey cache process when --cache is enabled
              if [ "$cache_enabled" = "1" ]; then
                cache_url="redis://127.0.0.1:$cache_port"
                export CACHE_URL="$cache_url"
                cat >>"$pc_file" <<EOF
  cache:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; OC_CACHE_PORT=\"$cache_port\" oc-dev-cache 2>&1 | tee -a \"$logs_dir/cache.log\"'"
EOF
                echo "Cache: Valkey on port $cache_port (CACHE_URL=$cache_url)"
              fi

              pc_port="$(find_available_port 8080)"

              # Determine if we need cleanup on exit (firewall rule and/or ngrok).
              # When cleanup is needed we run process-compose without exec so the
              # trap fires after it exits. Otherwise we exec for a cleaner process tree.
              needs_cleanup=false
              cleanup_cmds=""

              # On Linux with --lan, open the firewall port automatically.
              if [ "$lan_enabled" = "1" ] && command -v iptables >/dev/null 2>&1 \
                && ! sudo -n iptables -C INPUT -p tcp --dport "$app_port" -j ACCEPT 2>/dev/null; then
                if [ -t 0 ]; then
                  echo ""
                  echo "Opening firewall port $app_port so your phone can reach the dev server."
                  echo "(sudo is needed to add a temporary iptables rule — it will be removed on exit)"
                  echo ""
                  sudo iptables -I INPUT -p tcp --dport "$app_port" -j ACCEPT
                  echo "Opened firewall port $app_port for LAN access"
                  needs_cleanup=true
                  cleanup_cmds="sudo iptables -D INPUT -p tcp --dport \"$app_port\" -j ACCEPT 2>/dev/null; echo \"Closed firewall port $app_port\";"
                else
                  # sudo would prompt for a password, which needs a terminal.
                  echo "No TTY for sudo: skipping firewall opening for LAN access (open port $app_port manually, or use --no-lan)"
                fi
              fi

              # If ngrok is running, ensure it gets cleaned up on exit.
              if [ -n "$ngrok_pid" ]; then
                needs_cleanup=true
                cleanup_cmds="''${cleanup_cmds}kill $ngrok_pid 2>/dev/null || true; echo \"Stopped ngrok tunnel\";"
              fi

              # If SSH tunnel is running, ensure it gets cleaned up on exit.
              if [ -n "$ssh_tunnel_pid" ]; then
                needs_cleanup=true
                cleanup_cmds="''${cleanup_cmds}kill $ssh_tunnel_pid 2>/dev/null || true; echo \"Stopped SSH tunnel\";"
              fi

              # Announce endpoints and logs up front: in headless mode this is the
              # machine-readable contract (agents parse ports from here), and the
              # attach hint lets a human bring up the TUI for a headless instance.
              # The DB line shows the database the app will actually use (the
              # local one in nix/docker modes, whatever .env or --db-url says
              # otherwise), matching the dev shell banner.
              ${dbDisplayFn}
              echo ""
              echo "App:    http://localhost:$app_port  (log: .data/process-compose/app.log)"
              if [ "$studio_enabled" = "1" ]; then
                echo "Studio: http://localhost:$studio_port  (log: .data/process-compose/studio.log)"
              fi
              case "$db_mode" in
                nix|docker) print_db_line "$db_url_local" ;;
                external)   print_db_line "$db_url" ;;
                *)          print_db_line "''${DATABASE_URL:-}" ;;
              esac
              echo "process-compose API on port $pc_port (attach TUI: process-compose attach --port $pc_port)"

              # Brief pause so startup messages are readable before TUI takes over
              if [ -t 1 ]; then
                echo "Starting process-compose..."
                sleep 5
              fi

              if [ "$needs_cleanup" = "true" ]; then
                cleanup_cmds="''${cleanup_cmds}rm -rf \"$tmp_dir\";"
                # shellcheck disable=SC2064 # Intentional: expand commands now, not at signal time
                trap "$cleanup_cmds" EXIT
                process-compose -f "$pc_file" up --port "$pc_port"
              else
                exec process-compose -f "$pc_file" up --port "$pc_port"
              fi
            '';
          };
          opencouncil-prod = pkgs.buildNpmPackage {
            pname = "opencouncil-prod";
            version = "0.1.0";
            src = ./.;

            # impureEnvVars only works with fixed-output derivations, so we use
            # builtins.getEnv (requires --impure flag) to bake NEXT_PUBLIC_* values
            # into the derivation at evaluation time. This correctly changes the
            # derivation hash when values change.

            npmDeps = mkNpmDeps pkgs;
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;

            # Configure npm - ignore scripts during dependency installation
            makeCacheWritable = true;
            npmFlags = [ "--legacy-peer-deps" ];

            # Don't run install scripts during npm dependency fetch
            # We'll rebuild canvas properly later with all dependencies available
            npmInstallFlags = [ "--ignore-scripts" ];

            nativeBuildInputs = mkNpmNativeBuildInputs pkgs;
            buildInputs = mkNpmBuildInputs pkgs;

            # Set up environment for Prisma and canvas
            preBuild = ''
              export HOME=$TMPDIR
              ${mkPrismaEnv pkgs}
              # Skip env validation during build — most server-side secrets
              # (API keys, etc.) aren't needed at build time.
              export SKIP_ENV_VALIDATION=1
              export SKIP_FULL_SITEMAP=true
              export ELASTICSEARCH_URL=http://localhost:9200
              export ELASTICSEARCH_API_KEY=dummy

              # NOTE: The Nix sandbox blocks network access during the build phase,
              # so database queries (Prisma) will fail silently. Pages that depend
              # on DB data are pre-rendered empty and must be deleted in installPhase
              # (see below) so Next.js regenerates them at runtime.

              # NEXT_PUBLIC_* vars are inlined into client JS at build time by webpack.
              # Without them, t3-env client-side validation crashes the browser
              # (process.exit doesn't exist in browsers).
              #
              # Values are injected via builtins.getEnv at nix evaluation time,
              # which requires the --impure flag:
              #   set -a; source .env; set +a; nix build --impure .#opencouncil-prod
              # In CI, export from GitHub secrets before nix build --impure.
              #
              # This correctly changes the derivation hash when values change.
              # Fallback defaults ensure the build succeeds without --impure
              # (maps won't render with the placeholder token).
              export NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="${let v = builtins.getEnv "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"; in if v != "" then v else "pk.placeholder"}"
              ${let v = builtins.getEnv "NEXT_PUBLIC_CONTACT_EMAIL"; in if v != "" then "export NEXT_PUBLIC_CONTACT_EMAIL=\"${v}\"" else "# NEXT_PUBLIC_CONTACT_EMAIL not set"}
              ${let v = builtins.getEnv "NEXT_PUBLIC_CONTACT_ADDRESS"; in if v != "" then "export NEXT_PUBLIC_CONTACT_ADDRESS=\"${v}\"" else "# NEXT_PUBLIC_CONTACT_ADDRESS not set"}
              ${let v = builtins.getEnv "NEXT_PUBLIC_BUILD_COMMIT_SHA"; in if v != "" then "export NEXT_PUBLIC_BUILD_COMMIT_SHA=\"${v}\"" else "# NEXT_PUBLIC_BUILD_COMMIT_SHA not set"}

              # Run patch-package
              npm run postinstall

              # Now rebuild canvas with proper dependencies available
              # (it was skipped during npm install due to --ignore-scripts)
              npm rebuild canvas

              # Generate Prisma client
              npx prisma generate
            '';

            # Build script runs npm run build
            npmBuild = "npm run build";

            installPhase = ''
              mkdir -p $out

              # Copy standalone server (shopt to include .next hidden dir)
              shopt -s dotglob
              cp -r .next/standalone/* $out/
              shopt -u dotglob

              # Copy static assets (not included in standalone output)
              cp -r .next/static $out/.next/static

              # Copy public assets into the standalone public dir (which may
              # already exist from the standalone output). Use -n to avoid
              # overwriting files Next.js already placed there.
              if [ -d public ]; then
                cp -rn public/* $out/public/ 2>/dev/null || true
              fi

              # Copy modular i18n message files (not included in standalone output)
              if [ -d messages ]; then
                cp -r messages $out/messages
              fi

              # Remove pre-rendered homepage — the Nix sandbox blocks DB access
              # during build, so it's pre-rendered with empty data. Removing the
              # files forces Next.js to generate the page on first runtime request
              # with real DB data, then cache it via ISR (tag-based revalidation).
              rm -f $out/.next/server/app/el.html $out/.next/server/app/el.rsc \
                    $out/.next/server/app/el.meta \
                    $out/.next/server/app/en.html $out/.next/server/app/en.rsc \
                    $out/.next/server/app/en.meta
              rm -f $out/.next/server/app/el/about.html $out/.next/server/app/el/about.rsc \
                    $out/.next/server/app/el/about.meta \
                    $out/.next/server/app/en/about.html $out/.next/server/app/en/about.rsc \
                    $out/.next/server/app/en/about.meta

              # Copy Prisma schema for migrations
              mkdir -p $out/prisma
              cp -r prisma/* $out/prisma/ || true

              # Copy Prisma query engine for runtime use on NixOS.
              # During build, prisma generate uses the engine via env vars,
              # but at runtime the client needs it in a known location.
              cp ${pkgs.prisma-engines}/lib/libquery_engine.node $out/prisma/

              # Bundle seed script with dependencies (includes @/ path aliases)
              # Externals: @prisma/client (runtime), axios (dynamically imported, not needed
              # in production since preview-create pre-downloads seed data with curl)
              echo "Bundling seed script..."
              ${pkgs.esbuild}/bin/esbuild prisma/seed.ts \
                --bundle \
                --platform=node \
                --format=esm \
                --outfile=$out/prisma/seed.mjs \
                --external:@prisma/client \
                --external:axios \
                --loader:.ts=ts \
                --tsconfig=tsconfig.json \
                --define:process.env.SKIP_ENV_VALIDATION='"1"' || echo "Seed bundling failed, seeding may not work"

              # Copy tsconfig for tsx fallback (if bundling fails)
              cp tsconfig.json $out/ 2>/dev/null || true

              # Create start script. The Nix store is read-only; Next.js needs a writable
              # .next/cache for ISR, image optimization, and response cache. We create a
              # writable work dir (symlink store contents, real .next/cache) and run from there.
              cat > $out/start.sh <<'STARTEOF'
              #!${pkgs.runtimeShell}
              set -euo pipefail
              APP_DIR="$(cd "$(dirname "$0")" && pwd)"
              WORK_DIR="''${OC_RUN_DIR:-/tmp/opencouncil-run-''$$}"
              mkdir -p "$WORK_DIR/.next/cache"

              for item in "$APP_DIR"/*; do
                [ -e "$item" ] || continue
                name="$(basename "$item")"
                [ "$name" = ".next" ] && continue
                if [ "$name" = "server.js" ]; then
                  rm -f "$WORK_DIR/$name"
                  cp -f "$item" "$WORK_DIR/$name"
                else
                  ln -sfn "$item" "$WORK_DIR/$name"
                fi
              done
              for item in "$APP_DIR/.next"/*; do
                [ -e "$item" ] || continue
                name="$(basename "$item")"
                [ "$name" = "cache" ] && continue
                if [ "$name" = "server" ]; then
                  [ -L "$WORK_DIR/.next/server" ] && rm -f "$WORK_DIR/.next/server"
                  mkdir -p "$WORK_DIR/.next/server"
                  for sub in "$APP_DIR/.next/server"/*; do
                    [ -e "$sub" ] || continue
                    subname="$(basename "$sub")"
                    if [ "$subname" = "app" ]; then
                      rm -rf "$WORK_DIR/.next/server/app"
                      cp -r "$sub" "$WORK_DIR/.next/server/app"
                      chmod -R u+w "$WORK_DIR/.next/server/app"
                    else
                      ln -sfn "$sub" "$WORK_DIR/.next/server/$subname"
                    fi
                  done
                else
                  ln -sfn "$item" "$WORK_DIR/.next/$name"
                fi
              done

              export PRISMA_QUERY_ENGINE_LIBRARY="$WORK_DIR/prisma/libquery_engine.node"
              cd "$WORK_DIR"
              exec ${pkgs.nodejs}/bin/node server.js
              STARTEOF
              chmod +x $out/start.sh
            '';

            meta = {
              description = "OpenCouncil production build";
              platforms = systems;
            };
          };
          oc-rss = pkgs.writeShellApplication {
            name = "oc-rss";
            runtimeInputs = with pkgs; [
              curl
              jq
              newsboat
            ];
            text = ''
              set -euo pipefail

              port="''${OC_APP_PORT:-''${APP_PORT:-3000}}"
              base="http://localhost:$port"

              # Check dev server is running
              if ! curl -sf "$base" >/dev/null 2>&1; then
                echo "Dev server not reachable at $base" >&2
                echo "Start it first: nix run .#dev" >&2
                exit 1
              fi

              # Discover cities from API
              cities=$(curl -sf "$base/api/cities" | jq -r '.[].id')
              if [ -z "$cities" ]; then
                echo "No cities found from $base/api/cities" >&2
                exit 1
              fi

              tmp_dir="$(mktemp -d)"
              trap 'rm -rf "$tmp_dir"' EXIT

              # Generate newsboat urls file
              urls_file="$tmp_dir/urls"
              for city in $cities; do
                echo "$base/$city/feed \"~$city\"" >> "$urls_file"
              done

              echo "Feeds:"
              cat "$urls_file"
              echo ""

              # Minimal newsboat config for dev use
              config_file="$tmp_dir/config"
              cat > "$config_file" <<'CFG'
              auto-reload yes
              reload-time 30
              show-read-feeds no
              CFG

              exec newsboat -u "$urls_file" -C "$config_file" -c "$tmp_dir/cache.db"
            '';
          };
          # Notis production build (services/notis workspace). Standalone Next
          # server; the preview execs $out/start.sh so it always runs on this
          # toolchain (runtime-ownership rule, see pr-previews README).
          notis-prod = pkgs.buildNpmPackage {
            pname = "notis-prod";
            version = "0.1.0";
            src = ./.;

            npmDeps = mkNpmDeps pkgs;
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;
            makeCacheWritable = true;
            npmFlags = [ "--legacy-peer-deps" ];
            npmInstallFlags = [ "--ignore-scripts" ];

            nativeBuildInputs = mkNpmNativeBuildInputs pkgs;
            buildInputs = mkNpmBuildInputs pkgs;

            preBuild = ''
              export HOME=$TMPDIR
              ${mkPrismaEnv pkgs}
              export SKIP_ENV_VALIDATION=1
              npm run postinstall
              # Next's type-check resolves from the workspace root (turbopack.root),
              # which pulls in root files importing the generated Prisma client.
              npx prisma generate
            '';

            # NB: buildNpmPackage has no `npmBuild` attr — the real knob is
            # npmBuildFlags (appended to `npm run build`).
            npmBuildFlags = [ "--workspace=notis" ];

            installPhase = ''
              runHook preInstall
              mkdir -p $out

              shopt -s dotglob
              cp -r services/notis/.next/standalone/* $out/
              shopt -u dotglob

              # Static + public assets live next to the workspace's server.js
              cp -r services/notis/.next/static $out/services/notis/.next/static
              # Next's monorepo standalone output does NOT include public/ —
              # copy it in (the target dir does not pre-exist).
              if [ -d services/notis/public ]; then
                mkdir -p $out/services/notis/public
                cp -rn services/notis/public/* $out/services/notis/public/
              fi

              # Runtime-owned entrypoint: Node 24 from this flake's unstable
              # pin. The store is read-only but Next's fetch cache writes to
              # .next/cache under the server's __dirname — so mirror the app
              # into a writable work dir (same pattern as the main app's
              # start.sh): symlink everything, copy server.js (its __dirname
              # must resolve inside the work dir), real .next/cache.
              cat > $out/start.sh <<EOF
              #!${pkgs.runtimeShell}
              set -euo pipefail
              APP="$out/services/notis"
              RUN="\''${NOTIS_RUN_DIR:-/tmp/notis-run-\$\$}"
              mkdir -p "\$RUN/services/notis/.next/cache"
              ln -sfn "$out/node_modules" "\$RUN/node_modules"
              for item in "\$APP"/*; do
                name="\$(basename "\$item")"
                case "\$name" in
                  server.js) rm -f "\$RUN/services/notis/server.js"; cp "\$item" "\$RUN/services/notis/server.js" ;;
                  .next) : ;;
                  *) ln -sfn "\$item" "\$RUN/services/notis/\$name" ;;
                esac
              done
              for item in "\$APP/.next"/*; do
                name="\$(basename "\$item")"
                [ "\$name" = cache ] || ln -sfn "\$item" "\$RUN/services/notis/.next/\$name"
              done
              cd "\$RUN/services/notis"
              exec ${pkgs.nodejs}/bin/node server.js
              EOF
              chmod +x $out/start.sh
              runHook postInstall
            '';

            meta = { description = "Notis production build"; mainProgram = "start.sh"; };
          };

        in {
          inherit oc-dev oc-dev-db-nix oc-dev-db-nix-locked oc-dev-db-docker oc-dev-cache oc-dev-app-local oc-studio oc-cleanup oc-rss opencouncil-prod notis-prod;
        });

      checks = forAllSystems (_system: pkgs: _pkgs-unstable:
        let
          npmBuildInputs = mkNpmBuildInputs pkgs;
          npmNativeBuildInputs = mkNpmNativeBuildInputs pkgs;

          mkCheck = { name, checkScript }: pkgs.buildNpmPackage {
            pname = "opencouncil-check-${name}";
            version = "0.1.0";
            src = ./.;
            npmDeps = mkNpmDeps pkgs;
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;
            makeCacheWritable = true;
            npmFlags = [ "--legacy-peer-deps" ];
            npmInstallFlags = [ "--ignore-scripts" ];
            nativeBuildInputs = npmNativeBuildInputs;
            buildInputs = npmBuildInputs;
            dontNpmBuild = true;
            # Setup runs in preBuild so it executes after npmConfigHook has
            # installed node_modules.
            preBuild = ''
              export HOME=$TMPDIR
              ${mkPrismaEnv pkgs}
              export SKIP_ENV_VALIDATION=1
              export NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="pk.placeholder"
              npm run postinstall
              npm rebuild canvas
              npx prisma generate
            '';
            buildPhase = ''
              runHook preBuild
              ${checkScript}
              runHook postBuild
            '';
            installPhase = "touch $out";
          };
        in {
          lint = mkCheck {
            name = "lint";
            checkScript = "npm run lint -- --max-warnings 0";
          };
          types = mkCheck {
            name = "types";
            checkScript = "npx tsc --project tsconfig.jest.json --noEmit";
          };
          tests = mkCheck {
            name = "tests";
            # Exclude integration tests (they need Docker/testcontainers).
            # Limit workers to avoid exhausting memory in the nix sandbox.
            checkScript = "npm test -- --testPathIgnorePatterns='tests/integration' --maxWorkers=2";
          };
        });

      # Preview deployment config for the generic preview module in nix-openclaw.
      # See nix-openclaw/generic-preview.nix for the full interface spec.
      # Notis preview config (paired with the same PR's opencouncil preview
      # via the pr-previews `siblings` context). Consumed by the preview host:
      #   services.pr-previews.projects = opencouncil.previews // ...;
      # The host supplies envFile with NOTIS_ADMIN_SECRET and a (dummy)
      # ANTHROPIC_API_KEY — see docs/guides/preview-deployments.md.
      previews.notis = {
        hostPattern = "notis-pr-@id@.opencouncil.dev";
        # 20000+N: clear of the main app (3000+N), tasks (4000+N), and the
        # ad-hoc isolated-DB ports (5432+N) — 5000+N would collide with a DB
        # whenever notis PR = DB PR + 432.
        basePort = 20000;
        environment = [ "NODE_ENV=production" "HOSTNAME=0.0.0.0" ];

        startScript = _: ctx: ''
          # Point the REST proxies and MCP wakes at this PR's paired main
          # preview instead of production.
          export OPENCOUNCIL_BASE_URL="${ctx.siblings.opencouncil.url}"
          export NOTIS_MCP_URL="${ctx.siblings.opencouncil.url}/mcp"
          export NOTIS_RUN_DIR="$PR_DIR/work"
          exec "$APP_DIR/start.sh"
        '';
      };

      previews.opencouncil = let
        postgresCompat = self.lib.mkPostgresCompat;
        prismaEnv = self.lib.mkPrismaEnv;
        opensslEnv = self.lib.mkOpenSslEnv;
      in {
        hostPattern = "pr-@id@.opencouncil.dev";
        # Keep the old preview URLs answering with 301s during the move;
        # drop once the migration settles.
        redirectFrom = [ "pr-@id@.preview.opencouncil.gr" ];
        basePort = 3000;
        caddyBaseVirtualHost = true;

        cachix = {
          enable = true;
          name = "opencouncil";
          publicKey = "opencouncil.cachix.org-1:D6DC/9ZvVTQ8OJkdXM86jny5dQWjGofNq9p6XqeCWwI=";
        };

        # DEPLOYMENT_ENV drives preview behavior in the app (email
        # redirection, dev tools, preview-only UI) — see src/env.mjs.
        environment = [ "NODE_ENV=production" "DEPLOYMENT_ENV=preview" "HOSTNAME=0.0.0.0" ];

        extraPackages = pkgs: [ pkgs.htop (postgresCompat pkgs) ];

        # Free-form settings consumed by the hooks below via ctx.cfg.settings.
        # The host sets settings.tasksPreview = { domain; envFile; } to enable
        # auto-linking of tasks previews (unset = disabled; the hook guards
        # with `or ""`).
        settings.githubRepo = "schemalabz/opencouncil";

        # Extra sudo commands for per-PR PostgreSQL service control
        extraSudoCommands = { pkgs, serviceName }: [
          { command = "${pkgs.systemd}/bin/systemctl start opencouncil-preview-db@*"; options = [ "NOPASSWD" ]; }
          { command = "${pkgs.systemd}/bin/systemctl stop opencouncil-preview-db@*"; options = [ "NOPASSWD" ]; }
          { command = "${pkgs.systemd}/bin/systemctl status opencouncil-preview-db@*"; options = [ "NOPASSWD" ]; }
        ];

        # Extra NixOS config: per-PR PostgreSQL template service
        extraConfig = { config, lib, pkgs, cfg }: let
          pc = postgresCompat pkgs;
        in {
          systemd.services."opencouncil-preview-db@" = {
            description = "PostgreSQL for OpenCouncil preview PR %i";
            after = [ "network.target" ];

            serviceConfig = {
              Type = "simple";
              User = cfg.user;
              Group = cfg.group;
              ExecStart = let
                startDbScript = pkgs.writeShellScript "opencouncil-preview-db-start" ''
                  set -euo pipefail
                  PR_NUM="$1"
                  DB_PORT=$((5432 + PR_NUM))
                  DATA_DIR="${cfg.previewsDir}/pr-$PR_NUM/postgres"
                  DB_USER="opencouncil"
                  DB_NAME="opencouncil"

                  mkdir -p "$DATA_DIR"

                  # Initialize cluster if needed
                  if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
                    if [ -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
                      echo "Error: non-empty data dir without PG_VERSION: $DATA_DIR" >&2
                      echo "Delete it to reinitialize: rm -rf $DATA_DIR" >&2
                      exit 2
                    fi
                    ${pc}/bin/initdb -D "$DATA_DIR" --username="$DB_USER" --auth=trust
                  fi

                  SOCKET_DIR="/tmp/oc-preview-pg-$PR_NUM"
                  mkdir -p "$SOCKET_DIR"

                  ${pc}/bin/pg_ctl -D "$DATA_DIR" \
                    -o "-c port=$DB_PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$SOCKET_DIR" \
                    -w start
                  ${pc}/bin/createdb -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" \
                    --maintenance-db=template1 "$DB_NAME" >/dev/null 2>&1 || true
                  ${pc}/bin/pg_ctl -D "$DATA_DIR" -m fast -w stop

                  exec ${pc}/bin/postgres -D "$DATA_DIR" \
                    -c "port=$DB_PORT" \
                    -c "listen_addresses=127.0.0.1" \
                    -c "unix_socket_directories=$SOCKET_DIR" \
                    -c "shared_buffers=48MB" \
                    -c "work_mem=4MB" \
                    -c "maintenance_work_mem=16MB" \
                    -c "max_connections=20"
                '';
              in "${startDbScript} %i";
              Restart = "on-failure";
              RestartSec = "5s";
            };
          };
        };

        # Extra create-script arguments: --with-db flag
        createExtraArgs = {
          usage = ''
            Options:
              --with-db    Start an isolated PostgreSQL instance for this PR
                           (for PRs with database migrations)'';
          initScript = "with_db=false";
          parseScript = "--with-db) with_db=true ;;";
        };

        # Start script: host-side env composition only — the app's own
        # start.sh (built with the app's nixpkgs) owns the runtime and the
        # ISR work-dir setup. Runtime-ownership rule: see pr-previews README.
        startScript = _: ctx: ''
          # Check if this PR has an isolated database (migration PR)
          if [ -f "$PR_DIR/.has-local-db" ]; then
            DB_PORT=$(cat "$PR_DIR/.db-port")
            export DATABASE_URL="postgresql://opencouncil@127.0.0.1:$DB_PORT/opencouncil"
            export DIRECT_URL="$DATABASE_URL"
            echo "Using isolated database on port $DB_PORT"
          fi

          # Load per-preview env overrides (e.g., linked tasks preview)
          if [ -f "$PR_DIR/.env.local" ]; then
            echo "Loading per-preview env from .env.local"
            set -a
            . "$PR_DIR/.env.local"
            set +a
          fi

          export NEXTAUTH_URL="https://${ctx.host}"
          export OC_RUN_DIR="$PR_DIR/work"
          exec "$APP_DIR/start.sh"
        '';

        # Create hook: auto-link tasks preview + optional isolated database setup
        createHook = pkgs: ctx: let
          cfg = ctx.cfg;
          pc = postgresCompat pkgs;
          pe = prismaEnv pkgs;
          oe = opensslEnv pkgs;
        in ''
          # Auto-link tasks preview if PR body contains <!-- preview-link: tasks=N -->
          tasks_domain="${toString (cfg.settings.tasksPreview.domain or "")}"
          tasks_env_file="${toString (cfg.settings.tasksPreview.envFile or "")}"

          if [ -n "$tasks_domain" ] && [ -n "$tasks_env_file" ] && [ ! -f "$pr_dir/.env.local" ]; then
            pr_body=$(${pkgs.curl}/bin/curl -sf "https://api.github.com/repos/${cfg.settings.githubRepo}/pulls/$pr_num" | ${pkgs.jq}/bin/jq -r '.body // ""') || true
            tasks_pr=$(echo "$pr_body" | ${pkgs.gnugrep}/bin/grep -oP '<!--\s*preview-link:\s*tasks=\K\d+' || true)

            if [ -n "$tasks_pr" ]; then
              tasks_url="https://pr-''${tasks_pr}.''${tasks_domain}"
              tasks_key=""

              if [ -f "$tasks_env_file" ]; then
                tasks_key=$(${pkgs.gnugrep}/bin/grep '^API_TOKENS=' "$tasks_env_file" | ${pkgs.gnused}/bin/sed 's/^API_TOKENS=//' | ${pkgs.jq}/bin/jq -r '.[0] // ""')
              fi

              if [ -n "$tasks_key" ]; then
                printf '%s\n' "# Linked tasks preview (auto-detected from PR body)" \
                  "TASK_API_URL=$tasks_url" \
                  "TASK_API_KEY=$tasks_key" \
                  > "$pr_dir/.env.local"
                chown ${cfg.user}:${cfg.group} "$pr_dir/.env.local"
                echo "Linked to tasks preview PR #$tasks_pr ($tasks_url)"
              else
                echo "Warning: Found tasks link (PR #$tasks_pr) but could not read API key from $tasks_env_file"
              fi
            fi
          fi

          # Handle isolated database for migration PRs
          if [ "$with_db" = "true" ]; then
            echo ""
            echo "Setting up isolated database for PR #$pr_num..."

            db_port=$((5432 + pr_num))

            systemctl start "opencouncil-preview-db@$pr_num"

            # Wait for postgres AND the opencouncil database to be ready.
            # The DB service does a start->createdb->stop->start cycle, so pg_isready
            # alone can succeed on the first (temporary) start before the database exists.
            echo "Waiting for PostgreSQL on port $db_port..."
            for i in $(seq 1 30); do
              if ${pc}/bin/psql -h 127.0.0.1 -p "$db_port" -U opencouncil -d opencouncil \
                   -c "SELECT 1" >/dev/null 2>&1; then
                echo "PostgreSQL is ready"
                break
              fi
              if [ "$i" = "30" ]; then
                echo "Error: PostgreSQL did not become ready in time" >&2
                systemctl status "opencouncil-preview-db@$pr_num" --no-pager || true
                exit 1
              fi
              sleep 1
            done

            echo "Creating PostGIS extension..."
            ${pc}/bin/psql -h 127.0.0.1 -p "$db_port" -U opencouncil -d opencouncil \
              -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null

            cd "$store_path"
            ${pe}
            ${oe}
            export DATABASE_URL="postgresql://opencouncil@127.0.0.1:$db_port/opencouncil"
            export DIRECT_URL="$DATABASE_URL"
            export SKIP_ENV_VALIDATION=1
            export PATH="${pkgs.nodejs}/bin:$PATH"

            echo "Running migrations..."
            ${pkgs.prisma}/bin/prisma migrate deploy

            echo "Seeding database..."
            SEED_DATA_URL="https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/seed_data.json"
            SEED_DATA_PATH="$pr_dir/seed_data.json"
            if [ ! -f "$SEED_DATA_PATH" ]; then
              echo "Downloading seed data..."
              ${pkgs.curl}/bin/curl -fsSL "$SEED_DATA_URL" -o "$SEED_DATA_PATH"
            fi
            export SEED_DATA_PATH
            export DEV_TEST_CITY_ID="chania"

            if [ -f prisma/seed.mjs ]; then
              ${pkgs.nodejs}/bin/node prisma/seed.mjs
            else
              echo "Bundled seed not found, trying tsx..."
              ${pkgs.nodejs}/bin/npx --yes tsx prisma/seed.ts
            fi

            touch "$pr_dir/.has-local-db"
            echo "$db_port" > "$pr_dir/.db-port"
            chown ${cfg.user}:${cfg.group} "$pr_dir/.has-local-db" "$pr_dir/.db-port"

            echo "Isolated database ready on port $db_port (PostGIS 3.3.5)"
          fi
        '';

        # Destroy hook: stop per-PR postgres and clean up socket dir
        destroyHook = pkgs: ctx: ''
          if [ -f "$pr_dir/.has-local-db" ]; then
            echo "Stopping isolated database..."
            systemctl stop "opencouncil-preview-db@$pr_num" || true
            rm -rf "/tmp/oc-preview-pg-$pr_num"
          fi
        '';

        # Extra summary lines after "Preview created successfully"
        createSummary = pkgs: ctx: ''
          if [ "''${with_db:-false}" = "true" ]; then
            db_port=$((5432 + pr_num))
            echo "  Database: isolated (port $db_port, PostGIS 3.3.5)"
          else
            echo "  Database: shared staging"
          fi
        '';
      };

      apps = forAllSystems (system: pkgs: _pkgs-unstable: {
        dev = {
          type = "app";
          program = "${self.packages.${system}.oc-dev}/bin/oc-dev";
        };
        dev-app = {
          type = "app";
          program = "${pkgs.writeShellScript "oc-dev-app" ''
            exec ${self.packages.${system}.oc-dev}/bin/oc-dev --db=remote "$@"
          ''}";
        };
        dev-fast = {
          type = "app";
          program = "${pkgs.writeShellScript "oc-dev-fast" ''
            exec ${self.packages.${system}.oc-dev}/bin/oc-dev --fast "$@"
          ''}";
        };
        dev-db-nix = {
          type = "app";
          program = "${self.packages.${system}.oc-dev-db-nix}/bin/oc-dev-db-nix";
        };
        dev-db-docker = {
          type = "app";
          program = "${self.packages.${system}.oc-dev-db-docker}/bin/oc-dev-db-docker";
        };
        cleanup = {
          type = "app";
          program = "${self.packages.${system}.oc-cleanup}/bin/oc-cleanup";
        };
        studio = {
          type = "app";
          program = "${self.packages.${system}.oc-studio}/bin/oc-studio";
        };
        build = {
          type = "app";
          program = "${pkgs.writeShellScript "oc-build" ''
            set -euo pipefail
            echo "Building OpenCouncil production package..."
            nix build .#opencouncil-prod "$@"
            echo "Build complete. Output in ./result/"
          ''}";
        };
        rss = {
          type = "app";
          program = "${self.packages.${system}.oc-rss}/bin/oc-rss";
        };
        start = {
          type = "app";
          program = "${pkgs.writeShellScript "oc-start" ''
            set -euo pipefail
            if [ ! -d "./result" ]; then
              echo "Error: No build found. Run 'nix run .#build' first." >&2
              exit 1
            fi
            echo "Starting OpenCouncil production server..."
            exec ./result/start.sh
          ''}";
        };
      });
    };
}