#!/bin/sh
set -e

HTPASSWD_FILE="/etc/nginx/.htpasswd"

# If ADMIN_USER and ADMIN_PASSWORD are provided via environment variables,
# generate/update the .htpasswd file with a SHA-1 hash supported natively by Nginx.
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ]; then
    PASS_HASH=$(echo -n "$ADMIN_PASSWORD" | openssl dgst -sha1 -binary | base64)
    echo "${ADMIN_USER}:{SHA}${PASS_HASH}" > "$HTPASSWD_FILE"
    echo "[Security Guard] Successfully generated $HTPASSWD_FILE for user: $ADMIN_USER"
elif [ ! -f "$HTPASSWD_FILE" ]; then
    # Fallback default: admin / admin123
    echo "admin:{SHA}+GW1NiOxIf007lQmx5Llwzr4wic=" > "$HTPASSWD_FILE"
    echo "[Security Guard] Warning: ADMIN_USER/ADMIN_PASSWORD not set. Using default admin credentials."
fi
