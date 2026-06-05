variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "auth-a2a"
}

variable "image_tag" {
  description = "Container image tag to deploy for both agents."
  type        = string
  default     = "latest"
}

variable "bedrock_model_id" {
  description = "Bedrock model id used for inference by both agents."
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
