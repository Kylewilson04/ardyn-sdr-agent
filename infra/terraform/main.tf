# Ardyn SDR Agent — Infrastructure as Code

# ── Provider ──────────────────────────────────────────────────────────────
provider "google" {
  project = "secure-path-487014-q3"
  region  = "us-west1"
}

# ── Service Account ───────────────────────────────────────────────────────
resource "google_service_account" "ardyn_sdr" {
  account_id   = "ardyn-sdr-agent"
  display_name = "Ardyn SDR Agent Runtime"
}

# ── Cloud Run — API Server ────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "api" {
  name     = "ardyn-sdr-api"
  location = "us-west1"
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.ardyn_sdr.email
    containers {
      image = "gcr.io/secure-path-487014-q3/ardyn-sdr-api:latest"
      ports {
        container_port = 8000
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql+asyncpg://${urlencode(google_sql_user.sdr.name)}:${urlencode(google_sql_user.sdr.password)}@/${google_sql_database.sdr.name}?host=/cloudsql/${google_sql_database_instance.sdr.connection_name}"
      }
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }
    }
    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }
  }

  depends_on = [google_project_service.cloudrun]
}

# ── Cloud Run — Web Frontend ─────────────────────────────────────────────
resource "google_cloud_run_v2_service" "web" {
  name     = "ardyn-sdr-web"
  location = "us-west1"

  template {
    containers {
      image = "gcr.io/secure-path-487014-q3/ardyn-sdr-web:latest"
      ports {
        container_port = 3000
      }
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = google_cloud_run_v2_service.api.uri
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [google_project_service.cloudrun]
}

# ── Cloud SQL — PostgreSQL ────────────────────────────────────────────────
resource "google_sql_database_instance" "sdr" {
  name             = "ardyn-sdr-db"
  database_version = "POSTGRES_16"
  region           = "us-west1"

  settings {
    tier              = "db-custom-2-4096"
    availability_type = "ZONAL"
    disk_size         = 50
    disk_type         = "PD_SSD"

    database_flags {
      name  = "cloudsql.enable_pgvector"
      value = "on"
    }

    backup_configuration {
      enabled = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled = false
    }
  }

  depends_on = [google_project_service.sqladmin]
}

resource "google_sql_database" "sdr" {
  name     = "ardyn_sdr"
  instance = google_sql_database_instance.sdr.name
}

resource "google_sql_user" "sdr" {
  name     = "ardyn"
  instance = google_sql_database_instance.sdr.name
  password = random_password.db.result
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# ── Cloud Memorystore — Redis ─────────────────────────────────────────────
resource "google_redis_instance" "sdr" {
  name           = "ardyn-sdr-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = "us-west1"

  depends_on = [google_project_service.redis]
}

# ── Required APIs ─────────────────────────────────────────────────────────
resource "google_project_service" "cloudrun" {
  service = "run.googleapis.com"
}

resource "google_project_service" "sqladmin" {
  service = "sqladmin.googleapis.com"
}

resource "google_project_service" "redis" {
  service = "redis.googleapis.com"
}

resource "google_project_service" "compute" {
  service = "compute.googleapis.com"
}

# ── Outputs ───────────────────────────────────────────────────────────────
output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "db_connection_name" {
  value     = google_sql_database_instance.sdr.connection_name
  sensitive = true
}