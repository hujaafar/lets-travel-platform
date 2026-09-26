vault { address = "https://vault:8200"
  ca_cert = "/certs/ca.crt"
}
auto_auth {
  method "approle" { config = { role_id_file_path = "/approle/role-id", secret_id_file_path = "/approle/secret-id", remove_secret_id_file_after_reading = false } }
  sink "file" { config = { path = "/tmp/token" } }
}
template {
  source = "/config/payments.ctmpl"
  destination = "/runtime/application.properties"
  perms = "0644"
}
