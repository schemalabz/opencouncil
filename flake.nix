{
  description = "OpenCouncil dev shell";

  inputs = {
    # Version pinning is handled by flake.lock (single source of truth).
    # We pin via flake.lock, but choose a channel that contains Prisma 5.22.x
    # so NixOS can use nixpkgs-provided Prisma engines without version mismatches.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems =
        f: nixpkgs.lib.genAttrs systems (system: f system (import nixpkgs { inherit system; }));
    in {
      devShells = forAllSystems (_system: pkgs: {
        default = pkgs.mkShell {
          buildInputs =
            (with pkgs; [
              nodejs
              nodePackages.npm
              nodePackages.prisma
              openssl
              pkg-config
              prisma-engines
              process-compose
              gh             # GitHub CLI for PR/issue management
              postgresql_16  # Provides psql CLI for interactive DB access
            ])
            ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
              # Provides libuuid.so.1, required by native deps like `canvas`.
              pkgs.util-linux
            ]);

          shellHook = ''
            echo "Prisma engines path: ${pkgs.prisma-engines}"

            # OpenSSL configuration
            export OPENSSL_DIR="${pkgs.openssl.dev}"
            export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
            export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig"

            # Prisma engine binaries (important on NixOS; harmless elsewhere).
            export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines}/lib/libquery_engine.node"
            export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
            export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
            export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"

            # Native Node deps (e.g. `canvas`) may rely on system libraries like libuuid.
            # Ensure the Nix-provided libuuid is discoverable at runtime on Linux.
            ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export LD_LIBRARY_PATH="${pkgs.util-linux.lib}/lib:''${LD_LIBRARY_PATH:-}"
            ''}

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
            echo ""
            echo "Next steps:"
            echo "  - Start app + local DB (default): nix run .#dev"
            echo "  - Start app + remote DB (from .env): nix run .#dev -- --db=remote"
            echo "  - Reset local DB and build cache: nix run .#cleanup"
            echo "  - View logs: tail -200 .data/process-compose/app.log .data/process-compose/db.log"
            echo "  - Run psql: psql \"\$PSQL_URL\""
            echo ""
            echo "For full docs: docs/nix-usage.md"
          '';
        };
      });

      packages = forAllSystems (_system: pkgs:
        let
          postgres = pkgs.postgresql_16.withPackages (ps: [ ps.postgis ]);

          oc-dev-db-nix = pkgs.writeShellApplication {
            name = "oc-dev-db-nix";
            runtimeInputs = with pkgs; [
              coreutils
              postgres
            ];
            text = ''
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

              socket_dir="$data_dir/socket"
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
          };

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

          oc-dev-app-local = pkgs.writeShellApplication {
            name = "oc-dev-app-local";
            runtimeInputs = with pkgs; [
              coreutils
              postgres
              nodejs
              nodePackages.npm
              nodePackages.prisma
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

              # Ensure PostGIS is available in the database.
              psql "postgresql://$db_user@127.0.0.1:$port/$db_name?sslmode=disable" \
                -v ON_ERROR_STOP=1 \
                -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null

              # Apply migrations, generate Prisma client, and seed (safe for dev/local).
              (cd "$repo_root" && npm run db:deploy:seed)

              cd "$repo_root"
              export APP_PORT="$app_port"
              exec npm run dev -- -p "$app_port"
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
              (with pkgs; [
                coreutils
                gnused
                process-compose
                lsof
                nodejs
                nodePackages.npm
                oc-dev-db-nix
                oc-dev-db-docker
                oc-dev-app-local
              ])
              ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
                pkgs.iproute2
              ]);
            text = ''
              set -euo pipefail

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

              usage() {
                cat <<'USAGE'
Usage:
  nix run .#dev -- [--db=remote|external|nix|docker] [--db-url URL] [--direct-url URL] [--migrate] [--no-studio]

DB modes:
  --db=nix      Start Postgres+PostGIS via Nix + app (process-compose TUI) (default)
  --db=remote   Use DATABASE_URL/DIRECT_URL from .env
  --db=external Use explicit --db-url/--direct-url for app only
  --db=docker   Start Docker PostGIS + app (requires Docker)

Flags:
  --migrate     Run migrations (npm run db:deploy) before starting the app (remote/external only)
  --no-studio   Disable Prisma Studio process (enabled by default for local DB modes)
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

              for arg in "$@"; do
                case "$arg" in
                  --db=*) db_mode="''${arg#--db=}" ;;
                  --db-url=*) db_url="''${arg#--db-url=}" ;;
                  --direct-url=*) direct_url="''${arg#--direct-url=}" ;;
                  --migrate) migrate="1" ;;
                  --no-studio) studio_override="0" ;;
                  --help|-h) usage; exit 0 ;;
                  *)
                    echo "Unknown argument: $arg" >&2
                    usage
                    exit 2
                    ;;
                esac
              done

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

              case "$db_mode" in
                remote)
                  cat >"$pc_file" <<EOF
version: "0.5"
processes:
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; export APP_PORT=\"$app_port\"; if [ \"$migrate\" = \"1\" ]; then npm run db:deploy; fi; npm run dev -- -p \"$app_port\" 2>&1 | tee -a \"$logs_dir/app.log\"'"
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
    command: "bash -lc 'set -o pipefail; export APP_PORT=\"$app_port\"; export DATABASE_URL=\"$db_url\"; export DIRECT_URL=\"$direct_url\"; if [ \"$migrate\" = \"1\" ]; then npm run db:deploy; fi; npm run dev -- -p \"$app_port\" 2>&1 | tee -a \"$logs_dir/app.log\"'"
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
    command: "bash -lc 'set -o pipefail; OC_DB_DATA_DIR=\"$data_dir\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" oc-dev-db-nix 2>&1 | tee -a \"$logs_dir/db.log\"'"
  app:
    working_dir: "$repo_root"
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" OC_APP_PORT=\"$app_port\" APP_PORT=\"$app_port\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" OC_DB_PASSWORD=\"$db_password\" oc-dev-app-local 2>&1 | tee -a \"$logs_dir/app.log\"'"
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
    command: "bash -lc 'set -o pipefail; DATABASE_URL=\"$db_url_local\" DIRECT_URL=\"$db_url_local\" OC_APP_PORT=\"$app_port\" APP_PORT=\"$app_port\" OC_DB_PORT=\"$db_port\" OC_DB_USER=\"$db_user\" OC_DB_NAME=\"$db_name\" OC_DB_PASSWORD=\"$db_password\" oc-dev-app-local 2>&1 | tee -a \"$logs_dir/app.log\"'"
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

              exec process-compose -f "$pc_file" up
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

            # This hash needs to be updated when package-lock.json changes
            # Run: nix run nixpkgs#prefetch-npm-deps package-lock.json
            npmDepsHash = "sha256-0gL2/o05Z8XXMzBpKsdiZMFftrMRb4bKsDD3uEJDX60=";

            # Configure npm - ignore scripts during dependency installation
            makeCacheWritable = true;
            npmFlags = [ "--legacy-peer-deps" ];

            # Don't run install scripts during npm dependency fetch
            # We'll rebuild canvas properly later with all dependencies available
            npmInstallFlags = [ "--ignore-scripts" ];

            nativeBuildInputs = with pkgs; [
              nodejs
              nodePackages.prisma
              prisma-engines
              openssl
              pkg-config
              python3  # Required by node-gyp packages
              # Dependencies for canvas package
              cairo
              pango
              libjpeg
              giflib
              librsvg
              pixman
              libpng
              glib
            ] ++ (pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.util-linux
            ]);

            buildInputs = with pkgs; [
              # Runtime dependencies for canvas
              cairo
              pango
              libjpeg
              giflib
              pixman
              libpng
              glib
              librsvg
            ];

            # Set up environment for Prisma and canvas
            preBuild = ''
              export HOME=$TMPDIR
              export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines}/lib/libquery_engine.node"
              export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
              export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
              export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"

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
              export NEXT_PUBLIC_BASE_URL="${let v = builtins.getEnv "NEXT_PUBLIC_BASE_URL"; in if v != "" then v else "https://opencouncil.gr"}"
              export NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="${let v = builtins.getEnv "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"; in if v != "" then v else "pk.placeholder"}"
              ${let v = builtins.getEnv "NEXT_PUBLIC_CONTACT_PHONE"; in if v != "" then "export NEXT_PUBLIC_CONTACT_PHONE=\"${v}\"" else "# NEXT_PUBLIC_CONTACT_PHONE not set"}
              ${let v = builtins.getEnv "NEXT_PUBLIC_CONTACT_EMAIL"; in if v != "" then "export NEXT_PUBLIC_CONTACT_EMAIL=\"${v}\"" else "# NEXT_PUBLIC_CONTACT_EMAIL not set"}
              ${let v = builtins.getEnv "NEXT_PUBLIC_CONTACT_ADDRESS"; in if v != "" then "export NEXT_PUBLIC_CONTACT_ADDRESS=\"${v}\"" else "# NEXT_PUBLIC_CONTACT_ADDRESS not set"}

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

              # Create start script. The Nix store is read-only; Next.js needs a writable
              # .next/cache for ISR, image optimization, and response cache. We create a
              # writable work dir (symlink store contents, real .next/cache) and run from there.
              cat > $out/start.sh <<'STARTEOF'
              #!/usr/bin/env bash
              set -euo pipefail
              APP_DIR="$(cd "$(dirname "$0")" && pwd)"
              WORK_DIR="''${OC_RUN_DIR:-/tmp/opencouncil-run-''$$}"
              mkdir -p "$WORK_DIR/.next/cache"

              for item in "$APP_DIR"/*; do
                [ -e "$item" ] || continue
                name="$(basename "$item")"
                [ "$name" = ".next" ] && continue
                if [ "$name" = "server.js" ]; then
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
                  mkdir -p "$WORK_DIR/.next/server"
                  for sub in "$APP_DIR/.next/server"/*; do
                    [ -e "$sub" ] || continue
                    subname="$(basename "$sub")"
                    if [ "$subname" = "app" ]; then
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
        in {
          inherit oc-dev oc-dev-db-nix oc-dev-db-docker oc-dev-app-local oc-cleanup opencouncil-prod;
        });

      nixosModules.opencouncil-preview = { config, lib, pkgs, ... }:
        with lib;
        let
          cfg = config.services.opencouncil-preview;
        in {
          options.services.opencouncil-preview = {
            enable = mkEnableOption "OpenCouncil preview deployments";

            previewsDir = mkOption {
              type = types.path;
              default = "/var/lib/opencouncil-previews";
              description = "Directory to store preview instances";
            };

            user = mkOption {
              type = types.str;
              default = "opencouncil";
              description = "User to run preview services";
            };

            group = mkOption {
              type = types.str;
              default = "opencouncil";
              description = "Group to run preview services";
            };

            basePort = mkOption {
              type = types.int;
              default = 3000;
              description = "Base port for preview instances (PR number will be added)";
            };

            envFile = mkOption {
              type = types.nullOr types.path;
              default = null;
              description = ''
                Path to an environment file with shared runtime env vars
                (API keys, storage config, etc.). Loaded by systemd EnvironmentFile=.
              '';
            };

            previewDomain = mkOption {
              type = types.str;
              default = "preview.opencouncil.gr";
              description = "Domain for preview subdomains (pr-N.<domain>)";
            };

            cachix = {
              enable = mkEnableOption "Cachix binary cache";
              cacheName = mkOption {
                type = types.str;
                default = "opencouncil";
                description = "Cachix cache name";
              };
              publicKey = mkOption {
                type = types.str;
                default = "opencouncil.cachix.org-1:D6DC/9ZvVTQ8OJkdXM86jny5dQWjGofNq9p6XqeCWwI=";
                description = "Cachix public key for signature verification";
              };
            };
          };

          config = mkIf cfg.enable {
            users.users.${cfg.user} = {
              isSystemUser = true;
              group = cfg.group;
              home = cfg.previewsDir;
              createHome = true;
              shell = pkgs.bash;
            };

            users.groups.${cfg.group} = {};

            # Networking
            networking.firewall.allowedTCPPorts = [ 80 443 ];

            # Nix settings
            nix.settings.experimental-features = [ "nix-command" "flakes" ];
            nix.settings.trusted-users = [ "root" cfg.user ];

            # Cachix binary cache
            nix.settings.substituters = mkIf cfg.cachix.enable [
              "https://cache.nixos.org"
              "https://${cfg.cachix.cacheName}.cachix.org"
            ];
            nix.settings.trusted-public-keys = mkIf cfg.cachix.enable [
              "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
              cfg.cachix.publicKey
            ];

            # Automatic garbage collection
            nix.gc = {
              automatic = true;
              dates = "weekly";
              options = "--delete-older-than 30d";
            };

            # Caddy reverse proxy with automatic HTTPS
            services.caddy = {
              enable = true;

              virtualHosts."${cfg.previewDomain}" = {
                extraConfig = ''
                  respond "OpenCouncil PR Preview Host - Active previews managed dynamically" 200
                '';
              };

              extraConfig = ''
                import /etc/caddy/conf.d/*
              '';
            };

            # Create directory for Caddy drop-in configs
            systemd.tmpfiles.rules = [
              "d /etc/caddy/conf.d 0755 caddy caddy -"
            ];

            # Sudo rules for the deploy user
            security.sudo.extraRules = [
              {
                users = [ cfg.user ];
                commands = [
                  {
                    command = "${pkgs.systemd}/bin/systemctl start opencouncil-preview@*";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "${pkgs.systemd}/bin/systemctl stop opencouncil-preview@*";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "${pkgs.systemd}/bin/systemctl enable opencouncil-preview@*";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "${pkgs.systemd}/bin/systemctl disable opencouncil-preview@*";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "${pkgs.systemd}/bin/systemctl status opencouncil-preview@*";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "${pkgs.systemd}/bin/systemctl reload caddy";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "/run/current-system/sw/bin/caddy-add-preview";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "/run/current-system/sw/bin/caddy-remove-preview";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "/run/current-system/sw/bin/opencouncil-preview-create";
                    options = [ "NOPASSWD" ];
                  }
                  {
                    command = "/run/current-system/sw/bin/opencouncil-preview-destroy";
                    options = [ "NOPASSWD" ];
                  }
                ];
              }
            ];

            # Template systemd service for preview instances.
            # Instance name (%i) is the port number (basePort + PR number).
            # Each PR has its own app at /var/lib/opencouncil-previews/pr-<N>/app
            # (a symlink to the nix store path, created by opencouncil-preview-create).
            systemd.services."opencouncil-preview@" = {
              description = "OpenCouncil preview instance on port %i";
              after = [ "network.target" ];

              serviceConfig = {
                Type = "simple";
                User = cfg.user;
                Group = cfg.group;
                Environment = [
                  "NODE_ENV=production"
                  "PORT=%i"
                  "HOSTNAME=0.0.0.0"
                ];
                # Load shared env vars (API keys, storage config, etc.) from file
                EnvironmentFile = mkIf (cfg.envFile != null) cfg.envFile;
                ExecStart = let
                  startScript = pkgs.writeShellScript "opencouncil-preview-start" ''
                    set -euo pipefail
                    PORT="$1"
                    PR_NUM=$((PORT - ${toString cfg.basePort}))
                    APP_DIR="${cfg.previewsDir}/pr-$PR_NUM/app"
                    if [ ! -L "$APP_DIR" ] && [ ! -d "$APP_DIR" ]; then
                      echo "Error: app not found at $APP_DIR" >&2
                      exit 1
                    fi

                    # Set per-PR URLs at runtime
                    export NEXT_PUBLIC_BASE_URL="https://pr-$PR_NUM.${cfg.previewDomain}"
                    # NEXTAUTH_URL is required for NextAuth to construct correct callback URLs
                    # (e.g., magic link emails). Without this, it falls back to 0.0.0.0:PORT.
                    export NEXTAUTH_URL="https://pr-$PR_NUM.${cfg.previewDomain}"

                    # Prisma query engine: built for NixOS, copied into the output by installPhase
                    export PRISMA_QUERY_ENGINE_LIBRARY="$APP_DIR/prisma/libquery_engine.node"

                    # Next.js needs a writable .next/cache directory for ISR and image optimization.
                    # The nix store is read-only, so we create a writable working directory that
                    # mirrors the store path but with a real .next/cache.
                    WORK_DIR="${cfg.previewsDir}/pr-$PR_NUM/work"
                    mkdir -p "$WORK_DIR/.next/cache"

                    # Symlink everything from the store into the work dir.
                    # server.js is COPIED (not symlinked) because it uses __dirname
                    # and Node.js resolves symlinks, which would point back to the
                    # read-only nix store instead of this writable work dir.
                    for item in "$APP_DIR"/*; do
                      name="$(basename "$item")"
                      [ "$name" = ".next" ] && continue
                      if [ "$name" = "server.js" ]; then
                        cp -f "$item" "$WORK_DIR/$name"
                      else
                        ln -sfn "$item" "$WORK_DIR/$name"
                      fi
                    done

                    # Symlink .next contents except cache
                    mkdir -p "$WORK_DIR/.next"
                    for item in "$APP_DIR/.next"/*; do
                      name="$(basename "$item")"
                      [ "$name" = "cache" ] && continue
                      ln -sfn "$item" "$WORK_DIR/.next/$name"
                    done

                    cd "$WORK_DIR"
                    exec ${pkgs.nodejs}/bin/node server.js
                  '';
                in "${startScript} %i";
                Restart = "on-failure";
                RestartSec = "5s";

                # Security hardening
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectHome = true;
                ReadWritePaths = [ cfg.previewsDir ];
              };
            };

            environment.systemPackages = [
              # Utility packages
              pkgs.git
              pkgs.cachix
              pkgs.htop
              pkgs.curl
              pkgs.jq

              # Caddy helper scripts
              (pkgs.writeShellScriptBin "caddy-add-preview" ''
                set -euo pipefail

                if [ $# -ne 1 ]; then
                  echo "Usage: caddy-add-preview <pr-number>" >&2
                  exit 1
                fi

                pr_num="$1"
                port=$((${toString cfg.basePort} + pr_num))
                config_file="/etc/caddy/conf.d/pr-$pr_num.conf"

                mkdir -p /etc/caddy/conf.d

                cat > "$config_file" <<CADDYEOF
pr-$pr_num.${cfg.previewDomain} {
  reverse_proxy localhost:$port {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
}
CADDYEOF

                echo "Added Caddy config for PR #$pr_num at $config_file"

                systemctl reload caddy
              '')

              (pkgs.writeShellScriptBin "caddy-remove-preview" ''
                set -euo pipefail

                if [ $# -ne 1 ]; then
                  echo "Usage: caddy-remove-preview <pr-number>" >&2
                  exit 1
                fi

                pr_num="$1"
                config_file="/etc/caddy/conf.d/pr-$pr_num.conf"

                if [ -f "$config_file" ]; then
                  rm "$config_file"
                  echo "Removed Caddy config for PR #$pr_num"

                  systemctl reload caddy
                else
                  echo "No Caddy config found for PR #$pr_num"
                fi
              '')

              (pkgs.writeShellScriptBin "opencouncil-preview-create" ''
                set -euo pipefail

                if [ $# -lt 2 ]; then
                  echo "Usage: opencouncil-preview-create <pr-number> <nix-store-path>" >&2
                  exit 1
                fi

                pr_num="$1"
                store_path="$2"
                port=$((${toString cfg.basePort} + pr_num))
                pr_dir="${cfg.previewsDir}/pr-$pr_num"

                # Fetch the store path from Cachix (or other configured substituters) if not already local
                if [ ! -d "$store_path" ]; then
                  echo "Fetching $store_path from binary cache..."
                  nix-store --realise "$store_path" || {
                    echo "Error: could not fetch store path: $store_path" >&2
                    exit 1
                  }
                fi

                # Create per-PR directory and symlink to the build
                mkdir -p "$pr_dir"
                ln -sfn "$store_path" "$pr_dir/app"
                chown -R ${cfg.user}:${cfg.group} "$pr_dir"

                echo "Creating preview for PR #$pr_num on port $port"
                echo "  App: $store_path"

                # Stop existing service if running, then start fresh
                systemctl stop "opencouncil-preview@$port" 2>/dev/null || true
                systemctl start "opencouncil-preview@$port"

                # Configure Caddy (if caddy-add-preview is available)
                if command -v caddy-add-preview >/dev/null 2>&1; then
                  caddy-add-preview "$pr_num"
                fi

                echo ""
                echo "✓ Preview created successfully"
                echo "  Local: http://localhost:$port"
                echo "  Public: https://pr-$pr_num.${cfg.previewDomain}"
                echo "  Service: opencouncil-preview@$port"
              '')

              (pkgs.writeShellScriptBin "opencouncil-preview-destroy" ''
                set -euo pipefail

                if [ $# -ne 1 ]; then
                  echo "Usage: opencouncil-preview-destroy <pr-number>" >&2
                  exit 1
                fi

                pr_num="$1"
                port=$((${toString cfg.basePort} + pr_num))
                pr_dir="${cfg.previewsDir}/pr-$pr_num"

                echo "Destroying preview for PR #$pr_num (port $port)"

                # Stop systemd service
                systemctl stop "opencouncil-preview@$port" || true

                # Remove per-PR directory
                if [ -d "$pr_dir" ]; then
                  rm -rf "$pr_dir"
                fi

                # Remove Caddy config (if caddy-remove-preview is available)
                if command -v caddy-remove-preview >/dev/null 2>&1; then
                  caddy-remove-preview "$pr_num"
                fi

                echo "✓ Preview destroyed"
              '')

              (pkgs.writeShellScriptBin "opencouncil-preview-logs" ''
                set -euo pipefail

                if [ $# -lt 1 ]; then
                  echo "Usage: opencouncil-preview-logs <pr-number> [journalctl args...]" >&2
                  echo "Example: opencouncil-preview-logs 123" >&2
                  echo "Example: opencouncil-preview-logs 123 -n 50" >&2
                  exit 1
                fi

                pr_num="$1"
                shift
                port=$((${toString cfg.basePort} + pr_num))

                # Default to follow mode if no extra args given
                if [ $# -eq 0 ]; then
                  exec journalctl -u "opencouncil-preview@$port" -f
                else
                  exec journalctl -u "opencouncil-preview@$port" "$@"
                fi
              '')

              (pkgs.writeShellScriptBin "opencouncil-preview-list" ''
                set -euo pipefail

                echo "Active preview instances:"
                echo ""
                systemctl list-units "opencouncil-preview@*" --all --no-pager
                echo ""
                echo "Deployed builds:"
                for pr_dir in ${cfg.previewsDir}/pr-*; do
                  if [ -d "$pr_dir" ]; then
                    pr_name="$(basename "$pr_dir")"
                    app_link="$pr_dir/app"
                    if [ -L "$app_link" ]; then
                      echo "  $pr_name → $(readlink "$app_link")"
                    else
                      echo "  $pr_name (no app symlink)"
                    fi
                  fi
                done
              '')
            ];
          };
        };

      apps = forAllSystems (system: pkgs: {
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
        build = {
          type = "app";
          program = "${pkgs.writeShellScript "oc-build" ''
            set -euo pipefail
            echo "Building OpenCouncil production package..."
            nix build .#opencouncil-prod "$@"
            echo "Build complete. Output in ./result/"
          ''}";
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