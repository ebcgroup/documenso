#!/usr/bin/env bash

command -v docker >/dev/null 2>&1 || {
    echo "Docker is not running. Please start Docker and try again."
    exit 1
}

SCRIPT_DIR="$(readlink -f "$(dirname "$0")")"
MONOREPO_ROOT="$(readlink -f "$SCRIPT_DIR/../")"

# Get the platform from environment variable or set to linux/amd64 if not set
# quote the string to prevent word splitting
if [ -z "$PLATFORM" ]; then
    PLATFORM="linux/amd64"
fi

APP_VERSION="$(git name-rev --tags --name-only $(git rev-parse HEAD) | head -n 1 | sed 's/\^0//')"
GIT_SHA="$(git rev-parse HEAD)"

echo "Building docker image for monorepo at $MONOREPO_ROOT"
echo "App version: $APP_VERSION"
echo "Git SHA: $GIT_SHA"

BUILD_ARGS=(
    -f "$SCRIPT_DIR/Dockerfile"
    --platform=$PLATFORM
    --progress=plain
    --build-arg NEXT_PRIVATE_TELEMETRY_KEY="${NEXT_PRIVATE_TELEMETRY_KEY:-}"
    --build-arg NEXT_PRIVATE_TELEMETRY_HOST="${NEXT_PRIVATE_TELEMETRY_HOST:-}"
)

if [ ! -z "$DOCKER_REPOSITORY" ]; then
    echo "Using custom repository: $DOCKER_REPOSITORY"

    BUILD_ARGS+=(
        -t "$DOCKER_REPOSITORY:latest"
        -t "$DOCKER_REPOSITORY:$GIT_SHA"
    )

    if [ ! -z "$APP_VERSION" ] && [ "$APP_VERSION" != "undefined" ]; then
        BUILD_ARGS+=(-t "$DOCKER_REPOSITORY:$APP_VERSION")
    fi
else
    echo "Using default repositories: dockerhub and ghcr.io"

    BUILD_ARGS+=(
        -t "documenso/documenso:latest"
        -t "documenso/documenso:$GIT_SHA"
        -t "ghcr.io/documenso/documenso:latest"
        -t "ghcr.io/documenso/documenso:$GIT_SHA"
    )

    if [ ! -z "$APP_VERSION" ] && [ "$APP_VERSION" != "undefined" ]; then
        BUILD_ARGS+=(
            -t "documenso/documenso:$APP_VERSION"
            -t "ghcr.io/documenso/documenso:$APP_VERSION"
        )
    fi
fi

docker buildx build \
    "${BUILD_ARGS[@]}" \
    --push \
    "$MONOREPO_ROOT"
