variable "region_id" {
  type        = string
  description = "Alibaba Cloud region for the cluster and registry resources."
  default     = "ap-southeast-1"
}

variable "mcp_region_id" {
  type        = string
  description = "Alibaba Cloud region for the remote MCP service resources."
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  type        = string
  description = "Shared name prefix for Terraform-managed resources."
  default     = "signal"
}

variable "ack_version" {
  type        = string
  description = "Desired Kubernetes version for the ACK Serverless cluster."
  default     = "1.36.1-aliyun.1"
}

variable "cluster_spec" {
  type        = string
  description = "ACK Serverless cluster spec."
  default     = "ack.pro.small"
}

variable "endpoint_public_access_enabled" {
  type        = bool
  description = "Whether the Kubernetes API server gets a public endpoint."
  default     = true
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the new VPC."
  default     = "172.16.0.0/12"
}

variable "service_cidr" {
  type        = string
  description = "Service CIDR for the ACK Serverless cluster."
  default     = "10.13.0.0/16"
}

variable "acr_namespace_visibility" {
  type        = string
  description = "Default visibility for repositories created in the ACR namespace."
  default     = "PRIVATE"
}

variable "acr_repo_type" {
  type        = string
  description = "Visibility for the Signal image repository."
  default     = "PRIVATE"
}

variable "acr_instance_type" {
  type        = string
  description = "ACR Enterprise Edition instance type. International accounts support Basic and Advanced."
  default     = "Basic"
}

variable "acr_instance_payment_type" {
  type        = string
  description = "Billing model for the ACR Enterprise Edition instance."
  default     = "Subscription"
}

variable "acr_instance_period" {
  type        = number
  description = "Subscription period in months for the ACR Enterprise Edition instance."
  default     = 1
}

variable "acr_instance_renew_period" {
  type        = number
  description = "Renewal period in months when automatic renewal is enabled."
  default     = 0
}

variable "acr_instance_renewal_status" {
  type        = string
  description = "Renewal mode for the ACR Enterprise Edition instance."
  default     = "ManualRenewal"
}

variable "acr_instance_password" {
  type        = string
  description = "Optional ACR Enterprise Edition login password for the primary Signal registry instance. Leave blank to generate one."
  default     = ""
  sensitive   = true
}

variable "existing_acr_instance_id" {
  type        = string
  description = "Optional existing ACR Enterprise Edition instance ID to reuse for the primary Signal registry path instead of creating a new instance."
  default     = ""
}

variable "mcp_acr_instance_password" {
  type        = string
  description = "Optional ACR Enterprise Edition login password for the remote MCP registry instance. Leave blank to generate one."
  default     = ""
  sensitive   = true
}

variable "existing_mcp_acr_instance_id" {
  type        = string
  description = "Optional existing ACR Enterprise Edition instance ID to reuse for the dedicated MCP registry path when mcp_region_id differs from region_id."
  default     = ""
}

variable "acr_repo_summary" {
  type        = string
  description = "Short summary for the Signal image repository."
  default     = "Signal API container image"
}

variable "acr_repo_detail" {
  type        = string
  description = "Detailed description for the Signal image repository."
  default     = "Container image for the Signal creative intelligence API."
}

variable "create_mcp_registry" {
  type        = bool
  description = "Whether to create a dedicated ACR namespace and repository for the remote MCP service."
  default     = true
}

variable "deploy_mcp_function" {
  type        = bool
  description = "Whether to deploy the remote Signal MCP function to Function Compute."
  default     = false
}

variable "mcp_acr_repo_summary" {
  type        = string
  description = "Short summary for the Signal MCP container image repository."
  default     = "Signal MCP remote service container image"
}

variable "mcp_acr_repo_detail" {
  type        = string
  description = "Detailed description for the Signal MCP remote service repository."
  default     = "Container image for the Signal remote MCP service."
}

variable "mcp_container_image" {
  type        = string
  description = "Full container image reference for the remote Signal MCP service."
  default     = ""
}

variable "mcp_function_description" {
  type        = string
  description = "Description applied to the remote Signal MCP Function Compute function."
  default     = "Signal remote MCP service for Model Studio."
}

variable "mcp_function_runtime" {
  type        = string
  description = "Runtime value used for the remote MCP custom container function."
  default     = "custom-container"
}

variable "mcp_function_handler" {
  type        = string
  description = "Required handler field for the remote MCP function. Function Compute may ignore this when custom_container_config is set."
  default     = "index.handler"
}

variable "mcp_memory_size" {
  type        = number
  description = "Memory size in MB for the remote MCP function."
  default     = 512
}

variable "mcp_cpu" {
  type        = number
  description = "CPU allocation in vCPU for the remote MCP function."
  default     = 0.5
}

variable "mcp_timeout" {
  type        = number
  description = "Timeout in seconds for the remote MCP function."
  default     = 300
}

variable "mcp_disk_size" {
  type        = number
  description = "Disk size in MB for the remote MCP function."
  default     = 512
}

variable "mcp_function_port" {
  type        = number
  description = "Listening port for the remote MCP HTTP server inside the container."
  default     = 8080
}

variable "mcp_signal_api_base_url" {
  type        = string
  description = "Base URL for the deployed Signal API that the remote MCP service should call."
  default     = ""
}

variable "mcp_additional_env_vars" {
  type        = map(string)
  description = "Additional environment variables passed to the remote MCP function."
  default     = {}
}
