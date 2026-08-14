#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  # shellcheck source=./sites-env.sh
  source "${script_dir}/sites-env.sh"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
for generated_dir in "${SITES_PROJECT_ROOT}/dist" "${SITES_PROJECT_ROOT}/.vinext"; do
  if [[ -d "${generated_dir}" ]]; then
    # Prevent stale client assets and transformed font imports from surviving builds.
    find "${generated_dir}" -mindepth 1 -delete
  fi
done
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

bash "${script_dir}/validate-artifact.sh"
