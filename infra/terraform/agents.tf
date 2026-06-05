# ECR repos, ECS cluster + two Fargate services (provider, payer), an ALB with
# two target groups and host/path listener rules, Secrets Manager, IAM, and
# CloudWatch logs. Service Connect gives the Provider a stable name to reach the
# Payer in-cluster (replacing localhost URLs from the demo track).

locals {
  agents = {
    payer    = { port = 4002, entry = "src/agents/payer/server.ts" }
    provider = { port = 4001, entry = "src/agents/provider/server.ts" }
  }
}

resource "aws_ecr_repository" "agent" {
  name                 = "${var.project}-agent"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.main.arn
  }
}

resource "aws_service_discovery_http_namespace" "main" {
  name = "${var.project}.internal"
}

resource "aws_cloudwatch_log_group" "agent" {
  for_each          = local.agents
  name              = "/ecs/${var.project}/${each.key}"
  retention_in_days = 7
}

# --- Secrets ----------------------------------------------------------------
resource "aws_secretsmanager_secret" "anthropic" {
  name = "${var.project}/anthropic-api-key"
}
# Value is set out-of-band (never in source):
#   aws secretsmanager put-secret-value --secret-id auth-a2a/anthropic-api-key --secret-string sk-...

# --- IAM --------------------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.project}-exec"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.anthropic.arn]
    }]
  })
}

resource "aws_iam_role" "task" {
  name               = "${var.project}-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Task role grants Bedrock invoke so the agents can call Claude on Bedrock.
resource "aws_iam_role_policy" "task_bedrock" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = "*"
    }]
  })
}

# --- Task definitions + services -------------------------------------------
resource "aws_ecs_task_definition" "agent" {
  for_each                 = local.agents
  family                   = "${var.project}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = "${aws_ecr_repository.agent.repository_url}:${var.image_tag}"
    command   = ["run", each.value.entry]
    essential = true
    portMappings = [{
      name          = each.key
      containerPort = each.value.port
      protocol      = "tcp"
    }]
    environment = [
      { name = "MOCK_LLM", value = "false" },
      { name = "USE_BEDROCK", value = "true" },
      { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "${upper(each.key)}_PORT", value = tostring(each.value.port) },
      # Provider reaches the Payer via Service Connect DNS, not localhost.
      { name = "PAYER_URL", value = "http://payer.${var.project}.internal:4002" },
    ]
    secrets = [
      { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.agent[each.key].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = each.key
      }
    }
  }])
}

resource "aws_ecs_service" "agent" {
  for_each        = local.agents
  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.tasks.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.agent[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  depends_on = [aws_lb_listener.https]
}

# --- ALB --------------------------------------------------------------------
resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
}

resource "aws_lb_target_group" "agent" {
  for_each    = local.agents
  name        = "${var.project}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path    = "/.well-known/agent-card.json"
    matcher = "200"
  }
}

# NOTE: supply your own ACM certificate ARN for HTTPS termination.
variable "certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener."
  type        = string
  default     = ""
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.agent["provider"].arn
  }
}

# Route /payer/* to the Payer; everything else hits the Provider.
resource "aws_lb_listener_rule" "payer" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.agent["payer"].arn
  }
  condition {
    path_pattern {
      values = ["/payer/*"]
    }
  }
}
