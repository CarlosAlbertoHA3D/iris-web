#!/bin/bash
set -e

# Configure custom domain for API Gateway with Route 53

REGION="us-east-1"
DOMAIN_NAME="api.iris-oculus.com"
HOSTED_ZONE_NAME="iris-oculus.com"
STACK_NAME="iris-oculus-backend"

echo "🌐 Configuring custom domain for API Gateway"

# Step 1: Get API Gateway ID
echo "🔍 Getting API Gateway ID..."
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text \
    --region ${REGION})
API_ID=$(echo $API_ENDPOINT | sed 's|https://||' | cut -d'.' -f1)

if [ -z "$API_ID" ]; then
    echo "❌ Error: Could not find API Gateway. Please deploy backend first."
    exit 1
fi

echo "✅ Found API Gateway: ${API_ID}"

# Step 2: Request or import SSL certificate in ACM
echo "🔐 Checking for SSL certificate..."
CERT_ARN=$(aws acm list-certificates \
    --region ${REGION} \
    --query "CertificateSummaryList[?DomainName=='${DOMAIN_NAME}'].CertificateArn" \
    --output text)

if [ -z "$CERT_ARN" ]; then
    echo "📜 Requesting new SSL certificate..."
    CERT_ARN=$(aws acm request-certificate \
        --domain-name ${DOMAIN_NAME} \
        --validation-method DNS \
        --region ${REGION} \
        --query CertificateArn \
        --output text)
    
    echo "⏳ Certificate requested: ${CERT_ARN}"
    echo "📧 Check your email to validate the certificate"
    echo "🔄 Or add DNS validation records in Route 53"
    echo ""
    echo "Run the following to get validation records:"
    echo "aws acm describe-certificate --certificate-arn ${CERT_ARN} --region ${REGION}"
    echo ""
    echo "After validation, re-run this script to continue."
    exit 0
else
    echo "✅ Found existing certificate: ${CERT_ARN}"
fi

# Step 3: Verify certificate is validated
CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn ${CERT_ARN} \
    --region ${REGION} \
    --query Certificate.Status \
    --output text)

if [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "⚠️  Certificate status: ${CERT_STATUS}"
    echo "Please validate the certificate first."
    exit 1
fi

# Step 4: Create custom domain in API Gateway
echo "🔧 Creating custom domain in API Gateway..."
aws apigatewayv2 create-domain-name \
    --domain-name ${DOMAIN_NAME} \
    --domain-name-configurations CertificateArn=${CERT_ARN} \
    --region ${REGION} || echo "Domain already exists"

# Step 5: Get API Gateway domain name for Route 53
API_DOMAIN=$(aws apigatewayv2 get-domain-name \
    --domain-name ${DOMAIN_NAME} \
    --region ${REGION} \
    --query DomainNameConfigurations[0].ApiGatewayDomainName \
    --output text)

echo "✅ API Gateway domain: ${API_DOMAIN}"

# Step 6: Create API mapping
echo "🔗 Creating API mapping..."
aws apigatewayv2 create-api-mapping \
    --domain-name ${DOMAIN_NAME} \
    --api-id ${API_ID} \
    --stage Prod \
    --region ${REGION} || echo "Mapping already exists"

# Step 7: Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id" \
    --output text | cut -d'/' -f3)

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo "❌ Error: Hosted zone not found for ${HOSTED_ZONE_NAME}"
    exit 1
fi

echo "✅ Found hosted zone: ${HOSTED_ZONE_ID}"

# Step 8: Create Route 53 record
echo "📝 Creating Route 53 A record..."
# Use Z1UJRXOUMOOFQ8 for us-east-1 API Gateway regional endpoints
cat > /tmp/route53-change.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN_NAME}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z1UJRXOUMOOFQ8",
          "DNSName": "${API_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
    --hosted-zone-id ${HOSTED_ZONE_ID} \
    --change-batch file:///tmp/route53-change.json

rm /tmp/route53-change.json

echo "✅ Custom domain configured successfully!"
echo ""
echo "🌐 Your API is now available at: https://${DOMAIN_NAME}"
echo "⏳ DNS propagation may take a few minutes"
echo ""
echo "Test with:"
echo "curl https://${DOMAIN_NAME}/healthz"
