ui = true
disable_mlock = true
storage "raft" {
 path = "/vault/file"
 node_id = "travel-plan-vault"
}
listener "tcp" {
 address = "0.0.0.0:8200"
 tls_cert_file = "/certs/tls.crt"
 tls_key_file = "/certs/tls.key"
}
api_addr = "https://vault:8200"
cluster_addr = "https://vault:8201"
