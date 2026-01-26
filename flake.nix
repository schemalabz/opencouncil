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
        in {
          inherit oc-dev oc-dev-db-nix oc-dev-db-docker oc-dev-app-local oc-cleanup;
        });

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
      });
    };
}