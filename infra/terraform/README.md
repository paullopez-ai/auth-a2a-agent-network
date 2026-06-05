# Hyperscaler Track — AWS (Terraform)

> **Status: scaffold.** This Terraform expresses the target AWS topology from the
> PRD and is internally consistent, but it has not been `terraform apply`'d as
> part of the demo-track build (that requires an AWS account + Docker). Review
> `plan` output and supply a `certificate_arn` before applying.

## What it provisions

| Service | Purpose |
|---------|---------|
| VPC (2 public + 2 private subnets, NAT) | Network isolation; tasks run private, ALB public |
| ECS cluster + 2 Fargate services | One service per agent (`provider`, `payer`) |
| ECS Service Connect | In-cluster discovery: Provider reaches `http://payer.auth-a2a.internal:4002` |
| Application Load Balancer | HTTPS ingress; `/` → Provider, `/payer/*` → Payer |
| ECR repository | Single image, two start commands |
| Secrets Manager | `ANTHROPIC_API_KEY`, injected into tasks (never in source) |
| IAM roles | Task execution (pull image, read secret) + task role (Bedrock invoke) |
| CloudWatch log groups | Per-agent logs |

Inference runs through **Amazon Bedrock** (`USE_BEDROCK=true`), so no Anthropic
key is strictly required at runtime if you rely on Bedrock alone.

## Deploy

```bash
# 1. Build + push the image (single image; ECS picks the agent via command)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <ecr_repository_url>
docker build -t <ecr_repository_url>:latest .
docker push <ecr_repository_url>:latest

# 2. Provision
terraform init
terraform plan -var="certificate_arn=arn:aws:acm:...:certificate/..."
terraform apply -var="certificate_arn=arn:aws:acm:...:certificate/..."

# 3. Set the API key (if not using Bedrock-only)
aws secretsmanager put-secret-value \
  --secret-id auth-a2a/anthropic-api-key --secret-string "sk-ant-..."

# 4. Verify both agents
curl https://<alb_dns_name>/.well-known/agent-card.json
curl https://<alb_dns_name>/payer/.well-known/agent-card.json

# 5. Run Scenario 2 against the live endpoints
PROVIDER_URL=https://<alb_dns_name> \
PAYER_URL=https://<alb_dns_name>/payer \
bun run demo/scenarios/scenario-2-denial-appeal.ts
```

## Cost guardrails

Estimated at demo scale (2 Fargate tasks, 0.25 vCPU / 0.5 GB, ~4 h/day):
**≈ $8–15/month**. A single 2-hour demo session is **< $1.00**.

```bash
terraform destroy   # remove everything after the demo
```

Set a **$20/month AWS budget alert** on the account to catch runaway charges.
