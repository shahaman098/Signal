provider "alicloud" {
  region = var.region_id
}

provider "alicloud" {
  alias  = "mcp"
  region = var.mcp_region_id
}

resource "random_integer" "suffix" {
  min = 10000
  max = 99999
}

resource "random_password" "acr_instance" {
  count = trimspace(var.existing_acr_instance_id) == "" ? 1 : 0

  length      = 20
  min_upper   = 2
  min_lower   = 2
  min_numeric = 4
  special     = false
}

resource "random_password" "mcp_acr_instance" {
  count = var.create_mcp_registry && var.mcp_region_id != var.region_id && trimspace(var.existing_mcp_acr_instance_id) == "" ? 1 : 0

  length      = 20
  min_upper   = 2
  min_lower   = 2
  min_numeric = 4
  special     = false
}

locals {
  resource_suffix             = random_integer.suffix.result
  cluster_name                = substr("${var.name_prefix}-ack-${local.resource_suffix}", 0, 63)
  vpc_name                    = "${var.name_prefix}-vpc-${local.resource_suffix}"
  vswitch_name                = "${var.name_prefix}-vsw-${local.resource_suffix}"
  sg_name                     = "${var.name_prefix}-sg-${local.resource_suffix}"
  acr_namespace               = "${var.name_prefix}${local.resource_suffix}"
  acr_repo_name               = "${var.name_prefix}-api"
  acr_instance_name           = substr("${var.name_prefix}-acr-${local.resource_suffix}", 0, 30)
  use_existing_acr_instance   = trimspace(var.existing_acr_instance_id) != ""
  acr_instance_password       = trimspace(var.acr_instance_password) != "" ? var.acr_instance_password : try(random_password.acr_instance[0].result, "")
  create_dedicated_mcp_acr    = var.create_mcp_registry && var.mcp_region_id != var.region_id
  mcp_acr_namespace           = "${var.name_prefix}mcp${local.resource_suffix}"
  mcp_acr_repo_name           = "${var.name_prefix}-mcp"
  mcp_acr_instance_name       = substr("${var.name_prefix}-mcp-acr-${local.resource_suffix}", 0, 30)
  use_existing_mcp_acr_instance = trimspace(var.existing_mcp_acr_instance_id) != ""
  mcp_acr_instance_password   = trimspace(var.mcp_acr_instance_password) != "" ? var.mcp_acr_instance_password : try(random_password.mcp_acr_instance[0].result, local.acr_instance_password)
  create_primary_acr_instance = !local.use_existing_acr_instance
  create_mcp_acr_instance     = local.create_dedicated_mcp_acr && !local.use_existing_mcp_acr_instance
  mcp_function_name           = substr("${var.name_prefix}-mcp-${local.resource_suffix}", 0, 63)
  ack_assume_role_policy = jsonencode({
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = ["cs.aliyuncs.com"]
        }
      }
    ]
    Version = "1"
  })
  acr_assume_role_policy = jsonencode({
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = ["cr.aliyuncs.com"]
        }
      }
    ]
    Version = "1"
  })
  ack_role_specs = [
    {
      role_name   = "AliyunCSManagedLogRole"
      description = "The logging component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedLogRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedCmsRole"
      description = "The CMS component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedCmsRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedCsiRole"
      description = "The volume plug-in of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedCsiRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedCsiPluginRole"
      description = "The csi-plugin component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedCsiPluginRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedCsiProvisionerRole"
      description = "The csi-provisioner component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedCsiProvisionerRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedVKRole"
      description = "The VK component of ACK Serverless clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedVKRolePolicy"
    },
    {
      role_name   = "AliyunCSServerlessKubernetesRole"
      description = "By default, ACK Serverless clusters assume this role to access your cloud resources."
      policy_name = "AliyunCSServerlessKubernetesRolePolicy"
    },
    {
      role_name   = "AliyunCSKubernetesAuditRole"
      description = "The auditing feature of ACK assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSKubernetesAuditRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedNetworkRole"
      description = "The network plug-in of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedNetworkRolePolicy"
    },
    {
      role_name   = "AliyunCSDefaultRole"
      description = "By default, ACK assumes this role to access your resources in other Alibaba Cloud services when managing ACK clusters."
      policy_name = "AliyunCSDefaultRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedKubernetesRole"
      description = "By default, ACK clusters assume this role to access your cloud resources."
      policy_name = "AliyunCSManagedKubernetesRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedArmsRole"
      description = "The ARMS component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedArmsRolePolicy"
    },
    {
      role_name   = "AliyunCSManagedAutoScalerRole"
      description = "The auto scaling component of ACK clusters assumes this role to access your resources in other Alibaba Cloud services."
      policy_name = "AliyunCSManagedAutoScalerRolePolicy"
    },
  ]
  mcp_environment_variables = merge(
    {
      HOST                = "0.0.0.0"
      PORT                = tostring(var.mcp_function_port)
      SIGNAL_API_BASE_URL = var.mcp_signal_api_base_url
    },
    var.mcp_additional_env_vars,
  )
  primary_acr_instance_id = local.use_existing_acr_instance ? trimspace(var.existing_acr_instance_id) : alicloud_cr_ee_instance.signal[0].id
  mcp_acr_instance_id = !var.create_mcp_registry ? null : (
    local.create_dedicated_mcp_acr ? (
      local.use_existing_mcp_acr_instance ? trimspace(var.existing_mcp_acr_instance_id) : alicloud_cr_ee_instance.signal_mcp[0].id
    ) : local.primary_acr_instance_id
  )
}

data "alicloud_ack_service" "open" {
  enable = "On"
  type   = "propayasgo"
}

data "alicloud_oss_service" "open" {
  enable = "On"
}

data "alicloud_ram_roles" "ack_existing" {
  name_regex = "^Aliyun.*Role$"
}

locals {
  ack_existing_role_names = [for role in data.alicloud_ram_roles.ack_existing.roles : role.name]
  ack_missing_role_specs = [
    for role in local.ack_role_specs : role
    if !contains(local.ack_existing_role_names, role.role_name)
  ]
  acr_default_role_missing = !contains(local.ack_existing_role_names, "AliyunContainerRegistryDefaultRole")
}

resource "alicloud_ram_role" "ack" {
  for_each = {
    for role in local.ack_missing_role_specs : role.role_name => role
  }

  role_name                   = each.value.role_name
  description                 = each.value.description
  force                       = true
  assume_role_policy_document = local.ack_assume_role_policy
}

resource "alicloud_ram_role_policy_attachment" "ack" {
  for_each = {
    for role in local.ack_missing_role_specs : role.role_name => role
  }

  policy_name = each.value.policy_name
  policy_type = "System"
  role_name   = each.value.role_name
  depends_on  = [alicloud_ram_role.ack]
}

resource "alicloud_ram_role" "acr_default" {
  count = local.acr_default_role_missing ? 1 : 0

  role_name                   = "AliyunContainerRegistryDefaultRole"
  description                 = "By default, Container Registry assumes this role to access your resources in other Alibaba Cloud services."
  force                       = true
  assume_role_policy_document = local.acr_assume_role_policy
}

resource "alicloud_ram_role_policy_attachment" "acr_default" {
  count = local.acr_default_role_missing ? 1 : 0

  policy_name = "AliyunContainerRegistryRolePolicy"
  policy_type = "System"
  role_name   = "AliyunContainerRegistryDefaultRole"
  depends_on  = [alicloud_ram_role.acr_default]
}

data "alicloud_eci_zones" "available" {}

resource "alicloud_vpc" "signal" {
  vpc_name   = local.vpc_name
  cidr_block = var.vpc_cidr
}

resource "alicloud_vswitch" "signal" {
  vswitch_name = local.vswitch_name
  vpc_id       = alicloud_vpc.signal.id
  cidr_block   = cidrsubnet(alicloud_vpc.signal.cidr_block, 8, 8)
  zone_id      = data.alicloud_eci_zones.available.zones[0].zone_ids[0]
}

resource "alicloud_security_group" "signal" {
  name   = local.sg_name
  vpc_id = alicloud_vpc.signal.id
}

resource "alicloud_cs_serverless_kubernetes" "signal" {
  depends_on = [
    data.alicloud_ack_service.open,
    alicloud_ram_role_policy_attachment.ack,
  ]

  name                           = local.cluster_name
  version                        = var.ack_version
  cluster_spec                   = var.cluster_spec
  vpc_id                         = alicloud_vpc.signal.id
  vswitch_ids                    = [alicloud_vswitch.signal.id]
  new_nat_gateway                = true
  endpoint_public_access_enabled = var.endpoint_public_access_enabled
  deletion_protection            = false
  security_group_id              = alicloud_security_group.signal.id
  enable_rrsa                    = true
  time_zone                      = "Asia/Singapore"
  service_cidr                   = var.service_cidr
  service_discovery_types        = ["CoreDNS"]

  tags = {
    project = "signal"
    stack   = "hackathon"
    managed = "terraform"
  }
}

resource "alicloud_cr_ee_instance" "signal" {
  count = local.create_primary_acr_instance ? 1 : 0

  depends_on = [
    data.alicloud_oss_service.open,
    alicloud_ram_role_policy_attachment.acr_default,
  ]

  payment_type   = var.acr_instance_payment_type
  period         = var.acr_instance_period
  renew_period   = var.acr_instance_renew_period
  renewal_status = var.acr_instance_renewal_status
  instance_type  = var.acr_instance_type
  instance_name  = local.acr_instance_name
  password       = local.acr_instance_password
}

resource "alicloud_cr_ee_namespace" "signal" {
  instance_id        = local.primary_acr_instance_id
  name               = local.acr_namespace
  auto_create        = false
  default_visibility = var.acr_namespace_visibility
}

resource "alicloud_cr_ee_repo" "signal" {
  instance_id = local.primary_acr_instance_id
  namespace   = alicloud_cr_ee_namespace.signal.name
  name        = local.acr_repo_name
  summary     = var.acr_repo_summary
  repo_type   = var.acr_repo_type
  detail      = var.acr_repo_detail
}

resource "alicloud_cr_ee_instance" "signal_mcp" {
  provider = alicloud.mcp
  count    = local.create_mcp_acr_instance ? 1 : 0
  depends_on = [
    data.alicloud_oss_service.open,
    alicloud_ram_role_policy_attachment.acr_default,
  ]

  payment_type   = var.acr_instance_payment_type
  period         = var.acr_instance_period
  renew_period   = var.acr_instance_renew_period
  renewal_status = var.acr_instance_renewal_status
  instance_type  = var.acr_instance_type
  instance_name  = local.mcp_acr_instance_name
  password       = local.mcp_acr_instance_password
}

resource "alicloud_cr_ee_namespace" "signal_mcp_same_region" {
  count = var.create_mcp_registry && !local.create_dedicated_mcp_acr ? 1 : 0

  instance_id        = local.primary_acr_instance_id
  name               = local.mcp_acr_namespace
  auto_create        = false
  default_visibility = var.acr_namespace_visibility
}

resource "alicloud_cr_ee_namespace" "signal_mcp_cross_region" {
  provider = alicloud.mcp
  count    = local.create_dedicated_mcp_acr ? 1 : 0

  instance_id        = local.mcp_acr_instance_id
  name               = local.mcp_acr_namespace
  auto_create        = false
  default_visibility = var.acr_namespace_visibility
}

resource "alicloud_cr_ee_repo" "signal_mcp_same_region" {
  count = var.create_mcp_registry && !local.create_dedicated_mcp_acr ? 1 : 0

  instance_id = local.primary_acr_instance_id
  namespace   = alicloud_cr_ee_namespace.signal_mcp_same_region[0].name
  name        = local.mcp_acr_repo_name
  summary     = var.mcp_acr_repo_summary
  repo_type   = var.acr_repo_type
  detail      = var.mcp_acr_repo_detail
}

resource "alicloud_cr_ee_repo" "signal_mcp_cross_region" {
  provider = alicloud.mcp
  count    = local.create_dedicated_mcp_acr ? 1 : 0

  instance_id = local.mcp_acr_instance_id
  namespace   = alicloud_cr_ee_namespace.signal_mcp_cross_region[0].name
  name        = local.mcp_acr_repo_name
  summary     = var.mcp_acr_repo_summary
  repo_type   = var.acr_repo_type
  detail      = var.mcp_acr_repo_detail
}

resource "alicloud_fcv3_function" "signal_mcp" {
  provider = alicloud.mcp
  count    = var.deploy_mcp_function ? 1 : 0

  function_name = local.mcp_function_name
  description   = var.mcp_function_description
  runtime       = var.mcp_function_runtime
  handler       = var.mcp_function_handler
  memory_size   = var.mcp_memory_size
  timeout       = var.mcp_timeout
  cpu           = var.mcp_cpu
  disk_size     = var.mcp_disk_size

  environment_variables = local.mcp_environment_variables
  internet_access       = true

  custom_container_config {
    image = var.mcp_container_image
    port  = var.mcp_function_port

    health_check_config {
      http_get_url          = "/health"
      initial_delay_seconds = 2
      period_seconds        = 10
      success_threshold     = 1
      timeout_seconds       = 3
      failure_threshold     = 3
    }
  }

  lifecycle {
    precondition {
      condition     = trimspace(var.mcp_container_image) != ""
      error_message = "Set mcp_container_image to the ACR image for the remote Signal MCP server before enabling deploy_mcp_function."
    }

    precondition {
      condition     = trimspace(var.mcp_signal_api_base_url) != ""
      error_message = "Set mcp_signal_api_base_url to the deployed Signal API base URL before enabling deploy_mcp_function."
    }
  }
}

resource "alicloud_fcv3_trigger" "signal_mcp_http" {
  provider = alicloud.mcp
  count    = var.deploy_mcp_function ? 1 : 0

  function_name  = alicloud_fcv3_function.signal_mcp[0].function_name
  trigger_name   = "${local.mcp_function_name}-http"
  trigger_type   = "http"
  qualifier      = "LATEST"
  trigger_config = jsonencode({
    authType = "anonymous"
    methods  = ["GET", "POST", "DELETE"]
  })
}
