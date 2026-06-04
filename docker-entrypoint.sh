#!/bin/sh
set -eu

json_or_null() {
  if [ -n "$1" ]; then
    # Escape backslashes then double-quotes so the value is safe inside a JS string literal
    escaped=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '"%s"' "$escaped"
  else
    printf 'null'
  fi
}

# Only public/anon credentials belong in the browser bundle.
# Never include server-side API keys (GEMINI_API_KEY, VITE_GOOGLE_API_KEY, etc.)
# here — they would be served to every visitor in plain text.
SUPABASE_URL_JSON=$(json_or_null "${VITE_SUPABASE_URL:-}")
SUPABASE_ANON_KEY_JSON=$(json_or_null "${VITE_SUPABASE_ANON_KEY:-}")

cat > /usr/share/nginx/html/env.js <<EOF
window.__APP_ENV__ = {
  VITE_SUPABASE_URL: ${SUPABASE_URL_JSON},
  VITE_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY_JSON}
};
window.process = window.process || {};
window.process.env = window.process.env || {};
if (window.__APP_ENV__.VITE_SUPABASE_URL) window.process.env.VITE_SUPABASE_URL = window.__APP_ENV__.VITE_SUPABASE_URL;
if (window.__APP_ENV__.VITE_SUPABASE_ANON_KEY) window.process.env.VITE_SUPABASE_ANON_KEY = window.__APP_ENV__.VITE_SUPABASE_ANON_KEY;
EOF
