package org.openmetadata.service.secrets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Isolated;
import org.openmetadata.schema.entity.services.ingestionPipelines.IngestionPipeline;
import org.openmetadata.schema.entity.services.ingestionPipelines.PipelineType;
import org.openmetadata.schema.metadataIngestion.DatabaseServiceProfilerPipeline;
import org.openmetadata.schema.metadataIngestion.SourceConfig;
import org.openmetadata.service.fernet.Fernet;

@Isolated
class SecretsManagerNullCollectionElementTest {

  private InMemorySecretsManager vault;

  @BeforeEach
  void setUp() {
    Fernet.getInstance().setFernetKey("jJ/9sz0g0OHxsfxOoSfdFdmk3ysNmPRnH3TUAbz3IHA=");
    vault =
        new InMemorySecretsManager(
            new SecretsManager.SecretsConfig("null-element-test", "", List.of(), null));
  }

  @AfterEach
  void tearDown() {
    Fernet.getInstance().setFernetKey((String) null);
  }

  @Test
  void encryptIngestionPipelineToleratesNullCollectionElements() {
    IngestionPipeline pipeline = profilerPipelineWithNullMetrics();

    vault.encryptIngestionPipeline(pipeline);

    assertMetricsUnchanged(pipeline);
  }

  @Test
  void decryptIngestionPipelineToleratesNullCollectionElements() {
    IngestionPipeline pipeline = profilerPipelineWithNullMetrics();

    vault.decryptIngestionPipeline(pipeline);

    assertMetricsUnchanged(pipeline);
  }

  // The 20-null shape is built explicitly instead of relying on a fresh POJO's
  // generated initial value: what the generator emits for the metrics default
  // varies with the build shape (clean builds get MetricType.fromValue defaults,
  // incremental builds get nulls), so only an explicit null list reaches the
  // null-tolerant path under both variants.
  private static IngestionPipeline profilerPipelineWithNullMetrics() {
    DatabaseServiceProfilerPipeline config =
        new DatabaseServiceProfilerPipeline()
            .withMetrics(new ArrayList<>(Collections.nCopies(20, null)));
    return new IngestionPipeline()
        .withId(UUID.randomUUID())
        .withName("profiler-null-metrics")
        .withPipelineType(PipelineType.PROFILER)
        .withSourceConfig(new SourceConfig().withConfig(config));
  }

  private static void assertMetricsUnchanged(IngestionPipeline pipeline) {
    DatabaseServiceProfilerPipeline config =
        assertInstanceOf(
            DatabaseServiceProfilerPipeline.class, pipeline.getSourceConfig().getConfig());
    assertEquals(Collections.nCopies(20, null), config.getMetrics());
  }
}
