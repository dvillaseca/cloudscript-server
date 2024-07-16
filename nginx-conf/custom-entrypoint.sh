#!/bin/bash

# Create directories if they don't exist
mkdir -p /etc/nginx/ssl

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/server.key -out /etc/nginx/ssl/server.crt -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=localhost"

# Generate Diffie-Hellman parameter
openssl dhparam -out /etc/nginx/ssl/dhparam.pem 2048

/docker-entrypoint.sh nginx -g "daemon off;"
