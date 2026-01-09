# Deployment Guide

Comprehensive guide for deploying Impact Database to production environments across different cloud providers and container orchestration platforms.

## Table of Contents

- [Pre-deployment Checklist](#pre-deployment-checklist)
- [Architecture Overview](#architecture-overview)
- [AWS Deployment](#aws-deployment)
- [GCP Deployment](#gcp-deployment)
- [Azure Deployment](#azure-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Docker Swarm Deployment](#docker-swarm-deployment)
- [Environment Configuration](#environment-configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Scaling Strategies](#scaling-strategies)

---

## Pre-deployment Checklist

### Security

- [ ] All secrets stored in secure vault (not in .env files)
- [ ] SSL/TLS certificates configured
- [ ] Database credentials rotated from defaults
- [ ] MinIO/S3 access keys generated
- [ ] JWT secret generated (256-bit minimum)
- [ ] CORS origins restricted to production domains
- [ ] Rate limiting enabled
- [ ] CSRF protection enabled
- [ ] Security headers configured

### Configuration

- [ ] Environment variables reviewed
- [ ] Database connection pooling configured
- [ ] Redis cache configured
- [ ] Object storage configured (S3/MinIO)
- [ ] Email service configured (SMTP/SendGrid)
- [ ] Monitoring tools configured (Sentry/Prometheus)
- [ ] Log aggregation configured
- [ ] Backup strategy defined

### Performance

- [ ] Database indexes created
- [ ] CDN configured for static assets
- [ ] Image thumbnails pre-generated
- [ ] Caching strategy implemented
- [ ] Connection pooling optimized
- [ ] Worker processes scaled appropriately

### Testing

- [ ] Load testing completed
- [ ] Security scanning passed
- [ ] Smoke tests passing
- [ ] Health checks configured
- [ ] Rollback plan documented

---

## Architecture Overview

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────┐
│ Load        │
│ Balancer    │
└──────┬──────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│  Frontend  │ │  Frontend  │ │  Frontend  │
│ (Next.js)  │ │ (Next.js)  │ │ (Next.js)  │
└──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       │              │              │
       └──────┬───────┴──────┬───────┘
              │ HTTP         │
              ▼              │
       ┌─────────────┐       │
       │   API       │       │
       │   Server    │◄──────┘
       │  (FastAPI)  │
       └──────┬──────┘
              │
       ┌──────┴──────┬──────────────┐
       ▼             ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ PostgreSQL │ │   Redis    │ │   MinIO    │
│  (PostGIS) │ │  (Cache)   │ │ (Storage)  │
└────────────┘ └────────────┘ └────────────┘
       │
       ▼
┌────────────┐
│  Backups   │
└────────────┘
```

---

## AWS Deployment

### Option 1: ECS (Elastic Container Service) - Recommended

#### Prerequisites

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
```

#### 1. Create ECR Repositories

```bash
# Create repositories for each service
aws ecr create-repository --repository-name impact-db/frontend
aws ecr create-repository --repository-name impact-db/backend

# Get login command
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
```

#### 2. Build and Push Images

```bash
# Build images
docker build -t impact-db/frontend:latest ./frontend
docker build -t impact-db/backend:latest ./app

# Tag for ECR
docker tag impact-db/frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/frontend:latest
docker tag impact-db/backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/backend:latest

# Push to ECR
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/frontend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/backend:latest
```

#### 3. Set Up RDS (PostgreSQL)

```bash
# Create RDS PostgreSQL instance with PostGIS
aws rds create-db-instance \
  --db-instance-identifier impact-db-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 14.7 \
  --master-username postgres \
  --master-user-password <secure-password> \
  --allocated-storage 100 \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name my-db-subnet-group \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "Mon:04:00-Mon:05:00" \
  --storage-encrypted \
  --enable-performance-insights

# Install PostGIS extension
psql -h <rds-endpoint> -U postgres -d impact_db -c "CREATE EXTENSION postgis;"
```

#### 4. Set Up ElastiCache (Redis)

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id impact-db-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --cache-subnet-group-name my-cache-subnet-group \
  --security-group-ids sg-xxxxx \
  --snapshot-retention-limit 5
```

#### 5. Set Up S3 for Object Storage

```bash
# Create S3 bucket
aws s3api create-bucket \
  --bucket impact-db-images-prod \
  --region us-east-1 \
  --acl private

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket impact-db-images-prod \
  --versioning-configuration Status=Enabled

# Configure lifecycle policy
aws s3api put-bucket-lifecycle-configuration \
  --bucket impact-db-images-prod \
  --lifecycle-configuration file://s3-lifecycle.json
```

`s3-lifecycle.json`:
```json
{
  "Rules": [
    {
      "Id": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    },
    {
      "Id": "TransitionToGlacier",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 180,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

#### 6. Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name impact-db-prod
```

#### 7. Create Task Definitions

`frontend-task-definition.json`:
```json
{
  "family": "impact-db-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/frontend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NEXT_PUBLIC_API_URL",
          "value": "https://api.impactdb.org"
        }
      ],
      "secrets": [
        {
          "name": "SENTRY_DSN",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxx:secret:frontend-secrets"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/impact-db-frontend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

`backend-task-definition.json`:
```json
{
  "family": "impact-db-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/impact-db/backend:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENVIRONMENT",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxx:secret:db-url"
        },
        {
          "name": "REDIS_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxx:secret:redis-url"
        },
        {
          "name": "AWS_ACCESS_KEY_ID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxx:secret:aws-keys:access-key"
        },
        {
          "name": "AWS_SECRET_ACCESS_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxx:secret:aws-keys:secret-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/impact-db-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register task definitions:
```bash
aws ecs register-task-definition --cli-input-json file://frontend-task-definition.json
aws ecs register-task-definition --cli-input-json file://backend-task-definition.json
```

#### 8. Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name impact-db-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

# Create target groups
aws elbv2 create-target-group \
  --name impact-db-frontend-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path / \
  --health-check-interval-seconds 30

aws elbv2 create-target-group \
  --name impact-db-backend-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30

# Create listeners
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=<acm-cert-arn> \
  --default-actions Type=forward,TargetGroupArn=<frontend-tg-arn>

# Add path-based routing for API
aws elbv2 create-rule \
  --listener-arn <listener-arn> \
  --priority 1 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=<backend-tg-arn>
```

#### 9. Create ECS Services

```bash
# Frontend service
aws ecs create-service \
  --cluster impact-db-prod \
  --service-name frontend \
  --task-definition impact-db-frontend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=<frontend-tg-arn>,containerName=frontend,containerPort=3000

# Backend service
aws ecs create-service \
  --cluster impact-db-prod \
  --service-name backend \
  --task-definition impact-db-backend \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=<backend-tg-arn>,containerName=backend,containerPort=8000
```

#### 10. Set Up Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/impact-db-prod/backend \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/impact-db-prod/backend \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

`scaling-policy.json`:
```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 120
}
```

### Option 2: EC2 + Docker Compose

#### 1. Launch EC2 Instance

```bash
# Launch Ubuntu 22.04 instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.large \
  --key-name my-keypair \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=impact-db-prod}]'
```

#### 2. Install Docker

```bash
ssh ubuntu@<instance-ip>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 3. Deploy Application

```bash
# Clone repository
git clone https://github.com/kishkumar96/impact-database.git
cd impact-database

# Create .env file
nano .env
# Add production environment variables

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f
```

---

## GCP Deployment

### Option 1: Cloud Run (Serverless) - Recommended

#### 1. Setup GCP Project

```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Set project
gcloud config set project impact-db-prod
```

#### 2. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

#### 3. Create Cloud SQL Instance

```bash
gcloud sql instances create impact-db-prod \
  --database-version=POSTGRES_14 \
  --tier=db-custom-2-7680 \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=100GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=4

# Create database
gcloud sql databases create impact_db --instance=impact-db-prod

# Install PostGIS
gcloud sql connect impact-db-prod --user=postgres
CREATE EXTENSION postgis;
```

#### 4. Create Cloud Storage Bucket

```bash
gsutil mb -p impact-db-prod -c STANDARD -l us-central1 gs://impact-db-images-prod/

# Set lifecycle policy
gsutil lifecycle set gs-lifecycle.json gs://impact-db-images-prod/
```

#### 5. Build and Deploy Frontend

```bash
cd frontend

# Build image with Cloud Build
gcloud builds submit --tag gcr.io/impact-db-prod/frontend

# Deploy to Cloud Run
gcloud run deploy frontend \
  --image gcr.io/impact-db-prod/frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_URL=https://api-xxxxxx-uc.a.run.app \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 80
```

#### 6. Build and Deploy Backend

```bash
cd app

# Build image
gcloud builds submit --tag gcr.io/impact-db-prod/backend

# Deploy to Cloud Run
gcloud run deploy backend \
  --image gcr.io/impact-db-prod/backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances impact-db-prod:us-central1:impact-db-prod \
  --set-env-vars DATABASE_URL=postgresql://... \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 20 \
  --concurrency 100 \
  --timeout 300
```

#### 7. Set Up Load Balancer

```bash
# Create backend services
gcloud compute backend-services create frontend-backend \
  --global \
  --load-balancing-scheme=EXTERNAL \
  --protocol=HTTP

gcloud compute backend-services create backend-backend \
  --global \
  --load-balancing-scheme=EXTERNAL \
  --protocol=HTTP

# Create URL map
gcloud compute url-maps create impact-db-lb \
  --default-service frontend-backend

# Add path matcher for API
gcloud compute url-maps add-path-matcher impact-db-lb \
  --path-matcher-name=api-matcher \
  --default-service=frontend-backend \
  --path-rules="/api/*=backend-backend"

# Create SSL certificate
gcloud compute ssl-certificates create impact-db-cert \
  --domains=impactdb.org,www.impactdb.org

# Create HTTPS proxy
gcloud compute target-https-proxies create impact-db-https-proxy \
  --ssl-certificates=impact-db-cert \
  --url-map=impact-db-lb

# Create forwarding rule
gcloud compute forwarding-rules create impact-db-https-rule \
  --global \
  --target-https-proxy=impact-db-https-proxy \
  --ports=443
```

---

## Azure Deployment

### Option 1: Azure Container Apps - Recommended

#### 1. Setup Azure CLI

```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login
az login

# Create resource group
az group create --name impact-db-rg --location eastus
```

#### 2. Create Azure Database for PostgreSQL

```bash
az postgres flexible-server create \
  --name impact-db-prod \
  --resource-group impact-db-rg \
  --location eastus \
  --admin-user adminuser \
  --admin-password <secure-password> \
  --sku-name Standard_D2s_v3 \
  --tier GeneralPurpose \
  --storage-size 128 \
  --version 14 \
  --backup-retention 7 \
  --geo-redundant-backup Enabled

# Create database
az postgres flexible-server db create \
  --resource-group impact-db-rg \
  --server-name impact-db-prod \
  --database-name impact_db

# Install PostGIS
psql "host=impact-db-prod.postgres.database.azure.com port=5432 dbname=impact_db user=adminuser password=<password> sslmode=require" -c "CREATE EXTENSION postgis;"
```

#### 3. Create Azure Cache for Redis

```bash
az redis create \
  --name impact-db-redis \
  --resource-group impact-db-rg \
  --location eastus \
  --sku Standard \
  --vm-size c1 \
  --enable-non-ssl-port false
```

#### 4. Create Azure Storage Account

```bash
az storage account create \
  --name impactdbstorage \
  --resource-group impact-db-rg \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2

# Create container
az storage container create \
  --name images \
  --account-name impactdbstorage \
  --public-access off
```

#### 5. Create Container Registry

```bash
az acr create \
  --name impactdbregistry \
  --resource-group impact-db-rg \
  --sku Standard \
  --admin-enabled true

# Login to ACR
az acr login --name impactdbregistry
```

#### 6. Build and Push Images

```bash
# Build and push frontend
docker build -t impactdbregistry.azurecr.io/frontend:latest ./frontend
docker push impactdbregistry.azurecr.io/frontend:latest

# Build and push backend
docker build -t impactdbregistry.azurecr.io/backend:latest ./app
docker push impactdbregistry.azurecr.io/backend:latest
```

#### 7. Create Container Apps Environment

```bash
az containerapp env create \
  --name impact-db-env \
  --resource-group impact-db-rg \
  --location eastus
```

#### 8. Deploy Container Apps

```bash
# Deploy backend
az containerapp create \
  --name backend \
  --resource-group impact-db-rg \
  --environment impact-db-env \
  --image impactdbregistry.azurecr.io/backend:latest \
  --target-port 8000 \
  --ingress external \
  --min-replicas 2 \
  --max-replicas 10 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars \
    DATABASE_URL=secretref:db-url \
    REDIS_URL=secretref:redis-url \
  --secrets \
    db-url=postgresql://... \
    redis-url=redis://...

# Deploy frontend
az containerapp create \
  --name frontend \
  --resource-group impact-db-rg \
  --environment impact-db-env \
  --image impactdbregistry.azurecr.io/frontend:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 2.0Gi \
  --env-vars \
    NEXT_PUBLIC_API_URL=https://backend.xxxxx.azurecontainerapps.io
```

---

## Kubernetes Deployment

### Prerequisites

```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Kubernetes Manifests

`k8s/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: impact-db
```

`k8s/secrets.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: impact-db-secrets
  namespace: impact-db
type: Opaque
stringData:
  database-url: postgresql://postgres:password@postgres:5432/impact_db
  redis-url: redis://redis:6379/0
  jwt-secret: <generate-secure-secret>
  minio-access-key: minioadmin
  minio-secret-key: minioadmin
```

`k8s/configmap.yaml`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: impact-db-config
  namespace: impact-db
data:
  ENVIRONMENT: "production"
  DEBUG: "false"
  ALLOWED_HOSTS: "*"
```

`k8s/backend-deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: impact-db
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: your-registry/impact-db-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: impact-db-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: impact-db-secrets
              key: redis-url
        envFrom:
        - configMapRef:
            name: impact-db-config
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: impact-db
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

`k8s/frontend-deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: impact-db
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: your-registry/impact-db-frontend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "https://api.impactdb.org"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: impact-db
spec:
  selector:
    app: frontend
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

`k8s/ingress.yaml`:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: impact-db-ingress
  namespace: impact-db
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - impactdb.org
    - api.impactdb.org
    secretName: impact-db-tls
  rules:
  - host: impactdb.org
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 3000
  - host: api.impactdb.org
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8000
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets (use sealed-secrets in production)
kubectl apply -f k8s/secrets.yaml

# Create config
kubectl apply -f k8s/configmap.yaml

# Deploy applications
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

# Setup ingress
kubectl apply -f k8s/ingress.yaml

# Check status
kubectl get pods -n impact-db
kubectl get services -n impact-db
kubectl get ingress -n impact-db
```

---

## Docker Swarm Deployment

```bash
# Initialize swarm
docker swarm init

# Create secrets
echo "postgresql://..." | docker secret create db_url -
echo "redis://..." | docker secret create redis_url -

# Deploy stack
docker stack deploy -c docker-compose.prod.yml impact-db

# Check services
docker service ls
docker service logs impact-db_backend

# Scale services
docker service scale impact-db_backend=5
```

---

## Environment Configuration

### Production .env Template

```bash
# Application
ENVIRONMENT=production
DEBUG=false
PROJECT_NAME="Impact Database"
VERSION=1.0.0

# Database
DATABASE_URL=postgresql://user:pass@host:5432/impact_db
SQLALCHEMY_POOL_SIZE=20
SQLALCHEMY_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://redis:6379/0

# Object Storage (S3/MinIO)
USE_MINIO=false  # false for S3, true for MinIO
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_REGION=us-east-1
MINIO_BUCKET_NAME=impact-images

# Security
JWT_SECRET=<256-bit-secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=["https://impactdb.org"]

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_ENABLE_TRACING=true

# Email (Optional)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid-api-key>
SMTP_FROM=noreply@impactdb.org
```

---

## SSL/TLS Setup

### Using Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d impactdb.org -d www.impactdb.org

# Auto-renewal
sudo certbot renew --dry-run
```

### Using AWS Certificate Manager

```bash
# Request certificate
aws acm request-certificate \
  --domain-name impactdb.org \
  --subject-alternative-names www.impactdb.org \
  --validation-method DNS
```

---

## Monitoring & Logging

### Prometheus + Grafana

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### CloudWatch (AWS)

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

---

## Backup & Disaster Recovery

### Database Backups

```bash
# Automated backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U postgres impact_db | gzip > /backups/impact_db_$TIMESTAMP.sql.gz

# Retention: keep last 30 days
find /backups -name "impact_db_*.sql.gz" -mtime +30 -delete
```

### S3 Sync for Media Files

```bash
# Sync to backup bucket
aws s3 sync s3://impact-db-images-prod s3://impact-db-images-backup --storage-class GLACIER
```

---

## Scaling Strategies

### Horizontal Scaling

- Frontend: 2-10 instances based on traffic
- Backend: 3-20 instances with load balancer
- Database: Read replicas for query distribution

### Vertical Scaling

- Database: Upgrade to larger instance types
- Redis: Increase memory allocation
- Containers: Increase CPU/memory limits

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_images_location ON images USING GIST (location);
CREATE INDEX idx_images_hazard ON images(hazard_type);
CREATE INDEX idx_images_upload_date ON images(upload_date DESC);

-- Partitioning for large tables
CREATE TABLE images_2024 PARTITION OF images
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

---

*For detailed operational procedures, see [RUNBOOK.md](RUNBOOK.md)*

*Last updated: January 2026*
