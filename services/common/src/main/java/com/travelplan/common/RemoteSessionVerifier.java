package com.travelplan.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.web.client.RestClient;

@Configuration
@ConditionalOnProperty(name = "app.remote-auth", havingValue = "true")
public class RemoteSessionVerifier {
  @Bean
  SessionVerifier remoteVerifier(
      @Value("${app.auth-url}") String base, @Value("${app.service-key}") String key) {
    var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(3000);
    factory.setReadTimeout(5000);
    return createVerifier(RestClient.builder().baseUrl(base).requestFactory(factory), key);
  }

  static SessionVerifier createVerifier(RestClient.Builder builder, String key) {
    var client =
        builder
            .requestInterceptor(
                (request, body, execution) -> {
                  String id = org.slf4j.MDC.get("requestId");
                  if (id != null) request.getHeaders().set("X-Request-ID", id);
                  return execution.execute(request, body);
                })
            .build();
    return token ->
        client
            .post()
            .uri("/internal/session")
            .header("X-Service-Key", key)
            .body(java.util.Map.of("token", token))
            .retrieve()
            .body(SessionUser.class);
  }
}
