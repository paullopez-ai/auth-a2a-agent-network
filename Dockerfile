# Single image for both agents. The ECS task definition selects which agent to
# run via the AGENT_ENTRY command (see infra/terraform/agents.tf).
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# App source.
COPY tsconfig.json ./
COPY src ./src

ENV MOCK_LLM=false
ENV USE_BEDROCK=true

# Default to the Payer; the Provider service overrides the command in ECS.
# Example overrides:
#   payer:    ["run","src/agents/payer/server.ts"]
#   provider: ["run","src/agents/provider/server.ts"]
ENTRYPOINT ["bun"]
CMD ["run", "src/agents/payer/server.ts"]
