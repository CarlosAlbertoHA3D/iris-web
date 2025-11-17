# Optimized SageMaker TotalSegmentator Docker Image
# Target size: < 10GB uncompressed for Serverless

# Use a smaller base image with Python
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Install only essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-dev \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Upgrade pip
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA support (smaller than full NVIDIA image)
RUN pip3 install --no-cache-dir \
    torch==2.0.1 \
    torchvision==0.15.2 \
    --index-url https://download.pytorch.org/whl/cu118

# Install core dependencies in layers (for better caching)
RUN pip3 install --no-cache-dir \
    numpy==1.24.3 \
    nibabel==5.1.0

RUN pip3 install --no-cache-dir \
    scipy==1.11.1 \
    scikit-image==0.21.0

RUN pip3 install --no-cache-dir \
    SimpleITK==2.2.1 \
    nnunet==1.7.1

# Install TotalSegmentator (this will pull its dependencies)
RUN pip3 install --no-cache-dir TotalSegmentator==2.2.1

# Install lightweight open3d and other dependencies
RUN pip3 install --no-cache-dir \
    trimesh==3.23.5 \
    pymeshlab==2022.2.post4

# Install API dependencies for SageMaker
RUN pip3 install --no-cache-dir \
    boto3==1.28.85 \
    flask==2.3.3 \
    gunicorn==21.2.0 \
    gevent==23.9.1

# Clean up pip cache
RUN pip3 cache purge && \
    rm -rf /root/.cache/pip

# Copy inference code
COPY inference.py /opt/ml/code/inference.py
COPY mesh_processing.py /opt/ml/code/mesh_processing.py
COPY serve /opt/ml/code/serve

# Make serve script executable and ensure it is on PATH for SageMaker's default command
RUN chmod +x /opt/ml/code/serve \
    && ln -sf /opt/ml/code/serve /usr/local/bin/serve

# Set working directory
WORKDIR /opt/ml/code

# Set environment variables for SageMaker
ENV SAGEMAKER_PROGRAM=inference.py
ENV PATH="/opt/ml/code:${PATH}"

# Expose port for SageMaker
EXPOSE 8080

# Use serve script as entrypoint
ENTRYPOINT ["/opt/ml/code/serve"]
