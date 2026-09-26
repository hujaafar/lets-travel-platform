package com.travelplan.travel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.neo4j.driver.Driver;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.neo4j.Neo4jAutoConfiguration;
import org.springframework.boot.autoconfigure.neo4j.Neo4jProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.support.TestPropertySourceUtils;
import org.springframework.test.util.ReflectionTestUtils;

class Neo4jConfigurationTest {
  @Test
  void projectionUsesTheSameConfiguredDriverAsSpringHealthChecks() {
    new ApplicationContextRunner()
        .withInitializer(
            context ->
                TestPropertySourceUtils.addPropertiesFilesToEnvironment(
                    context, "classpath:application.properties"))
        .withPropertyValues(
            "NEO4J_PASSWORD=test-only-password",
            "NEO4J_USERNAME=graph-user",
            "NEO4J_URI=bolt+s://graph.internal:7687")
        .withConfiguration(AutoConfigurations.of(Neo4jAutoConfiguration.class))
        .withBean(Driver.class, () -> mock(Driver.class))
        .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
        .withBean(DestinationGraph.class)
        .run(
            context -> {
              assertThat(context).hasSingleBean(Driver.class);
              var properties = context.getBean(Neo4jProperties.class);
              assertThat(properties.getUri().toString()).isEqualTo("bolt+s://graph.internal:7687");
              assertThat(properties.getAuthentication().getUsername()).isEqualTo("graph-user");
              assertThat(properties.getAuthentication().getPassword())
                  .isEqualTo("test-only-password");
              assertThat(
                      ReflectionTestUtils.getField(
                          context.getBean(DestinationGraph.class), "driver"))
                  .isSameAs(context.getBean(Driver.class));
            });
  }
}
