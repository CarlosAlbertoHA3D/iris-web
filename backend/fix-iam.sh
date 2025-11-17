#!/bin/bash
# Script para agregar permisos de Batch sin exceder límite de policies

set -e

USER_NAME="Carlos-Rodriguez-DB"

echo "🔧 Arreglando permisos IAM para AWS Batch..."
echo ""

# 1. Remover policy duplicada de DynamoDB (quedarse con v2)
echo "1. Removiendo policy duplicada de DynamoDB..."
aws iam detach-user-policy \
  --user-name $USER_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess || true

echo "✅ Policy duplicada removida"
echo ""

# 2. Agregar permisos de Batch como inline policy
echo "2. Agregando permisos de Batch como inline policy..."
aws iam put-user-policy \
  --user-name $USER_NAME \
  --policy-name BatchDeploymentPermissions \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "BatchFullAccess",
        "Effect": "Allow",
        "Action": ["batch:*"],
        "Resource": "*"
      },
      {
        "Sid": "EC2ForBatch",
        "Effect": "Allow",
        "Action": [
          "ec2:CreateVpc",
          "ec2:CreateSubnet",
          "ec2:CreateInternetGateway",
          "ec2:CreateRouteTable",
          "ec2:CreateRoute",
          "ec2:CreateSecurityGroup",
          "ec2:AttachInternetGateway",
          "ec2:AssociateRouteTable",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:Describe*",
          "ec2:ModifyVpcAttribute",
          "ec2:DeleteVpc",
          "ec2:DeleteSubnet",
          "ec2:DeleteInternetGateway",
          "ec2:DeleteRouteTable",
          "ec2:DeleteSecurityGroup",
          "ec2:DetachInternetGateway",
          "ec2:DisassociateRouteTable",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress"
        ],
        "Resource": "*"
      },
      {
        "Sid": "ECSForBatch",
        "Effect": "Allow",
        "Action": ["ecs:*"],
        "Resource": "*"
      },
      {
        "Sid": "ECRForBatch",
        "Effect": "Allow",
        "Action": ["ecr:*"],
        "Resource": "*"
      }
    ]
  }'

echo "✅ Inline policy agregada"
echo ""

# 3. Verificar
echo "3. Verificando permisos..."
echo ""
echo "Managed policies adjuntas:"
aws iam list-attached-user-policies --user-name $USER_NAME --query 'AttachedPolicies[].PolicyName' --output table

echo ""
echo "Inline policies:"
aws iam list-user-policies --user-name $USER_NAME --output table

echo ""
echo "✅ ¡Listo! Ahora puedes hacer 'sam deploy'"
