# AWS Batch TotalSegmentator Docker Image
# Optimized for spot instances with GPU

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Install essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-dev \
    build-essential \
    gcc \
    g++ \
    wget \
    ca-certificates \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Upgrade pip
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA support
RUN pip3 install --no-cache-dir \
    torch==2.0.1 \
    torchvision==0.15.2 \
    --index-url https://download.pytorch.org/whl/cu118

# Install core dependencies
RUN pip3 install --no-cache-dir \
    numpy==1.24.3 \
    nibabel==5.1.0 \
    scipy==1.11.1 \
    scikit-image==0.21.0 \
    SimpleITK==2.2.1 \
    nnunet==1.7.1

# Install TotalSegmentator
RUN pip3 install --no-cache-dir TotalSegmentator==2.2.1

# Install mesh processing libraries
RUN pip3 install --no-cache-dir \
    trimesh==3.23.5 \
    open3d==0.17.0

# Install AWS SDK
RUN pip3 install --no-cache-dir \
    boto3==1.28.85

# Clean up pip cache
RUN pip3 cache purge && \
    rm -rf /root/.cache/pip

# Copy processing code
COPY batch_processor.py /app/batch_processor.py
COPY mesh_processing.py /app/mesh_processing.py

# Set working directory
WORKDIR /app

# Entrypoint
ENTRYPOINT ["python3", "/app/batch_processor.py"]
