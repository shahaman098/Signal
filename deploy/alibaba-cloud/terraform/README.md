# Terraform Alibaba Stack

This stack provisions the repeatable Alibaba Cloud primitives for Signal:

- ACK account activation
- required ACK RAM service roles when they are missing
- the default ACR RAM service role when it is missing
- OSS account activation for ACR EE
- an ACK Serverless cluster
- a VPC, vSwitch, and security group for that cluster
- an ACR Enterprise Edition instance, namespace, and repository for the Signal API image
- an optional ACR Enterprise Edition namespace and repository for the remote MCP image
- an optional second ACR Enterprise Edition instance when the MCP region differs from the API region
- an optional Function Compute v3 function plus HTTP trigger for the remote MCP service

It is intentionally scoped to infrastructure. It does not create a Model Studio managed agent. The managed-agent step is still console-driven in this repo because the console is the only path we have verified against the live Singapore workspace.

## What This Stack Solves

- Gives the repo a reproducible Alibaba Cloud infrastructure story
- Creates the cluster target for the Kubernetes manifest in `deploy/alibaba-cloud/acs`
- Creates the supported ACR EE registry target for both API and MCP images
- Creates the Function Compute hosting path for the remote MCP service

## Prerequisites

1. Use Cloud Shell or another Terraform environment authenticated to your Alibaba Cloud account.
2. Understand that `terraform apply` creates billable resources, including ACR EE subscription instances and ACK infrastructure.
3. The account you use must be allowed to accept Alibaba Cloud service activations and create RAM roles.

Cloud Shell is still the lowest-friction execution environment because Terraform and Alibaba credentials are already wired into the signed-in account.

## Files

- `versions.tf` - provider and Terraform version constraints
- `variables.tf` - configurable inputs
- `main.tf` - network, cluster, ACR EE, and Function Compute resources
- `outputs.tf` - values needed after apply
- `terraform.tfvars.example` - sample input values

## Usage

```bash
cd deploy/alibaba-cloud/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
terraform output
```

## Important Behavior

- The stack now uses `alicloud_cr_ee_instance`, `alicloud_cr_ee_namespace`, and `alicloud_cr_ee_repo` because the older personal-edition ACR resources no longer matched the live console experience.
- The stack also enables ACK and OSS, creates the standard ACK RAM roles when they are missing, and bootstraps `AliyunContainerRegistryDefaultRole` for ACR EE, because fresh accounts otherwise fail during cluster and registry provisioning.
- If Alibaba billing APIs refuse to create the ACR EE instance for your account, you can purchase the instance once in the console and then set `existing_acr_instance_id` so Terraform adopts that registry for namespaces, repositories, and downstream outputs.
- If you use a separate MCP-region registry that was also purchased outside Terraform, set `existing_mcp_acr_instance_id`.
- The default `mcp_region_id` is `ap-southeast-1` so the Terraform defaults line up with the current Model Studio workspace in Singapore.
- If `create_mcp_registry = true` and `mcp_region_id == region_id`, Terraform reuses the primary ACR EE instance and only creates an extra namespace/repository for the MCP image.
- If `create_mcp_registry = true` and `mcp_region_id != region_id`, Terraform creates a second ACR EE instance in the MCP region.
- Terraform sets ACR EE passwords directly on created instances. Read them with `terraform output -raw acr_instance_password` or `terraform output -raw mcp_acr_instance_password`.

## Outputs You Will Use

- `acr_instance_endpoints` or `acr_repo_domains` to find the registry login server
- `acr_namespace`
- `acr_repo_name`
- `acr_instance_password`
- `mcp_acr_instance_endpoints` or `mcp_acr_repo_domains`
- `mcp_acr_namespace`
- `mcp_acr_repo_name`
- `mcp_acr_instance_password`
- `ack_cluster_id`
- `mcp_http_trigger_internet_url`

## Adopting Existing ACR EE Instances

When an account cannot create subscription registries through Terraform billing APIs, use this flow instead:

1. Purchase the ACR EE instance in the Alibaba console.
2. Set the instance ID in `terraform.tfvars`:

```hcl
existing_acr_instance_id = "cri-xxxxxxxx"
```

3. If the MCP registry is a separate cross-region instance, set:

```hcl
existing_mcp_acr_instance_id = "cri-yyyyyyyy"
```

4. Run Terraform again:

```bash
terraform plan
terraform apply
```

Terraform will then create namespaces, repositories, and later Function Compute resources against those purchased instances instead of trying to buy new registries again.

## Remote MCP Flow

The remote MCP flow is two-stage:

1. Create the base infrastructure:

```bash
terraform apply
```

2. Build and push the remote MCP image:

```bash
export MCP_ACR_REGISTRY="<acr-ee-login-server>"
export MCP_ACR_NAMESPACE="$(terraform output -raw mcp_acr_namespace)"
export MCP_ACR_USERNAME="<acr-username>"
export MCP_ACR_PASSWORD="$(terraform output -raw mcp_acr_instance_password)"
deploy/alibaba-cloud/model-studio/push-mcp-image.sh
```

3. Set the Function Compute inputs in `terraform.tfvars`:

- `deploy_mcp_function = true`
- `mcp_container_image = "<full-image-ref>"`
- `mcp_signal_api_base_url = "<deployed-signal-api-base-url>"`

4. Apply again to deploy the remote MCP function and HTTP trigger:

```bash
terraform apply
```

5. Read the public endpoint:

```bash
terraform output mcp_http_trigger_internet_url
```

That endpoint is the base URL you register in Model Studio. For remote service configuration:

- `streamableHttp` maps to `POST /mcp`
- `sse` maps to `GET /sse`

## API Deployment Flow

Once the cluster and registry exist, export the values needed by the existing deploy script:

```bash
export ACR_REGISTRY="<acr-ee-login-server>"
export ACR_NAMESPACE="$(terraform output -raw acr_namespace)"
export ACR_USERNAME="<acr-username>"
export ACR_PASSWORD="$(terraform output -raw acr_instance_password)"
export K8S_NAMESPACE=signal
```

You still need:

- kubeconfig for the new ACK cluster
- the live creative backend env vars
- the remote MCP image reference for the Function Compute deployment

## Notes

- The cluster is created with `endpoint_public_access_enabled = true` by default to reduce setup friction during the hackathon.
- The stack creates billable cloud resources. Destroy them when you are done:

```bash
terraform destroy
```
