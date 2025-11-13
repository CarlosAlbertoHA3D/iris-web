# SageMaker TotalSegmentator Docker Image
FROM nvcr.io/nvidia/pytorch:23.10-py3

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi==0.110.0 \
    uvicorn==0.24.0 \
    numpy>=1.24 \
    nibabel>=5.1 \
    scikit-image>=0.21 \
    open3d>=0.17 \
    TotalSegmentator>=2.2.1 \
    boto3>=1.28.0 \
    sagemaker-inference

# Copy inference code
COPY inference.py /opt/ml/code/inference.py
COPY mesh_processing.py /opt/ml/code/mesh_processing.py

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SAGEMAKER_PROGRAM=inference.py

WORKDIR /opt/ml/code

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:8080/ping || exit 1
