output "ack_cluster_id" {
  description = "ID of the ACK Serverless cluster."
  value       = alicloud_cs_serverless_kubernetes.signal.id
}

output "ack_cluster_name" {
  description = "Name of the ACK Serverless cluster."
  value       = alicloud_cs_serverless_kubernetes.signal.name
}

output "ack_vpc_id" {
  description = "VPC ID created for the Signal stack."
  value       = alicloud_vpc.signal.id
}

output "acr_instance_id" {
  description = "ID of the ACR Enterprise Edition instance used for the Signal API image."
  value       = local.primary_acr_instance_id
}

output "acr_instance_name" {
  description = "Name of the ACR Enterprise Edition instance used for the Signal API image."
  value       = local.use_existing_acr_instance ? null : alicloud_cr_ee_instance.signal[0].instance_name
}

output "acr_instance_endpoints" {
  description = "Endpoint metadata returned by the ACR Enterprise Edition instance."
  value       = local.use_existing_acr_instance ? null : alicloud_cr_ee_instance.signal[0].instance_endpoints
}

output "acr_instance_password" {
  description = "Registry login password configured for the primary ACR Enterprise Edition instance."
  value       = local.acr_instance_password != "" ? local.acr_instance_password : null
  sensitive   = true
}

output "acr_namespace" {
  description = "Namespace created for Signal API images."
  value       = alicloud_cr_ee_namespace.signal.name
}

output "acr_repo_name" {
  description = "Repository name for the Signal API image."
  value       = alicloud_cr_ee_repo.signal.name
}

output "acr_repo_id" {
  description = "Instance/namespace/repository identifier for the Signal API image."
  value       = alicloud_cr_ee_repo.signal.id
}

output "acr_repo_domains" {
  description = "Flattened endpoint domains available for the primary ACR Enterprise Edition instance."
  value = local.use_existing_acr_instance ? null : flatten([
    for endpoint in alicloud_cr_ee_instance.signal[0].instance_endpoints : [
      for domain in endpoint.domains : {
        endpoint_type = endpoint.endpoint_type
        enabled       = endpoint.enable
        domain        = domain.domain
        domain_type   = domain.type
      }
    ]
  ])
}

output "mcp_region_id" {
  description = "Region used for remote MCP infrastructure."
  value       = var.mcp_region_id
}

output "mcp_acr_instance_id" {
  description = "ID of the ACR Enterprise Edition instance used for the remote MCP image."
  value       = local.mcp_acr_instance_id
}

output "mcp_acr_instance_name" {
  description = "Name of the ACR Enterprise Edition instance used for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? (
      local.use_existing_mcp_acr_instance ? null : alicloud_cr_ee_instance.signal_mcp[0].instance_name
    ) : (
      local.use_existing_acr_instance ? null : alicloud_cr_ee_instance.signal[0].instance_name
    )
  )
}

output "mcp_acr_instance_endpoints" {
  description = "Endpoint metadata returned by the ACR Enterprise Edition instance used for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? (
      local.use_existing_mcp_acr_instance ? null : alicloud_cr_ee_instance.signal_mcp[0].instance_endpoints
    ) : (
      local.use_existing_acr_instance ? null : alicloud_cr_ee_instance.signal[0].instance_endpoints
    )
  )
}

output "mcp_acr_instance_password" {
  description = "Registry login password configured for the remote MCP ACR Enterprise Edition instance."
  value       = var.create_mcp_registry && local.mcp_acr_instance_password != "" ? local.mcp_acr_instance_password : null
  sensitive   = true
}

output "mcp_acr_namespace" {
  description = "Namespace created for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? alicloud_cr_ee_namespace.signal_mcp_cross_region[0].name : alicloud_cr_ee_namespace.signal_mcp_same_region[0].name
  )
}

output "mcp_acr_repo_name" {
  description = "Repository name for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? alicloud_cr_ee_repo.signal_mcp_cross_region[0].name : alicloud_cr_ee_repo.signal_mcp_same_region[0].name
  )
}

output "mcp_acr_repo_id" {
  description = "Instance/namespace/repository identifier for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? alicloud_cr_ee_repo.signal_mcp_cross_region[0].id : alicloud_cr_ee_repo.signal_mcp_same_region[0].id
  )
}

output "mcp_acr_repo_domains" {
  description = "Flattened endpoint domains available for the ACR Enterprise Edition instance used for the remote MCP image."
  value = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? (
      local.use_existing_mcp_acr_instance ? null : flatten([
        for endpoint in alicloud_cr_ee_instance.signal_mcp[0].instance_endpoints : [
          for domain in endpoint.domains : {
            endpoint_type = endpoint.endpoint_type
            enabled       = endpoint.enable
            domain        = domain.domain
            domain_type   = domain.type
          }
        ]
      ])
    ) : (
      local.use_existing_acr_instance ? null : flatten([
        for endpoint in alicloud_cr_ee_instance.signal[0].instance_endpoints : [
          for domain in endpoint.domains : {
            endpoint_type = endpoint.endpoint_type
            enabled       = endpoint.enable
            domain        = domain.domain
            domain_type   = domain.type
          }
        ]
      ])
    )
  )
}

output "mcp_function_name" {
  description = "Function Compute function name for the remote MCP service."
  value       = var.deploy_mcp_function ? alicloud_fcv3_function.signal_mcp[0].function_name : null
}

output "mcp_http_trigger_internet_url" {
  description = "Public HTTP trigger URL for the remote MCP service."
  value       = var.deploy_mcp_function ? alicloud_fcv3_trigger.signal_mcp_http[0].http_trigger[0].url_internet : null
}

output "mcp_http_trigger_intranet_url" {
  description = "Private HTTP trigger URL for the remote MCP service."
  value       = var.deploy_mcp_function ? alicloud_fcv3_trigger.signal_mcp_http[0].http_trigger[0].url_intranet : null
}
