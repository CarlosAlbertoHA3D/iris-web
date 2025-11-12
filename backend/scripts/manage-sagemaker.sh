#!/bin/bash
set -e

# Manage SageMaker endpoint to save costs

ENDPOINT_NAME="iris-totalsegmentator-endpoint"
ENDPOINT_CONFIG_NAME="iris-totalsegmentator-config"
REGION="us-east-1"

function show_status() {
    echo "📊 Checking SageMaker endpoint status..."
    aws sagemaker describe-endpoint \
        --endpoint-name ${ENDPOINT_NAME} \
        --region ${REGION} \
        --query 'EndpointStatus' \
        --output text || echo "Endpoint not found"
}

function delete_endpoint() {
    echo "🛑 Deleting SageMaker endpoint to stop costs..."
    aws sagemaker delete-endpoint \
        --endpoint-name ${ENDPOINT_NAME} \
        --region ${REGION}
    echo "✅ Endpoint deleted. You won't be charged for compute."
    echo "💡 Model and config still exist. Run './manage-sagemaker.sh start' to recreate."
}

function start_endpoint() {
    echo "🚀 Starting SageMaker endpoint..."
    aws sagemaker create-endpoint \
        --endpoint-name ${ENDPOINT_NAME} \
        --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
        --region ${REGION}
    echo "✅ Endpoint creation initiated. This takes ~10 minutes."
    echo "📊 Monitor with: ./manage-sagemaker.sh status"
}

function show_help() {
    echo "Usage: ./manage-sagemaker.sh [command]"
    echo ""
    echo "Commands:"
    echo "  status  - Show endpoint status"
    echo "  stop    - Delete endpoint (stops billing)"
    echo "  start   - Recreate endpoint"
    echo "  help    - Show this help"
    echo ""
    echo "💡 Tip: Delete endpoint when not in use to avoid charges!"
}

case "$1" in
    status)
        show_status
        ;;
    stop)
        delete_endpoint
        ;;
    start)
        start_endpoint
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        show_help
        exit 1
        ;;
esac
