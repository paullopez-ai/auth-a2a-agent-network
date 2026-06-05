output "alb_dns_name" {
  description = "Public DNS of the ALB. Provider at /, Payer at /payer/*."
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "Push both agent images here (single image, two commands)."
  value       = aws_ecr_repository.agent.repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "anthropic_secret_arn" {
  description = "Set the API key with: aws secretsmanager put-secret-value ..."
  value       = aws_secretsmanager_secret.anthropic.arn
}
