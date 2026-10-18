FROM gotenberg/gotenberg:8.37.0-chromium

# Signup forms use a static HTML template with embedded fonts. The renderer
# cannot fetch private or public HTTP resources from a form.
ENV CHROMIUM_DISABLE_JAVASCRIPT=true \
    CHROMIUM_DENY_PRIVATE_IPS=true \
    CHROMIUM_DENY_PUBLIC_IPS=true
